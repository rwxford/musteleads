const STORAGE_KEY = 'musteleads_exports';

export interface ExportRecord {
  id: string;
  exportedAt: string;
  leadCount: number;
  format: 'csv' | 'vcf';
  filter?: string; // JSON string of the filter used.
  leadIds: string[];
}

/**
 * Read the raw export records array from localStorage.
 * Returns an empty array when nothing is stored or when the
 * stored value is not valid JSON.
 */
function readRecords(): ExportRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExportRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persist the records array to localStorage.
 */
function writeRecords(records: ExportRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/**
 * Record an export event by appending it to the stored history.
 */
export function recordExport(record: ExportRecord): void {
  const records = readRecords();
  records.push(record);
  writeRecords(records);
}

/**
 * Get every recorded export, ordered chronologically (oldest
 * first, matching insertion order).
 */
export function getExportHistory(): ExportRecord[] {
  return readRecords();
}

/**
 * Collect the unique IDs of every lead that has appeared in at
 * least one export.
 */
export function getExportedLeadIds(): Set<string> {
  const records = readRecords();
  const ids = new Set<string>();
  for (const record of records) {
    for (const id of record.leadIds) {
      ids.add(id);
    }
  }
  return ids;
}
