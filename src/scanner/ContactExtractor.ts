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

// ── New helper functions ──────────────────────────────────────────

/**
 * Strip common OCR artifacts from line edges.
 * Tesseract often misreads badge holder edges, plastic frames,
 * and decorative elements as punctuation or short noise prefixes.
 *
 * Examples from real scans:
 *   "I Ross" → "Ross"  (single-char alpha prefix)
 *   "Il Weatherford" → "Weatherford"  (two-char noise prefix)
 *   "Bl CODER i" → "CODER"  (noise prefix AND suffix)
 *   "| Director, US Public Sect 4" → "Director, US Public Sect 4"
 */
export function cleanOCRLine(text: string): string {
  let cleaned = text
    // Strip leading non-alphanumeric characters.
    .replace(/^[^a-zA-Z0-9+@]+/, '')
    // Strip trailing non-alphanumeric (except period for abbreviations).
    .replace(/[^a-zA-Z0-9.)+@]+$/, '')
    .trim();

  // Strip short noise prefixes: 1-2 characters followed by a space
  // before the real content. Common OCR artifact on badges where
  // the plastic holder edge is read as "I ", "Il ", "Bl ", etc.
  cleaned = cleaned.replace(/^[A-Za-z]{1,2}\s+(?=[A-Z])/, '');

  // Strip short noise suffixes: a space followed by 1-2 characters
  // at the end. E.g., "CODER i" → "CODER", "Sect 4" stays (digit).
  cleaned = cleaned.replace(/\s+[a-z]{1,2}$/, '');

  return cleaned.trim();
}

/**
 * Check if a line is OCR garbage (noise, too short, mostly symbols).
 */
export function isGarbageLine(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  // Count alpha characters.
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  // If less than 40% alphabetic, it's garbage (unless it's a
  // phone or email).
  if (alphaCount / trimmed.length < 0.4) {
    if (extractEmails(trimmed).length > 0 || extractPhones(trimmed).length > 0) return false;
    return true;
  }
  return false;
}

/**
 * Check if a line is event branding/decoration (not contact info).
 */
export function isEventBranding(text: string): boolean {
  const brandingKeywords = [
    'SUMMIT', 'CONFERENCE', 'EXPO', 'SYMPOSIUM', 'FORUM', 'CONVENTION',
    'SPONSORED', 'PRESENTS', 'WELCOME', 'HOSTED BY', 'POWERED BY',
    'REVOLUTION', 'ENTERPRISE', 'ANNUAL', 'INTERNATIONAL', 'NATIONAL',
    'REGISTER', 'BADGE', 'ATTENDEE', 'SPEAKER', 'EXHIBITOR', 'VIP',
    'DAY 1', 'DAY 2', 'DAY 3',
  ];
  const upper = text.trim().toUpperCase();
  // If the line is mostly branding keywords.
  const words = upper.split(/\s+/);
  const brandingWordCount = words.filter(w =>
    brandingKeywords.some(kw => w.includes(kw) || kw.includes(w))
  ).length;
  return brandingWordCount >= words.length * 0.5;
}

/**
 * Check if a line looks like a person's name.
 * 2-3 words, each starting with uppercase (or all-caps), no
 * company/title indicators.
 */
export function isLikelyName(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  // Each word should start with uppercase or be all-caps.
  const allCapitalized = words.every(w => /^[A-Z]/.test(w));
  if (!allCapitalized) return false;
  // Should NOT be a company or title.
  if (isLikelyCompany(trimmed) || isLikelyJobTitle(trimmed)) return false;
  // Should not contain numbers.
  if (/\d/.test(trimmed)) return false;
  return true;
}

/**
 * Look through OCR lines for event branding patterns and return
 * the longest branding line as the event name. Strips common
 * filler words like "WELCOME TO", "PRESENTS", etc.
 */
export function extractEventName(lines: string[]): string | undefined {
  const brandingLines = lines.filter((line) => isEventBranding(line));
  if (brandingLines.length === 0) return undefined;

  // Pick the longest branding line — most likely the event name.
  const longest = brandingLines.reduce((a, b) =>
    a.length >= b.length ? a : b,
  );

  // Clean up filler words.
  const cleaned = longest
    .trim()
    .replace(/^(WELCOME\s+TO|PRESENTS|HOSTED\s+BY|POWERED\s+BY|SPONSORED\s+BY)\s*/i, '')
    .replace(/\s*(PRESENTS|HOSTED\s+BY|POWERED\s+BY|SPONSORED\s+BY)$/i, '')
    .trim();

  return cleaned || undefined;
}

// ── Internal helpers ──────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
