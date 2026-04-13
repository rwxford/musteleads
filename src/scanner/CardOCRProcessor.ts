/**
 * Processes a business-card image through OCR and extracts
 * structured contact data using ContactExtractor heuristics.
 */

import type { ParsedContact } from './VCardParser';
import { recognizeImage } from './OCREngine';
import {
  extractEmails,
  extractPhones,
  extractUrls,
  isLikelyJobTitle,
  isLikelyCompany,
  isGarbageLine,
  isEventBranding,
  isLikelyName,
  cleanOCRLine,
  extractEventName,
} from './ContactExtractor';


export interface CardOCRResult {
  contact: ParsedContact;
  rawText: string;
  confidence: number;
  eventName?: string;
}

/**
 * Process a business card image through OCR and extract structured
 * contact data.
 *
 * Strategy:
 * 1. Run Tesseract OCR on the image.
 * 2. Filter garbage and event branding lines.
 * 3. Extract emails and phones via regex (highest confidence).
 * 4. Identify company name (lines matching company patterns, or
 *    short ALL-CAPS lines).
 * 5. Identify job title (lines matching title keywords).
 * 6. Remaining prominent line(s) with 2-3 words = person name.
 */
export async function processCardImage(
  imageBlob: Blob,
): Promise<CardOCRResult> {
  const ocr = await recognizeImage(imageBlob);

  const contact: ParsedContact = {};

  if (!ocr.text) {
    return { contact, rawText: '', confidence: ocr.confidence };
  }

  const fullText = ocr.text;

  // ── Extract event name before filtering branding lines ───────
  const eventName = extractEventName(ocr.lines);

  // ── Clean, filter garbage and branding lines ─────────────────
  const cleanLines = ocr.lines
    .map(cleanOCRLine)
    .filter((line) => line.length > 0 && !isGarbageLine(line) && !isEventBranding(line));

  // ── High-confidence regex fields ──────────────────────────────
  const emails = extractEmails(fullText);
  if (emails.length > 0) {
    contact.email = emails[0];
  }

  const phones = extractPhones(fullText);
  if (phones.length > 0) {
    contact.phone = phones[0];
  }

  const urls = extractUrls(fullText);
  if (urls.length > 0) {
    contact.url = urls[0];
  }

  // ── Classify each line ────────────────────────────────────────
  // Track which lines are "consumed" by a structured field so the
  // remainder can be used for name detection.
  const consumed = new Set<number>();

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];

    // Skip lines that are just an email, phone, or URL.
    if (lineIsEmailOrPhoneOrUrl(line)) {
      consumed.add(i);
      continue;
    }

    // Company detection — explicit keywords or short ALL-CAPS
    // line (1-3 words, all caps, not a title keyword).
    if (!contact.company) {
      if (isLikelyCompany(line)) {
        contact.company = line;
        consumed.add(i);
        continue;
      }
      const words = line.trim().split(/\s+/);
      if (
        words.length >= 1 &&
        words.length <= 3 &&
        line === line.toUpperCase() &&
        /^[A-Z\s]+$/.test(line.trim()) &&
        !isLikelyJobTitle(line)
      ) {
        contact.company = line.trim();
        consumed.add(i);
        continue;
      }
    }

    // Title detection.
    if (!contact.title && isLikelyJobTitle(line)) {
      contact.title = line;
      consumed.add(i);
      continue;
    }
  }

  // ── Name detection ────────────────────────────────────────────
  // Prefer lines that look like a person's name. Badges often
  // split first/last across two lines, so we merge consecutive
  // single-word name candidates before choosing.
  const nameCandidates = cleanLines.filter(
    (_, i) => !consumed.has(i),
  );

  const likelyNames = nameCandidates.filter((c) => isLikelyName(c));

  // Merge consecutive single-word name lines (e.g., "Ross" +
  // "Weatherford" on a badge become "Ross Weatherford").
  const mergedNames = mergeConsecutiveNameLines(likelyNames, cleanLines, consumed);

  if (mergedNames.length > 0) {
    // Pick the longest match — usually the full name.
    const best = mergedNames.reduce((a, b) =>
      a.length >= b.length ? a : b,
    );
    const words = best.split(/\s+/).filter(Boolean);
    contact.firstName = words[0];
    contact.lastName = words.slice(1).join(' ') || undefined;
    contact.fullName = best;
  } else {
    // Fallback: first unconsumed line with 1+ words.
    for (const candidate of nameCandidates) {
      const words = candidate.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        contact.firstName = words[0];
        contact.lastName = words.slice(1).join(' ');
        contact.fullName = candidate;
        break;
      }
      if (words.length === 1) {
        // Single word with no other name lines — treat as
        // firstName so the user only has to fill in lastName.
        contact.firstName = words[0];
        contact.fullName = words[0];
        break;
      }
    }
  }

  return { contact, rawText: fullText, confidence: ocr.confidence, eventName };
}

// ── Helpers ──────────────────────────────────────────────────────

const EMAIL_LINE_RE = /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/;
const PHONE_LINE_RE = /^[+]?[\d][\d\s\-().]{6,}\d$/;
const URL_LINE_RE = /^https?:\/\//i;

/**
 * Returns true if a trimmed line is wholly an email, phone number,
 * or URL with no other meaningful content.
 */
function lineIsEmailOrPhoneOrUrl(line: string): boolean {
  const t = line.trim();
  return EMAIL_LINE_RE.test(t) || PHONE_LINE_RE.test(t) || URL_LINE_RE.test(t);
}

/**
 * Merge consecutive single-word name lines that appear next to each
 * other in the original OCR output. Badges commonly split first and
 * last names across two lines (e.g., "Ross" then "Weatherford").
 *
 * Returns an array of merged name strings. Multi-word name lines
 * that already contain the full name are passed through as-is.
 */
function mergeConsecutiveNameLines(
  nameLines: string[],
  allLines: string[],
  consumed: Set<number>,
): string[] {
  if (nameLines.length === 0) return [];

  // Build a list of (line text, original index in allLines).
  const indexed: { text: string; idx: number }[] = [];
  for (let i = 0; i < allLines.length; i++) {
    if (consumed.has(i)) continue;
    if (nameLines.includes(allLines[i])) {
      indexed.push({ text: allLines[i].trim(), idx: i });
    }
  }

  if (indexed.length === 0) return [];

  // Group consecutive indices.
  const groups: string[][] = [];
  let current: string[] = [indexed[0].text];
  for (let i = 1; i < indexed.length; i++) {
    if (indexed[i].idx === indexed[i - 1].idx + 1) {
      current.push(indexed[i].text);
    } else {
      groups.push(current);
      current = [indexed[i].text];
    }
  }
  groups.push(current);

  // Merge each group into a single string.
  return groups.map((g) => g.join(' '));
}
