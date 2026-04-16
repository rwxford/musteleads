/**
 * OCR fallback for badge faces when the QR code is opaque or
 * encrypted. Badges typically display large, sparse text: the
 * attendee name on top and the company name below.
 */

import type { ParsedContact } from './VCardParser';
import { recognizeImage } from './OCREngine';
import {
  isDebugEnabled,
  traceStep,
  traceCleanedLines,
  traceClassification,
  traceFinalResult,
} from './DebugTrace';
import {
  isLikelyCompany,
  extractEmails,
  isGarbageLine,
  isEventBranding,
  isLikelyName,
  isLikelyJobTitle,
  cleanOCRLine,
  extractEventName,
} from './ContactExtractor';


export interface BadgeOCRResult {
  contact: ParsedContact;
  rawText: string;
  confidence: number;
  eventName?: string;
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
  const debug = isDebugEnabled();

  const contact: ParsedContact = {};

  if (!ocr.text) {
    return { contact, rawText: '', confidence: ocr.confidence };
  }

  const fullText = ocr.text;

  // Extract event name before filtering branding lines.
  const eventName = extractEventName(ocr.lines);
  if (debug) traceStep('event_name_detected', { eventName: eventName || '(none)' });

  // Clean OCR artifacts, then filter garbage and event branding.
  const cleanLines = ocr.lines
    .map(cleanOCRLine)
    .filter((line) => line.length > 0 && !isGarbageLine(line) && !isEventBranding(line));

  if (debug) traceCleanedLines(cleanLines);

  // Use all cleaned lines — real contact data can appear far
  // down when Tesseract reads surrounding graphics, sponsors,
  // and badge-holder noise before reaching the attendee text.
  const candidateLines = cleanLines;

  // Try to detect company first so we can exclude it from the
  // name candidate pool. Check explicit keywords first, then
  // fall back to short ALL-CAPS lines.
  for (const line of candidateLines) {
    if (contact.company) break;

    if (isLikelyCompany(line)) {
      contact.company = line;
      if (debug) traceClassification(line, 'company_keyword', 'company');
      continue;
    }

    // Short ALL-CAPS line (1-3 words) that isn't a title keyword
    // is likely a company name (e.g. "CODER"). But skip 2-word
    // ALL-CAPS lines that look like a person's name — badges
    // almost always print names in uppercase.
    const words = line.trim().split(/\s+/);
    if (
      words.length >= 1 &&
      words.length <= 3 &&
      line.trim().length >= 3 &&
      line === line.toUpperCase() &&
      /^[A-Z\s]+$/.test(line.trim()) &&
      !isLikelyJobTitle(line) &&
      !looksLikeAllCapsName(words)
    ) {
      contact.company = line.trim();
      if (debug) traceClassification(line, 'all_caps_company', 'company');
    }
  }

  // Detect job title.
  for (const line of candidateLines) {
    if (line === contact.company) continue;
    if (isLikelyJobTitle(line)) {
      contact.title = line;
      if (debug) traceClassification(line, 'job_title', 'title');
      break;
    }
  }

  // Name detection — badges often split first/last name across
  // two lines ("Ross" then "Weatherford"). Collect consecutive
  // name-like lines and merge them.
  const nameLines: string[] = [];
  for (const line of candidateLines) {
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

  // Word-level fallback: if no name was found via full-line
  // matching, try extracting the first word from multi-word lines.
  // Handles OCR noise suffixes like "Ross SNE" where "Ross" alone
  // is a valid name but the full line fails isLikelyName because
  // the appended garbage looks wrong.
  if (nameLines.length === 0) {
    for (const line of candidateLines) {
      if (line === contact.company || line === contact.title) continue;
      const words = line.split(/\s+/);
      if (words.length >= 2) {
        const firstWord = words[0];
        if (isLikelyName(firstWord)) {
          nameLines.push(firstWord);
          if (debug) traceClassification(line, 'word_level_name', 'name');
        }
      }
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
    for (const line of candidateLines) {
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

  if (debug) {
    traceFinalResult({
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      eventName,
    });
  }

  return { contact, rawText: fullText, confidence: ocr.confidence, eventName };
}

/**
 * Returns true if ALL-CAPS words look like a person's name rather
 * than a company. Two words of 2+ alpha chars each (e.g. "GREG
 * BONN", "ROSS WEATHERFORD") are common on badges where names are
 * printed in uppercase.
 */
function looksLikeAllCapsName(words: string[]): boolean {
  if (words.length !== 2) return false;
  return words.every((w) => /^[A-Z]{2,}$/.test(w));
}
