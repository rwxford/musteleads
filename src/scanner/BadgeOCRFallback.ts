/**
 * OCR fallback for badge faces when the QR code is opaque or
 * encrypted. Badges typically display large, sparse text: the
 * attendee name on top and the company name below.
 */

import type { ParsedContact } from './VCardParser';
import { recognizeImage } from './OCREngine';
import {
  isLikelyCompany,
  extractEmails,
  isGarbageLine,
  isEventBranding,
  isLikelyName,
  isLikelyJobTitle,
} from './ContactExtractor';

export interface BadgeOCRResult {
  contact: ParsedContact;
  rawText: string;
  confidence: number;
}

/**
 * OCR a badge-face photo and extract name + company.
 *
 * Strategy:
 * 1. OCR the badge image (pre-processing is handled by OCREngine).
 * 2. Filter garbage and event branding lines.
 * 3. From the remaining top lines, detect company (explicit
 *    keywords or short ALL-CAPS line).
 * 4. First non-company, non-title line that passes the name
 *    heuristic = attendee name.
 * 5. Optionally extract email if visible.
 */
export async function processBadgeImage(
  imageBlob: Blob,
): Promise<BadgeOCRResult> {
  const ocr = await recognizeImage(imageBlob);

  const contact: ParsedContact = {};

  if (!ocr.text) {
    return { contact, rawText: '', confidence: ocr.confidence };
  }

  const fullText = ocr.text;

  // Filter garbage and event branding before any classification.
  const cleanLines = ocr.lines.filter(
    (line) => !isGarbageLine(line) && !isEventBranding(line),
  );

  // Badges have large, sparse text — focus on the first few
  // lines which almost always contain name and company.
  const topLines = cleanLines.slice(0, 6);

  // Try to detect company first so we can exclude it from the
  // name candidate pool. Check explicit keywords first, then
  // fall back to short ALL-CAPS lines.
  for (const line of topLines) {
    if (contact.company) break;

    if (isLikelyCompany(line)) {
      contact.company = line;
      continue;
    }

    // Short ALL-CAPS line (1-3 words) that isn't a title keyword
    // is likely a company name (e.g. "CODER").
    const words = line.trim().split(/\s+/);
    if (
      words.length >= 1 &&
      words.length <= 3 &&
      line === line.toUpperCase() &&
      /^[A-Z\s]+$/.test(line.trim()) &&
      !isLikelyJobTitle(line)
    ) {
      contact.company = line.trim();
    }
  }

  // Detect job title.
  for (const line of topLines) {
    if (line === contact.company) continue;
    if (isLikelyJobTitle(line)) {
      contact.title = line;
      break;
    }
  }

  // Name detection — badges often split first/last name across
  // two lines ("Ross" then "Weatherford"). Collect consecutive
  // name-like lines and merge them.
  const nameLines: string[] = [];
  for (const line of topLines) {
    if (line === contact.company) continue;
    if (line === contact.title) continue;
    if (isLikelyName(line)) {
      nameLines.push(line.trim());
    } else if (nameLines.length > 0) {
      // Stop collecting once we hit a non-name line after finding
      // at least one name line (names are grouped together).
      break;
    }
  }

  if (nameLines.length > 0) {
    // Merge all consecutive name lines into one string.
    const merged = nameLines.join(' ');
    const words = merged.split(/\s+/).filter(Boolean);
    contact.firstName = words[0];
    contact.lastName = words.slice(1).join(' ') || undefined;
    contact.fullName = merged;
  } else {
    // Fallback: first non-company, non-title line.
    for (const line of topLines) {
      if (line === contact.company) continue;
      if (line === contact.title) continue;
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      contact.firstName = words[0];
      contact.lastName = words.slice(1).join(' ') || undefined;
      contact.fullName = line;
      break;
    }
  }

  // Optionally pick up an email if visible anywhere on the badge.
  const emails = extractEmails(fullText);
  if (emails.length > 0) {
    contact.email = emails[0];
  }

  return { contact, rawText: fullText, confidence: ocr.confidence };
}
