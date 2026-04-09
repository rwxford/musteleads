/**
 * OCR fallback for badge faces when the QR code is opaque or
 * encrypted. Badges typically display large, sparse text: the
 * attendee name on top and the company name below.
 */

import type { ParsedContact } from './VCardParser';
import { recognizeImage } from './OCREngine';
import { isLikelyCompany, extractEmails } from './ContactExtractor';

export interface BadgeOCRResult {
  contact: ParsedContact;
  rawText: string;
  confidence: number;
}

/**
 * OCR a badge-face photo and extract name + company.
 *
 * Strategy:
 * 1. OCR the badge image.
 * 2. Take the top 2-4 lines (badges have large, sparse text).
 * 3. First non-company line = name.
 * 4. Line matching company pattern = company.
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

  // Badges have large, sparse text — focus on the first few
  // lines which almost always contain name and company.
  const topLines = ocr.lines.slice(0, 4);

  // Try to detect company first so we can exclude it from the
  // name candidate pool.
  for (const line of topLines) {
    if (!contact.company && isLikelyCompany(line)) {
      contact.company = line;
    }
  }

  // The first non-company line is most likely the attendee name.
  for (const line of topLines) {
    if (line === contact.company) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (words.length >= 2) {
      contact.firstName = words[0];
      contact.lastName = words.slice(1).join(' ');
    } else {
      contact.lastName = words[0];
    }
    contact.fullName = line;
    break;
  }

  // Optionally pick up an email if visible anywhere on the badge.
  const emails = extractEmails(fullText);
  if (emails.length > 0) {
    contact.email = emails[0];
  }

  return { contact, rawText: fullText, confidence: ocr.confidence };
}
