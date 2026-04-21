/**
 * Processes a business-card image through OCR and extracts
 * structured contact data using ContactExtractor heuristics.
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
  engine: OCREngine;
  eventName?: string;
}

/**
 * Process a business card image through OCR and extract structured
 * contact data.
 */
export async function processCardImage(
  imageBlob: Blob,
): Promise<CardOCRResult> {
  const routerResult = await performOCR(imageBlob, 'card');
  const { ocrResult, engine } = routerResult;

  const contact: ParsedContact = {};

  if (!ocrResult.text) {
    return { contact, rawText: '', confidence: ocrResult.confidence, engine };
  }

  const fullText = ocrResult.text;

  // Extract event name before filtering branding lines.
  const eventName = extractEventName(ocrResult.lines);

  const debug = isDebugEnabled();
  if (debug) traceStep('event_name_detected', { eventName: eventName || '(none)' });

  // Clean, filter garbage and branding lines.
  const cleanLines = ocrResult.lines
    .map(cleanOCRLine)
    .filter((line) => line.length > 0 && !isGarbageLine(line) && !isEventBranding(line));

  if (debug) traceCleanedLines(cleanLines);

  // High-confidence regex fields.
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
    // Check for LinkedIn URL specifically.
    const linkedInUrl = urls.find((u) => u.toLowerCase().includes('linkedin.com'));
    if (linkedInUrl) {
      contact.url = linkedInUrl;
    } else {
      contact.url = urls[0];
    }
  }

  // Classify each line.
  const consumed = new Set<number>();

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];

    if (lineIsEmailOrPhoneOrUrl(line)) {
      if (debug) traceClassification(line, 'email/phone/url', 'consumed');
      consumed.add(i);
      continue;
    }

    if (!contact.company) {
      if (isLikelyCompany(line)) {
        contact.company = line;
        if (debug) traceClassification(line, 'company_keyword', 'company');
        consumed.add(i);
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
        consumed.add(i);
        continue;
      }
    }

    if (!contact.title && isLikelyJobTitle(line)) {
      contact.title = line;
      if (debug) traceClassification(line, 'job_title', 'title');
      consumed.add(i);
      continue;
    }
  }

  // Name detection.
  const nameCandidates = cleanLines.filter(
    (_, i) => !consumed.has(i),
  );

  const likelyNames = nameCandidates.filter((c) => isLikelyName(c));
  const mergedNames = mergeConsecutiveNameLines(likelyNames, cleanLines, consumed);

  if (mergedNames.length > 0) {
    const best = mergedNames.reduce((a, b) =>
      a.length >= b.length ? a : b,
    );
    const words = best.split(/\s+/).filter(Boolean);
    contact.firstName = words[0];
    contact.lastName = words.slice(1).join(' ') || undefined;
    contact.fullName = best;
  } else {
    for (const candidate of nameCandidates) {
      const words = candidate.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        contact.firstName = words[0];
        contact.lastName = words.slice(1).join(' ');
        contact.fullName = candidate;
        break;
      }
      if (words.length === 1) {
        contact.firstName = words[0];
        contact.fullName = words[0];
        break;
      }
    }
  }

  if (debug) {
    traceFinalResult({
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      eventName,
      engine,
      nameCandidateCount: nameCandidates.length,
      mergedNameCount: mergedNames.length,
    });
  }

  return { contact, rawText: fullText, confidence: ocrResult.confidence, engine, eventName };
}

// Helpers

const EMAIL_LINE_RE = /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/;
const PHONE_LINE_RE = /^[+]?[\d][\d\s\-().]{6,}\d$/;
const URL_LINE_RE = /^https?:\/\//i;

function lineIsEmailOrPhoneOrUrl(line: string): boolean {
  const t = line.trim();
  return EMAIL_LINE_RE.test(t) || PHONE_LINE_RE.test(t) || URL_LINE_RE.test(t);
}

function mergeConsecutiveNameLines(
  nameLines: string[],
  allLines: string[],
  consumed: Set<number>,
): string[] {
  if (nameLines.length === 0) return [];

  const indexed: { text: string; idx: number }[] = [];
  for (let i = 0; i < allLines.length; i++) {
    if (consumed.has(i)) continue;
    if (nameLines.includes(allLines[i])) {
      indexed.push({ text: allLines[i].trim(), idx: i });
    }
  }

  if (indexed.length === 0) return [];

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

  return groups.map((g) => g.join(' '));
}

function looksLikeAllCapsName(words: string[]): boolean {
  if (words.length !== 2) return false;
  return words.every((w) => /^[A-Z]{2,}$/.test(w));
}
