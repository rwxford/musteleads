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
import type { CloudVisionBlock } from './CloudVisionOCR';
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
 * 2. If Cloud Vision, use spatial analysis (block heights) for
 *    field classification — largest text = name, second = company.
 * 3. If Tesseract, fall back to heuristic line classification.
 * 4. Extract email if visible anywhere on the badge.
 */
export async function processBadgeImage(
  imageBlob: Blob,
): Promise<BadgeOCRResult> {
  const routerResult = await performOCR(imageBlob, 'badge');
  const { ocrResult, engine, cloudResponse } = routerResult;
  const debug = isDebugEnabled();

  const contact: ParsedContact = {};

  if (!ocrResult.text) {
    return { contact, rawText: '', confidence: ocrResult.confidence, engine };
  }

  const fullText = ocrResult.text;

  // Extract event name before filtering branding lines.
  const eventName = extractEventName(ocrResult.lines);
  if (debug) traceStep('event_name_detected', { eventName: eventName || '(none)' });

  // If we have Cloud Vision blocks with spatial data, use spatial
  // analysis for better field classification.
  if (engine === 'cloud-vision' && cloudResponse?.blocks && cloudResponse.blocks.length > 0) {
    extractFieldsFromBlocks(cloudResponse.blocks, contact, debug);
  }

  // If spatial analysis didn't find fields (or we're using
  // Tesseract), fall back to heuristic line classification.
  if (!contact.firstName && !contact.lastName) {
    extractFieldsFromLines(ocrResult.lines, contact, debug);
  }

  // Optionally pick up an email if visible anywhere on the badge.
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
 * Use Cloud Vision block heights for spatial field extraction.
 * Largest text block = name, second largest = company, etc.
 */
function extractFieldsFromBlocks(
  blocks: CloudVisionBlock[],
  contact: ParsedContact,
  debug: boolean,
): void {
  // Sort blocks by height (descending) — largest text first.
  const sorted = [...blocks]
    .filter((b) => b.text.trim().length > 0)
    .sort((a, b) => b.height - a.height);

  if (sorted.length === 0) return;

  for (const block of sorted) {
    const text = block.text.trim();
    if (!text || isGarbageLine(text) || isEventBranding(text)) continue;

    // Check for email/phone — skip those for name/company.
    if (/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/.test(text)) {
      if (!contact.email) contact.email = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0];
      continue;
    }

    // Largest unclassified block = name.
    if (!contact.firstName && !contact.lastName) {
      if (isLikelyJobTitle(text) && !isLikelyName(text)) {
        if (!contact.title) {
          contact.title = text;
          if (debug) traceClassification(text, 'spatial_title', 'title');
        }
        continue;
      }
      if (isLikelyCompany(text)) {
        if (!contact.company) {
          contact.company = text;
          if (debug) traceClassification(text, 'spatial_company', 'company');
        }
        continue;
      }
      // Assume it's the name.
      const words = text.split(/\s+/).filter(Boolean);
      contact.firstName = words[0] || '';
      contact.lastName = words.slice(1).join(' ') || undefined;
      contact.fullName = text;
      if (debug) traceClassification(text, 'spatial_largest', 'name');
      continue;
    }

    // If we have a firstName but no lastName, and this block
    // looks like a name (not a company/title), treat it as the
    // last name. Badges commonly split first/last across lines
    // which Cloud Vision returns as separate blocks.
    if (contact.firstName && !contact.lastName) {
      if (
        isLikelyName(text) &&
        !isLikelyCompany(text) &&
        !isLikelyJobTitle(text)
      ) {
        contact.lastName = text.trim();
        contact.fullName = `${contact.firstName} ${contact.lastName}`;
        if (debug) traceClassification(text, 'spatial_lastname', 'name');
        continue;
      }
    }

    // Next unclassified block = company (if not already set).
    if (!contact.company) {
      if (isLikelyJobTitle(text)) {
        if (!contact.title) {
          contact.title = text;
          if (debug) traceClassification(text, 'spatial_title', 'title');
        }
      } else {
        contact.company = text;
        if (debug) traceClassification(text, 'spatial_second', 'company');
      }
      continue;
    }

    // Remaining: title.
    if (!contact.title && isLikelyJobTitle(text)) {
      contact.title = text;
      if (debug) traceClassification(text, 'spatial_title', 'title');
    }
  }
}

/**
 * Heuristic line-based field extraction (used for Tesseract
 * output or when Cloud Vision spatial data is insufficient).
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
