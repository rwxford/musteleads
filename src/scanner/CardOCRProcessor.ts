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
 * 2. Split result into lines.
 * 3. Extract emails and phones via regex (highest confidence).
 * 4. Identify company name (lines matching company patterns).
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
  const lines = ocr.lines;

  // ── High-confidence regex fields ─────────────────────────────
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

  // ── Classify each line ───────────────────────────────────────
  // Track which lines are "consumed" by a structured field so the
  // remainder can be used for name detection.
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines that are just an email, phone, or URL.
    if (lineIsEmailOrPhoneOrUrl(line)) {
      consumed.add(i);
      continue;
    }

    // Company detection.
    if (!contact.company && isLikelyCompany(line)) {
      contact.company = line;
      consumed.add(i);
      continue;
    }

    // Title detection.
    if (!contact.title && isLikelyJobTitle(line)) {
      contact.title = line;
      consumed.add(i);
      continue;
    }
  }

  // ── Name detection ───────────────────────────────────────────
  // The first unconsumed line with 2-3 words is most likely the
  // person's name. A single remaining word is treated as a last
  // name.
  const nameCandidates = lines.filter(
    (_, i) => !consumed.has(i),
  );

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
