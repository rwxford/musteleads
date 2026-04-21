import Dexie, { type EntityTable } from 'dexie';
import type { Lead } from '@/types/Lead';

const db = new Dexie('musteleads') as Dexie & {
  leads: EntityTable<Lead, 'id'>;
};

// Version 2: Added linkedIn, ocrConfidence, ocrEngine,
// exportStatus, exportedAt fields. Updated source and
// syncStatus enums.
db.version(2).stores({
  leads: 'id, email, lastName, company, eventName, scannedAt, syncStatus, source, exportStatus',
}).upgrade(tx => {
  return tx.table('leads').toCollection().modify(lead => {
    if (lead.linkedIn === undefined) lead.linkedIn = '';
    if (lead.ocrConfidence === undefined) lead.ocrConfidence = 0;
    if (lead.ocrEngine === undefined) lead.ocrEngine = 'none';
    if (lead.exportStatus === undefined) lead.exportStatus = 'not-exported';
    if (lead.exportedAt === undefined) lead.exportedAt = null;
    // Migrate old syncStatus values.
    if (lead.syncStatus === 'exported') {
      lead.syncStatus = 'synced';
      lead.exportStatus = 'exported';
    }
    if (lead.syncStatus === 'saved_to_contacts') {
      lead.syncStatus = 'synced';
    }
    // Migrate old source value.
    if (lead.source === 'badge_qr' && lead.ocrConfidence > 0) {
      lead.source = 'badge_ocr';
    }
  });
});

// Keep version 1 for existing databases that haven't upgraded yet.
db.version(1).stores({
  leads: 'id, email, lastName, company, eventName, scannedAt, syncStatus, source',
});

export { db };
