import type { ParsedContact } from "./VCardParser";
import {
  extractEmails,
  extractPhones,
  extractUrls,
  isLikelyCompany,
  isLikelyJobTitle,
} from "./ContactExtractor";
import { isVCard } from "./VCardParser";
import { isMeCard } from "./MeCardParser";

/**
 * Attempts to extract contact information from unstructured
 * plain text. Supports several common badge / QR formats:
 *
 *   - Pipe-delimited:  "Jane Smith | Acme Corp | VP Sales"
 *   - Newline-delimited:  "Acme Corp\nJane Smith\nVP Sales"
 *   - Comma-delimited (CSV-style):
 *       "Jane,Smith,Acme Corp,VP Sales,jane@acme.com,555-1234"
 *
 * Also extracts embedded emails, phones, and URLs via regex.
 * Returns null when no meaningful data can be recovered.
 */
export function parseText(raw: string): ParsedContact | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const contact: ParsedContact = {};

    // Pull structured data first — these are unambiguous.
    const emails = extractEmails(trimmed);
    if (emails.length > 0) {
      contact.email = emails[0];
    }

    const phones = extractPhones(trimmed);
    if (phones.length > 0) {
      contact.phone = phones[0];
    }

    const urls = extractUrls(trimmed);
    if (urls.length > 0) {
      contact.url = urls[0];
    }

    // Strip out already-extracted tokens so they don't confuse
    // the heuristic segmentation below.
    let stripped = trimmed;
    for (const e of emails) stripped = stripped.replace(e, "");
    for (const p of phones) stripped = stripped.replace(p, "");
    for (const u of urls) stripped = stripped.replace(u, "");
    stripped = stripped.trim();

    // Try pipe-delimited.
    if (stripped.includes("|")) {
      assignSegments(
        stripped.split("|").map((s) => s.trim()).filter(Boolean),
        contact,
      );
    } else if (stripped.includes("\n")) {
      // Try newline-delimited.
      assignSegments(
        stripped.split("\n").map((s) => s.trim()).filter(Boolean),
        contact,
      );
    } else if (stripped.includes(",")) {
      // CSV-style: FirstName,LastName,Company,Title,Email,Phone.
      // Only attempt this when the comma count suggests tabular
      // data (3+ commas) to avoid misinterpreting prose.
      const commaCount = (stripped.match(/,/g) || []).length;
      if (commaCount >= 3) {
        const parts = stripped.split(",").map((s) => s.trim()).filter(Boolean);
        assignCSV(parts, contact);
      } else {
        // Fewer commas — treat as "Name, Company".
        const parts = stripped.split(",").map((s) => s.trim()).filter(Boolean);
        assignSegments(parts, contact);
      }
    } else if (stripped) {
      // Single blob — assume it is a name.
      contact.fullName = stripped;
      splitFullName(stripped, contact);
    }

    if (!hasAnyField(contact)) {
      return null;
    }

    return contact;
  } catch {
    return null;
  }
}

/**
 * Returns true when the string is plain text (not vCard,
 * MeCard, or a bare URL).
 */
export function isPlainText(raw: string): boolean {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (isVCard(trimmed)) return false;
  if (isMeCard(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  return true;
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Given an ordered list of text segments (from pipe or newline
 * splitting), try to classify each as a name, company, or title
 * using heuristics. When heuristics are ambiguous, fall back to
 * positional conventions (first segment = name).
 */
function assignSegments(
  segments: string[],
  contact: ParsedContact,
): void {
  let nameAssigned = false;

  for (const seg of segments) {
    // Skip segments that are just whitespace or punctuation.
    if (!seg || /^[\s\-|,;]+$/.test(seg)) {
      continue;
    }

    if (!contact.company && isLikelyCompany(seg)) {
      contact.company = seg;
      continue;
    }

    if (!contact.title && isLikelyJobTitle(seg)) {
      contact.title = seg;
      continue;
    }

    // First unclassified segment is treated as a name.
    if (!nameAssigned) {
      contact.fullName = seg;
      splitFullName(seg, contact);
      nameAssigned = true;
      continue;
    }

    // Second unclassified segment is the company.
    if (!contact.company) {
      contact.company = seg;
      continue;
    }

    // Third unclassified segment is the title.
    if (!contact.title) {
      contact.title = seg;
    }
  }
}

/**
 * CSV format: FirstName, LastName, Company, Title, Email, Phone.
 * Emails and phones are already extracted, so we only care about
 * the first four columns.
 */
function assignCSV(parts: string[], contact: ParsedContact): void {
  if (parts[0]) contact.firstName = parts[0];
  if (parts[1]) contact.lastName = parts[1];
  if (parts[2]) contact.company = parts[2];
  if (parts[3]) contact.title = parts[3];

  if (contact.firstName || contact.lastName) {
    contact.fullName = [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(" ");
  }
}

/**
 * Split a "First Last" full-name string into firstName/lastName.
 */
function splitFullName(full: string, contact: ParsedContact): void {
  const parts = full.split(/\s+/);
  if (parts.length >= 2) {
    contact.firstName = parts[0];
    contact.lastName = parts.slice(1).join(" ");
  } else if (parts.length === 1) {
    contact.firstName = parts[0];
  }
}

function hasAnyField(c: ParsedContact): boolean {
  return !!(
    c.firstName ||
    c.lastName ||
    c.fullName ||
    c.company ||
    c.title ||
    c.email ||
    c.phone ||
    c.address ||
    c.url
  );
}
