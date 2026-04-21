/**
 * OCR fallback for badge faces when the QR code is opaque or
 * encrypted. Badges typically display large, sparse text: the
 * attendee name on top and the company name below.
 *
 * Uses the OCR Router to automatically select Cloud Vision API
 * (online) or Tesseract.js (offline) for text recognition.
 */

import type { ParsedContact } from './VCardParser';
import { performOCR } from './OCRRouter';
import type { OCREngine } from './OCRRouter';
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
  engine: OCREngine;
  eventName?: string;
}

/**
 * OCR a badge-face photo and extract name + company.
 *
 * Strategy:
 * 1. OCR the badge image via OCR Router (Cloud Vision or Tesseract).
 * 2. Use heuristic line classification on the OCR text output.
 *    Cloud Vision provides ~98% text accuracy; Tesseract ~30-50%.
 *    Both produce line-based text that the heuristics handle.
 * 3. Extract email if visible anywhere on the badge.
 */
export async function processBadgeImage(
  imageBlob: Blob,
): Promise<BadgeOCRResult> {
  const routerResult = await performOCR(imageBlob, 'badge');
  const { ocrResult, engine } = routerResult;
  const debug = isDebugEnabled();

  const contact: ParsedContact = {};

  if (!ocrResult.text) {
    return { contact, rawText: '', confidence: ocrResult.confidence, engine };
  }

  const fullText = ocrResult.text;

  // Extract event name before filtering branding lines.
  const eventName = extractEventName(ocrResult.lines);
  if (debug) traceStep('event_name_detected', { eventName: eventName || '(none)' });

  if (debug) {
    traceStep('ocr_engine_used', { engine, lineCount: ocrResult.lines.length });
  }

  // Use line-based heuristic extraction for all engines.
  // Cloud Vision's value is text accuracy, not block structure.
  extractFieldsFromLines(ocrResult.lines, contact, debug);

  // Pick up email if visible anywhere on the badge.
  if (!contact.email) {
    const emails = extractEmails(fullText);
    if (emails.length > 0) {
      contact.email = emails[0];
    }
  }

  if (debug) {
    traceFinalResult({
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      eventName,
      engine,
    });
  }

  return { contact, rawText: fullText, confidence: ocrResult.confidence, engine, eventName };
}

/**
 * Heuristic line-based field extraction on the OCR text output.
 * Works with both Cloud Vision and Tesseract text.
 */
function extractFieldsFromLines(
  rawLines: string[],
  contact: ParsedContact,
  debug: boolean,
): void {
  // Clean OCR artifacts, then filter garbage and event branding.
  const cleanLines = rawLines
    .map(cleanOCRLine)
    .filter((line) => line.length > 0 && !isGarbageLine(line) && !isEventBranding(line));

  if (debug) traceCleanedLines(cleanLines);

  const candidateLines = cleanLines;

  // Detect company first.
  for (const line of candidateLines) {
    if (contact.company) break;

    if (isLikelyCompany(line)) {
      contact.company = line;
      if (debug) traceClassification(line, 'company_keyword', 'company');
      continue;
    }

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

  // Name detection — collect consecutive name-like lines.
  const nameLines: string[] = [];
  for (const line of candidateLines) {
    if (line === contact.company) continue;
    if (line === contact.title) continue;
    if (isLikelyName(line)) {
      nameLines.push(line.trim());
    } else if (nameLines.length > 0) {
      break;
    }
  }

  // Word-level fallback.
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
    const merged = nameLines.join(' ');
    const words = merged.split(/\s+/).filter(Boolean);
    contact.firstName = words[0];
    contact.lastName = words.slice(1).join(' ') || undefined;
    contact.fullName = merged;
  } else {
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
}

function looksLikeAllCapsName(words: string[]): boolean {
  if (words.length !== 2) return false;
  return words.every((w) => /^[A-Z]{2,}$/.test(w));
}
