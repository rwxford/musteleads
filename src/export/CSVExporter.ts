import type { Lead } from '@/types/Lead';

export interface ExportFilter {
  eventName?: string;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  syncStatus?: Lead['syncStatus'];
  onlyUnexported?: boolean;
}

/**
 * CSV column headers matching Salesforce Lead import wizard.
 */
const CSV_HEADERS = [
  'First Name',
  'Last Name',
  'Company',
  'Title',
  'Email',
  'Phone',
  'Lead Source',
  'Description',
  'Event Name',
  'Scanned At',
] as const;

/**
 * Escape a single CSV field per RFC 4180. Fields containing
 * commas, double quotes, or newlines are wrapped in double
 * quotes, and any embedded double quotes are doubled.
 */
function escapeCSVField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Filter leads based on export criteria.
 * De-duplicates by email, keeping the most recently scanned entry.
 */
export function filterLeads(leads: Lead[], filter: ExportFilter): Lead[] {
  let result = leads;

  if (filter.eventName) {
    const name = filter.eventName.toLowerCase();
    result = result.filter(
      (l) => l.eventName.toLowerCase() === name,
    );
  }

  if (filter.dateFrom) {
    const from = new Date(filter.dateFrom).getTime();
    result = result.filter(
      (l) => new Date(l.scannedAt).getTime() >= from,
    );
  }

  if (filter.dateTo) {
    const to = new Date(filter.dateTo).getTime();
    result = result.filter(
      (l) => new Date(l.scannedAt).getTime() <= to,
    );
  }

  if (filter.tags && filter.tags.length > 0) {
    const required = new Set(filter.tags.map((t) => t.toLowerCase()));
    result = result.filter((l) =>
      l.tags.some((t) => required.has(t.toLowerCase())),
    );
  }

  if (filter.syncStatus) {
    result = result.filter(
      (l) => l.syncStatus === filter.syncStatus,
    );
  }

  if (filter.onlyUnexported) {
    result = result.filter((l) => l.syncStatus === 'pending');
  }

  // De-duplicate by email (case-insensitive), keeping the most
  // recently scanned entry.
  const seen = new Map<string, Lead>();
  for (const lead of result) {
    const key = lead.email.trim().toLowerCase();
    if (!key) {
      // Leads without an email are never de-duplicated.
      seen.set(lead.id, lead);
      continue;
    }
    const existing = seen.get(key);
    if (
      !existing ||
      new Date(lead.scannedAt).getTime() >
        new Date(existing.scannedAt).getTime()
    ) {
      seen.set(key, lead);
    }
  }

  return Array.from(seen.values());
}

/**
 * Map a single lead to an array of field values in the same
 * order as CSV_HEADERS.
 */
function leadToRow(lead: Lead): string[] {
  return [
    lead.firstName,
    lead.lastName,
    lead.company,
    lead.title,
    lead.email,
    lead.phone,
    lead.tags.join('; '),
    lead.notes,
    lead.eventName,
    lead.scannedAt,
  ];
}

/**
 * Generate a CSV string from leads. Uses proper CSV escaping
 * per RFC 4180.
 */
export function generateCSV(leads: Lead[]): string {
  const rows: string[] = [];

  // Header row.
  rows.push(CSV_HEADERS.map(escapeCSVField).join(','));

  // Data rows.
  for (const lead of leads) {
    rows.push(leadToRow(lead).map(escapeCSVField).join(','));
  }

  // Trailing newline so the file ends cleanly.
  return rows.join('\r\n') + '\r\n';
}

/**
 * Trigger a CSV file download in the browser by creating a
 * temporary anchor element.
 */
export function downloadCSV(
  csvContent: string,
  filename: string,
): void {
  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv')
    ? filename
    : `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Clean up after a short delay so the browser can start the
  // download before the object URL is revoked.
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Use the Web Share API if available (common on mobile), and
 * fall back to a plain download otherwise.
 */
export async function shareCSV(
  csvContent: string,
  filename: string,
): Promise<void> {
  const safeName = filename.endsWith('.csv')
    ? filename
    : `${filename}.csv`;

  const file = new File([csvContent], safeName, {
    type: 'text/csv',
  });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: 'Lead Export',
      text: `Exported ${safeName}`,
    });
    return;
  }

  downloadCSV(csvContent, safeName);
}
