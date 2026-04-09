import Dexie, { type EntityTable } from 'dexie';
import type { Lead } from '@/types/Lead';

const db = new Dexie('musteleads') as Dexie & {
  leads: EntityTable<Lead, 'id'>;
};

db.version(1).stores({
  leads: 'id, email, lastName, company, eventName, scannedAt, syncStatus, source',
});

export { db };
