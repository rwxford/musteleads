import { parseVCard, isVCard, type ParsedContact } from "./VCardParser";
import { parseMeCard, isMeCard } from "./MeCardParser";
import { parseText } from "./TextParser";

export type QRResultType = "vcard" | "mecard" | "url" | "text" | "unknown";

export interface QRResult {
  type: QRResultType;
  contact: ParsedContact | null;
  rawData: string;
  /** True when the QR payload is opaque/encrypted and needs OCR. */
  needsOCR: boolean;
}

/**
 * Process raw QR code data and attempt to extract contact info.
 * Parsers are tried in priority order: vCard → MeCard → URL →
 * plain text. If none succeed the result is marked as needing
 * OCR fallback.
 */
export function processQRData(rawData: string): QRResult {
  if (!rawData || typeof rawData !== "string") {
    return {
      type: "unknown",
      contact: null,
      rawData: rawData ?? "",
      needsOCR: true,
    };
  }

  const trimmed = rawData.trim();

  // 1. vCard
  if (isVCard(trimmed)) {
    const contact = parseVCard(trimmed);
    return {
      type: "vcard",
      contact,
      rawData,
      needsOCR: contact === null,
    };
  }

  // 2. MeCard
  if (isMeCard(trimmed)) {
    const contact = parseMeCard(trimmed);
    return {
      type: "mecard",
      contact,
      rawData,
      needsOCR: contact === null,
    };
  }

  // 3. URL — bare http(s) link with no other structured format.
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      type: "url",
      contact: { url: trimmed },
      rawData,
      needsOCR: false,
    };
  }

  // 4. Plain text heuristic parser.
  const textContact = parseText(trimmed);
  if (textContact) {
    return {
      type: "text",
      contact: textContact,
      rawData,
      needsOCR: false,
    };
  }

  // 5. Nothing worked — opaque data.
  return {
    type: "unknown",
    contact: null,
    rawData,
    needsOCR: true,
  };
}
