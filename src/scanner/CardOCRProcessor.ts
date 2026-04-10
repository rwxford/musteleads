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
} from './ContactExtractor';

export interface CardOCRResult {
  contact: ParsedContact;
  rawText: string;
  confidence: number;
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

  // ── Filter garbage and branding lines ─────────────────────────
  const cleanLines = ocr.lines.filter(
    (line) => !isGarbageLine(line) && !isEventBranding(line),
  );

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
  // Prefer lines that look like a person's name. Among those,
  // pick the longest one (badge names tend to be prominent).
  const nameCandidates = cleanLines.filter(
    (_, i) => !consumed.has(i),
  );

  // First pass: look for lines that pass the isLikelyName check.
  const likelyNames = nameCandidates.filter((c) => isLikelyName(c));
  if (likelyNames.length > 0) {
    // Pick the longest match — usually the full name line.
    const best = likelyNames.reduce((a, b) =>
      a.length >= b.length ? a : b,
    );
    const words = best.split(/\s+/).filter(Boolean);
    contact.firstName = words[0];
    contact.lastName = words.slice(1).join(' ') || undefined;
    contact.fullName = best;
  } else {
    // Fallback: first unconsumed line with 2-3 words.
    for (const candidate of nameCandidates) {
      const words = candidate.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 3) {
        contact.firstName = words[0];
        contact.lastName = words.slice(1).join(' ');
        contact.fullName = candidate;
        break;
      }
      if (words.length === 1) {
        contact.lastName = words[0];
        contact.fullName = words[0];
        break;
      }
    }
  }

  return { contact, rawText: fullText, confidence: ocr.confidence };
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
