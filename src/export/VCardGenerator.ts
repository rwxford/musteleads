import type { Lead } from '@/types/Lead';

/**
 * Escape special characters in a vCard 3.0 text value.
 * Backslashes, semicolons, commas, and newlines all need
 * escaping per RFC 2426.
 */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

/**
 * Generate a vCard 3.0 string for a single lead. Empty or
 * whitespace-only fields are omitted rather than emitting blank
 * properties.
 */
export function generateVCard(lead: Lead): string {
  const lines: string[] = [];

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  // Structured name — N is required by vCard 3.0.
  const last = escapeVCardValue(lead.lastName);
  const first = escapeVCardValue(lead.firstName);
  lines.push(`N:${last};${first};;;`);

  // Formatted name — also required.
  const fullName = [lead.firstName, lead.lastName]
    .filter(Boolean)
    .join(' ');
  lines.push(`FN:${escapeVCardValue(fullName || 'Unknown')}`);

  if (lead.company.trim()) {
    lines.push(`ORG:${escapeVCardValue(lead.company)}`);
  }

  if (lead.title.trim()) {
    lines.push(`TITLE:${escapeVCardValue(lead.title)}`);
  }

  if (lead.phone.trim()) {
    lines.push(`TEL;TYPE=WORK:${escapeVCardValue(lead.phone)}`);
  }

  if (lead.email.trim()) {
    lines.push(`EMAIL;TYPE=WORK:${escapeVCardValue(lead.email)}`);
  }

  if (lead.linkedIn && lead.linkedIn.trim()) {
    lines.push(`X-SOCIALPROFILE;type=linkedin:${lead.linkedIn}`);
  }

  // Build the NOTE from user notes and event context.
  const noteParts: string[] = [];
  if (lead.notes.trim()) {
    noteParts.push(lead.notes.trim());
  }
  if (lead.eventName.trim()) {
    noteParts.push(`Event: ${lead.eventName.trim()}`);
  }
  if (lead.scannedAt) {
    noteParts.push(`Scanned: ${lead.scannedAt}`);
  }
  if (noteParts.length > 0) {
    lines.push(`NOTE:${escapeVCardValue(noteParts.join(' | '))}`);
  }

  lines.push('END:VCARD');

  // vCard line endings are CRLF per the spec.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Generate a multi-contact .vcf file by concatenating individual
 * vCards.
 */
export function generateMultiVCard(leads: Lead[]): string {
  return leads.map(generateVCard).join('');
}

/**
 * Trigger a .vcf file download. On mobile browsers this usually
 * opens the native "Add to Contacts" prompt.
 */
export function downloadVCard(
  vcfContent: string,
  filename: string,
): void {
  const safeName = filename.endsWith('.vcf')
    ? filename
    : `${filename}.vcf`;

  const blob = new Blob([vcfContent], {
    type: 'text/vcard;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Download a single lead as a .vcf contact file.
 */
export function saveLeadAsContact(lead: Lead): void {
  const vcf = generateVCard(lead);
  const name =
    `${lead.firstName}_${lead.lastName}`.replace(/\s+/g, '_') ||
    'contact';
  downloadVCard(vcf, `${name}.vcf`);
}
