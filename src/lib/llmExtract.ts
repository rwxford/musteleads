/**
 * LLM structured extraction. Turns either OCR text (Pipeline A) or
 * a raw image (Pipeline B, multimodal) into a strict
 * `ExtractedContact` JSON object.
 *
 * Default provider is Google Gemini (gemini-2.0-flash), chosen for
 * lowest cost and because it reuses the same Google Cloud project
 * as Cloud Vision. OpenAI (gpt-4o-mini) is selectable as a fallback
 * provider.
 *
 * The brittle heuristic classifier this replaces lived in
 * CardOCRProcessor / BadgeOCRFallback. Field classification is now
 * the model's job, constrained by a response schema, so badge
 * layout variance no longer breaks parsing.
 */

import type { ExtractedContact } from '@/scanner/ExtractedContact';
import { EMPTY_CONTACT } from '@/scanner/ExtractedContact';

export type LLMProvider = 'gemini' | 'openai';

export interface LLMExtractOptions {
  provider?: LLMProvider;
  model?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = [
  'You extract structured contact data from a single conference attendee',
  'BADGE or a BUSINESS CARD. Return only the requested fields.',
  '',
  'Rules:',
  '- The person name is usually the largest text. On badges it is often all',
  '  caps. Output names in normal proper case. Example: "ROSS WEATHERFORD"',
  '  becomes firstName "Ross" and lastName "Weatherford".',
  '- company is the attendee employer or organization, never the event.',
  '- eventName is the conference or event branding printed on a badge, for',
  '  example "Space Symposium" or "Red Hat Summit". Business cards usually',
  '  have no event, so return "" for eventName in that case.',
  '- title is the job title or role.',
  '- email, phone, and linkedIn only when explicitly present, otherwise "".',
  '- Never invent values. If a field is not present, return an empty string.',
  '- confidence is your overall confidence from 0.0 to 1.0 that the whole',
  '  extraction is correct.',
].join('\n');

// Gemini and OpenAI both accept an OpenAPI style schema. Gemini uses
// uppercase type names in its Schema proto JSON.
const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    firstName: { type: 'STRING' },
    lastName: { type: 'STRING' },
    company: { type: 'STRING' },
    title: { type: 'STRING' },
    email: { type: 'STRING' },
    phone: { type: 'STRING' },
    linkedIn: { type: 'STRING' },
    eventName: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: [
    'firstName',
    'lastName',
    'company',
    'title',
    'email',
    'phone',
    'linkedIn',
    'eventName',
    'confidence',
  ],
  propertyOrdering: [
    'firstName',
    'lastName',
    'company',
    'title',
    'email',
    'phone',
    'linkedIn',
    'eventName',
    'confidence',
  ],
};

function userPromptForText(text: string, mode: 'badge' | 'card'): string {
  const kind = mode === 'card' ? 'business card' : 'conference badge';
  return [
    `The following OCR text was extracted from a ${kind}.`,
    'Extract the contact fields per the rules.',
    '',
    'OCR TEXT:',
    text,
  ].join('\n');
}

function userPromptForImage(mode: 'badge' | 'card'): string {
  const kind = mode === 'card' ? 'business card' : 'conference badge';
  return [
    `This image is a ${kind}.`,
    'Read it and extract the contact fields per the rules.',
  ].join('\n');
}

/**
 * Coerce arbitrary parsed JSON into a clean ExtractedContact with
 * every field present as a string and confidence clamped to 0..1.
 */
function normalizeContact(raw: unknown): ExtractedContact {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();

  let confidence = 0;
  if (typeof obj.confidence === 'number') confidence = obj.confidence;
  else if (typeof obj.confidence === 'string') {
    const n = parseFloat(obj.confidence);
    if (!Number.isNaN(n)) confidence = n;
  }
  if (confidence > 1) confidence = confidence / 100;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    ...EMPTY_CONTACT,
    firstName: str(obj.firstName),
    lastName: str(obj.lastName),
    company: str(obj.company),
    title: str(obj.title),
    email: str(obj.email),
    phone: str(obj.phone),
    linkedIn: str(obj.linkedIn),
    eventName: str(obj.eventName),
    confidence,
  };
}

/** Parse a JSON object out of a model response, tolerating code fences. */
function parseJsonObject(textResponse: string): unknown {
  const trimmed = textResponse.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip ```json ... ``` fences or find the first {...} block.
    const fenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '');
    try {
      return JSON.parse(fenced.trim());
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
      throw new Error('Model did not return valid JSON.');
    }
  }
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function geminiGenerate(
  parts: GeminiPart[],
  model: string,
  apiKey: string,
): Promise<ExtractedContact> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const textResponse: string =
    data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('') || '';
  if (!textResponse) {
    throw new Error('Gemini returned an empty response.');
  }
  return normalizeContact(parseJsonObject(textResponse));
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

async function openaiGenerate(
  content: OpenAIContentPart[],
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<ExtractedContact> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const textResponse: string = data.choices?.[0]?.message?.content || '';
  if (!textResponse) {
    throw new Error('OpenAI returned an empty response.');
  }
  return normalizeContact(parseJsonObject(textResponse));
}

/**
 * Pipeline A second stage: extract fields from OCR text.
 */
export async function llmExtractFromText(
  text: string,
  mode: 'badge' | 'card',
  opts: LLMExtractOptions = {},
): Promise<{ contact: ExtractedContact; provider: LLMProvider; model: string }> {
  const provider = opts.provider ?? 'gemini';
  if (provider === 'openai') {
    const model = opts.model ?? DEFAULT_OPENAI_MODEL;
    if (!opts.openaiApiKey) throw new Error('OPENAI_API_KEY not configured.');
    const contact = await openaiGenerate(
      [{ type: 'text', text: userPromptForText(text, mode) }],
      model,
      opts.openaiApiKey,
      opts.openaiBaseUrl ?? 'https://api.openai.com/v1',
    );
    return { contact, provider, model };
  }

  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  if (!opts.geminiApiKey) throw new Error('GEMINI_API_KEY not configured.');
  const contact = await geminiGenerate(
    [{ text: userPromptForText(text, mode) }],
    model,
    opts.geminiApiKey,
  );
  return { contact, provider, model };
}

/**
 * Pipeline B: extract fields directly from an image (multimodal).
 */
export async function llmExtractFromImage(
  base64Image: string,
  mimeType: string,
  mode: 'badge' | 'card',
  opts: LLMExtractOptions = {},
): Promise<{ contact: ExtractedContact; provider: LLMProvider; model: string }> {
  const base64Content = base64Image.includes(',')
    ? base64Image.split(',')[1]
    : base64Image;

  const provider = opts.provider ?? 'gemini';
  if (provider === 'openai') {
    const model = opts.model ?? DEFAULT_OPENAI_MODEL;
    if (!opts.openaiApiKey) throw new Error('OPENAI_API_KEY not configured.');
    const dataUrl = `data:${mimeType};base64,${base64Content}`;
    const contact = await openaiGenerate(
      [
        { type: 'text', text: userPromptForImage(mode) },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
      model,
      opts.openaiApiKey,
      opts.openaiBaseUrl ?? 'https://api.openai.com/v1',
    );
    return { contact, provider, model };
  }

  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  if (!opts.geminiApiKey) throw new Error('GEMINI_API_KEY not configured.');
  const contact = await geminiGenerate(
    [
      { text: userPromptForImage(mode) },
      { inlineData: { mimeType, data: base64Content } },
    ],
    model,
    opts.geminiApiKey,
  );
  return { contact, provider, model };
}
