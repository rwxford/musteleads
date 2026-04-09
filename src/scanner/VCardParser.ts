export interface ParsedContact {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  url?: string;
}

/**
 * Parses vCard 3.0/4.0 text into a structured contact object.
 * Handles N, FN, ORG, TITLE, TEL, EMAIL, ADR, URL fields.
 * Returns null if the input is not a valid vCard.
 */
export function parseVCard(raw: string): ParsedContact | null {
  if (!isVCard(raw)) {
    return null;
  }

  try {
    // Unfold continuation lines per RFC 6350: a line that starts
    // with a space or tab is a continuation of the previous line.
    const unfolded = raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    const lines = unfolded.split(/\r\n|\r|\n/);

    const contact: ParsedContact = {};
    const phones: { value: string; type: string }[] = [];
    const emails: { value: string; type: string }[] = [];

    for (const line of lines) {
      // Skip empty lines, BEGIN/END/VERSION markers.
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith("BEGIN:") ||
        trimmed.startsWith("END:") ||
        trimmed.startsWith("VERSION:")
      ) {
        continue;
      }

      const { property, params, value } = parseLine(trimmed);
      if (!property || value === undefined) {
        continue;
      }

      switch (property) {
        case "N": {
          // N:LastName;FirstName;MiddleName;Prefix;Suffix
          const parts = value.split(";");
          contact.lastName = parts[0] || undefined;
          contact.firstName = parts[1] || undefined;
          break;
        }
        case "FN": {
          contact.fullName = value || undefined;
          break;
        }
        case "ORG": {
          // ORG can contain semicolon-separated components.
          // The first component is the organization name.
          contact.company = value.split(";")[0] || undefined;
          break;
        }
        case "TITLE": {
          contact.title = value || undefined;
          break;
        }
        case "TEL": {
          const type = extractTypeParam(params);
          phones.push({ value, type });
          break;
        }
        case "EMAIL": {
          const type = extractTypeParam(params);
          emails.push({ value, type });
          break;
        }
        case "ADR": {
          // ADR:;;Street;City;State;PostalCode;Country
          const parts = value
            .split(";")
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length > 0) {
            contact.address = parts.join(", ");
          }
          break;
        }
        case "URL": {
          contact.url = value || undefined;
          break;
        }
        default:
          break;
      }
    }

    // Pick best phone: prefer WORK, then CELL, then first available.
    contact.phone = pickPreferred(phones, ["WORK", "CELL"]);

    // Pick best email: prefer WORK, then first available.
    contact.email = pickPreferred(emails, ["WORK"]);

    // Derive fullName from N parts if FN was not provided.
    if (!contact.fullName && (contact.firstName || contact.lastName)) {
      contact.fullName = [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ");
    }

    // If we got nothing useful, return null.
    if (!hasAnyField(contact)) {
      return null;
    }

    return contact;
  } catch {
    return null;
  }
}

/**
 * Returns true if the raw string looks like a vCard.
 */
export function isVCard(raw: string): boolean {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  return (
    trimmed.toUpperCase().startsWith("BEGIN:VCARD") &&
    trimmed.toUpperCase().includes("END:VCARD")
  );
}

// ── Internal helpers ──────────────────────────────────────────────

interface ParsedLine {
  property: string;
  params: string[];
  value: string;
}

/**
 * Parses a single vCard property line into its components.
 * Handles both vCard 3.0 (TYPE=WORK) and 4.0 (type=work)
 * parameter styles, as well as the v2.1 shorthand (TEL;WORK:).
 */
function parseLine(line: string): ParsedLine {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) {
    return { property: "", params: [], value: "" };
  }

  const left = line.substring(0, colonIdx);
  const value = line.substring(colonIdx + 1);

  const segments = left.split(";");
  const property = (segments[0] || "").toUpperCase();
  const params = segments.slice(1).map((s) => s.toUpperCase());

  return { property, params, value };
}

/**
 * Extracts the TYPE value from vCard property parameters.
 * Handles TYPE=WORK, type=work, and bare keywords like WORK.
 */
function extractTypeParam(params: string[]): string {
  for (const p of params) {
    if (p.startsWith("TYPE=")) {
      return p.substring(5);
    }
    // Bare keywords (e.g., TEL;WORK:).
    if (
      ["WORK", "HOME", "CELL", "FAX", "PAGER", "VOICE"].includes(p)
    ) {
      return p;
    }
  }
  return "";
}

/**
 * From a list of typed values, pick the first one matching a
 * preferred type. Falls back to the first entry if no match.
 */
function pickPreferred(
  items: { value: string; type: string }[],
  preferredTypes: string[],
): string | undefined {
  if (items.length === 0) {
    return undefined;
  }
  for (const pref of preferredTypes) {
    const found = items.find((i) => i.type.includes(pref));
    if (found) {
      return found.value;
    }
  }
  return items[0].value;
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
