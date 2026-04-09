import type { ParsedContact } from "./VCardParser";

/**
 * Parses a MeCard-formatted string into a structured contact.
 * Format: MECARD:N:Last,First;ORG:Company;TEL:phone;EMAIL:email;;
 * Returns null if the input is not a valid MeCard.
 */
export function parseMeCard(raw: string): ParsedContact | null {
  if (!isMeCard(raw)) {
    return null;
  }

  try {
    const contact: ParsedContact = {};

    // Strip the MECARD: prefix.
    const body = raw.substring("MECARD:".length).trim();

    // MeCard fields are separated by semicolons, but field values
    // can themselves contain escaped semicolons (\;). Replace
    // escaped semicolons with a placeholder before splitting.
    const placeholder = "\x00";
    const escaped = body.replace(/\\;/g, placeholder);
    const fields = escaped.split(";").filter(Boolean);

    for (const field of fields) {
      const colonIdx = field.indexOf(":");
      if (colonIdx === -1) {
        continue;
      }

      const key = field.substring(0, colonIdx).toUpperCase();
      const value = field
        .substring(colonIdx + 1)
        .replace(new RegExp(placeholder, "g"), ";")
        .trim();

      if (!value) {
        continue;
      }

      switch (key) {
        case "N": {
          // N:LastName,FirstName
          const parts = value.split(",");
          contact.lastName = parts[0]?.trim() || undefined;
          contact.firstName = parts[1]?.trim() || undefined;
          if (contact.firstName || contact.lastName) {
            contact.fullName = [contact.firstName, contact.lastName]
              .filter(Boolean)
              .join(" ");
          }
          break;
        }
        case "ORG": {
          contact.company = value;
          break;
        }
        case "TEL": {
          // Keep only the first phone encountered.
          if (!contact.phone) {
            contact.phone = value;
          }
          break;
        }
        case "EMAIL": {
          if (!contact.email) {
            contact.email = value;
          }
          break;
        }
        case "ADR": {
          contact.address = value;
          break;
        }
        case "URL": {
          contact.url = value;
          break;
        }
        case "TITLE": {
          contact.title = value;
          break;
        }
        default:
          // NOTE and other fields are intentionally ignored.
          break;
      }
    }

    // If we extracted nothing useful, bail.
    if (!hasAnyField(contact)) {
      return null;
    }

    return contact;
  } catch {
    return null;
  }
}

/**
 * Returns true if the raw string looks like a MeCard.
 */
export function isMeCard(raw: string): boolean {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  return raw.trim().toUpperCase().startsWith("MECARD:");
}

// ── Internal helpers ──────────────────────────────────────────────

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
