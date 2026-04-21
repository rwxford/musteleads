import { pgTable, text, timestamp, real, jsonb, uuid, integer } from 'drizzle-orm/pg-core';

export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  company: text('company'),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  linkedIn: text('linkedin'),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]),
  eventName: text('event_name'),
  scannedAt: text('scanned_at'),
  source: text('source'),
  ocrConfidence: real('ocr_confidence'),
  ocrEngine: text('ocr_engine'),
  syncStatus: text('sync_status').default('pending'),
  exportStatus: text('export_status').default('not-exported'),
  exportedAt: text('exported_at'),
  rawQRData: text('raw_qr_data'),
  rawOCRText: text('raw_ocr_text'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const traces = pgTable('traces', {
  id: text('id').primaryKey(),
  mode: text('mode'),
  ocrEngine: text('ocr_engine'),
  ocrConfidence: real('ocr_confidence'),
  durationMs: integer('duration_ms'),
  ocrRawText: text('ocr_raw_text'),
  ocrLines: jsonb('ocr_lines').$type<string[]>(),
  cleanedLines: jsonb('cleaned_lines').$type<string[]>(),
  classificationLog: jsonb('classification_log').$type<string[]>(),
  finalResult: jsonb('final_result'),
  rawImageUrl: text('raw_image_url'),
  steps: jsonb('steps'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const logs = pgTable('logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  source: text('source'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});
