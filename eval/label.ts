/**
 * Draft-label generator. For every fixture image without a sidecar
 * JSON, calls the extraction endpoint (pipeline A, so we also get
 * OCR text) and writes a DRAFT label file next to the image.
 *
 * A draft is NOT gold. Open each <name>.json, correct the fields to
 * the ground truth, and remove the "_draft": true flag (or set it
 * to false). The eval runner ignores files still marked _draft.
 *
 * Usage:
 *   pnpm eval:label           # or: npx tsx eval/label.ts
 *
 * Environment:
 *   EVAL_ENDPOINT   Default https://musteleads.vercel.app/api/extract
 *   EVAL_MODEL      Optional model override.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const CATEGORIES = ['badges', 'cards'] as const;
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const ENDPOINT =
  process.env.EVAL_ENDPOINT || 'https://musteleads.vercel.app/api/extract';
const MODEL = process.env.EVAL_MODEL || undefined;

function mimeFor(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

async function draftLabel(imagePath: string, category: string) {
  const ext = extname(imagePath).toLowerCase();
  const b64 = readFileSync(imagePath).toString('base64');
  const dataUrl = `data:${mimeFor(ext)};base64,${b64}`;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: dataUrl,
      mode: category === 'cards' ? 'card' : 'badge',
      pipeline: 'A',
      mimeType: mimeFor(ext),
      ...(MODEL ? { model: MODEL } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return {
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    company: data.company ?? '',
    title: data.title ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    linkedIn: data.linkedIn ?? '',
    eventName: data.eventName ?? '',
    notes: '',
    _draft: true,
  };
}

async function main() {
  let drafted = 0;
  let skipped = 0;
  for (const category of CATEGORIES) {
    const dir = join(FIXTURES, category);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const ext = extname(file).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const name = basename(file, ext);
      const labelPath = join(dir, `${name}.json`);
      if (existsSync(labelPath)) {
        skipped++;
        continue;
      }
      const imagePath = join(dir, file);
      try {
        process.stdout.write(`Drafting ${category}/${file} ... `);
        const label = await draftLabel(imagePath, category);
        writeFileSync(labelPath, JSON.stringify(label, null, 2) + '\n');
        console.log('done');
        drafted++;
      } catch (err) {
        console.log(`failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  console.log(
    `\nDrafted ${drafted} label(s), skipped ${skipped} already labeled.`,
  );
  if (drafted > 0) {
    console.log(
      'Open each new .json, correct the fields to ground truth, then remove "_draft": true.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
