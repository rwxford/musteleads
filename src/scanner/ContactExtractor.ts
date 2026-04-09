/**
 * Shared regex-based extraction utilities used by the text
 * parser and OCR post-processors.
 */

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;

// Matches international and US-style phone numbers:
//   +1 (555) 123-4567, 555-123-4567, +44 20 7946 0958, etc.
// Requires at least 7 digit characters to avoid false positives.
const PHONE_RE = /[+]?[\d][\d\s\-().]{6,}\d/g;

const URL_RE = /https?:\/\/[^\s,<>"']+/gi;

// Common job-title keywords (case-insensitive match).
const TITLE_KEYWORDS: string[] = [
  "ceo",
  "cto",
  "cfo",
  "coo",
  "cio",
  "cmo",
  "vp",
  "vice president",
  "president",
  "founder",
  "co-founder",
  "cofounder",
  "partner",
  "principal",
  "director",
  "head of",
  "manager",
  "supervisor",
  "lead",
  "senior",
  "junior",
  "staff",
  "engineer",
  "developer",
  "architect",
  "designer",
  "analyst",
  "scientist",
  "researcher",
  "consultant",
  "advisor",
  "strategist",
  "coordinator",
  "specialist",
  "administrator",
  "officer",
  "executive",
  "associate",
  "representative",
  "account exec",
  "sales rep",
  "evangelist",
  "advocate",
];

// Common company-name suffixes and keywords.
const COMPANY_KEYWORDS: string[] = [
  "inc",
  "inc.",
  "incorporated",
  "llc",
  "l.l.c.",
  "llp",
  "corp",
  "corp.",
  "corporation",
  "ltd",
  "ltd.",
  "limited",
  "co.",
  "company",
  "group",
  "holdings",
  "partners",
  "enterprises",
  "ventures",
  "capital",
  "technologies",
  "technology",
  "tech",
  "solutions",
  "systems",
  "services",
  "consulting",
  "labs",
  "studio",
  "studios",
  "agency",
  "associates",
  "foundation",
  "institute",
  "global",
  "international",
  "industries",
  "gmbh",
  "s.a.",
  "pty",
  "plc",
];

/**
 * Extract all email addresses found in the text.
 */
export function extractEmails(text: string): string[] {
  if (!text) {
    return [];
  }
  return [...text.matchAll(EMAIL_RE)].map((m) => m[0]);
}

/**
 * Extract all phone numbers found in the text.
 */
export function extractPhones(text: string): string[] {
  if (!text) {
    return [];
  }
  return [...text.matchAll(PHONE_RE)].map((m) => m[0].trim());
}

/**
 * Extract all http/https URLs found in the text.
 */
export function extractUrls(text: string): string[] {
  if (!text) {
    return [];
  }
  return [...text.matchAll(URL_RE)].map((m) => m[0]);
}

/**
 * Heuristic: does this text look like a job title?
 * Checks against a curated list of common title keywords.
 */
export function isLikelyJobTitle(text: string): boolean {
  if (!text) {
    return false;
  }
  const lower = text.toLowerCase().trim();
  return TITLE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Heuristic: does this text look like a company name?
 * Checks for common corporate suffixes and business keywords.
 */
export function isLikelyCompany(text: string): boolean {
  if (!text) {
    return false;
  }
  const lower = text.toLowerCase().trim();
  return COMPANY_KEYWORDS.some((kw) => {
    // Match as a whole word to avoid false positives (e.g.,
    // "limited" inside "unlimited").
    const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
    return re.test(lower);
  });
}

// ── Internal helpers ──────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
