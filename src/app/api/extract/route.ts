import { NextRequest, NextResponse } from 'next/server';
import { cloudVisionDetectText } from '@/lib/cloudVision';
import {
  llmExtractFromText,
  llmExtractFromImage,
  DEFAULT_GEMINI_MODEL,
} from '@/lib/llmExtract';
import type {
  ExtractPipeline,
  ExtractResponse,
} from '@/scanner/ExtractedContact';

// Reuse a simple in-memory rate limit, matching /api/ocr.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

interface ExtractBody {
  image?: string;
  mode?: 'badge' | 'card';
  pipeline?: ExtractPipeline;
  model?: string;
  mimeType?: string;
}

/**
 * POST /api/extract
 *
 * Body: { image (base64 or data URL), mode, pipeline, model? }
 *  - pipeline "A": Cloud Vision text detection, then LLM extraction.
 *  - pipeline "B": multimodal LLM extraction directly from the image.
 *
 * Returns an ExtractResponse (contact fields plus _meta).
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: ExtractBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const image = body.image;
  const mode = body.mode === 'card' ? 'card' : 'badge';
  const pipeline: ExtractPipeline = body.pipeline === 'B' ? 'B' : 'A';
  const mimeType = body.mimeType || 'image/jpeg';
  const model = body.model || DEFAULT_GEMINI_MODEL;

  if (!image || typeof image !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: image (base64 string).' },
      { status: 400 },
    );
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const visionApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!geminiApiKey) {
    return NextResponse.json(
      {
        error:
          'Extraction LLM not configured. Set GEMINI_API_KEY (Generative Language API).',
      },
      { status: 503 },
    );
  }

  const t0 = Date.now();

  try {
    if (pipeline === 'A') {
      if (!visionApiKey) {
        return NextResponse.json(
          {
            error:
              'Pipeline A needs Cloud Vision. Set GOOGLE_CLOUD_VISION_API_KEY or use pipeline B.',
          },
          { status: 503 },
        );
      }
      const vision = await cloudVisionDetectText(image, visionApiKey);
      const { contact, provider, model: usedModel } = await llmExtractFromText(
        vision.text,
        mode,
        { provider: 'gemini', model, geminiApiKey },
      );

      const result: ExtractResponse = {
        ...contact,
        _meta: {
          pipeline: 'A',
          provider,
          model: usedModel,
          latencyMs: Date.now() - t0,
          ocrText: vision.text,
          ocrConfidence: vision.confidence,
        },
      };
      return NextResponse.json(result);
    }

    // Pipeline B: multimodal.
    const { contact, provider, model: usedModel } = await llmExtractFromImage(
      image,
      mimeType,
      mode,
      { provider: 'gemini', model, geminiApiKey },
    );

    const result: ExtractResponse = {
      ...contact,
      _meta: {
        pipeline: 'B',
        provider,
        model: usedModel,
        latencyMs: Date.now() - t0,
      },
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/extract] error:', message);
    return NextResponse.json(
      { error: 'Extraction failed.', details: message },
      { status: 502 },
    );
  }
}
