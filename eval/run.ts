/**
 * Eval runner. Scores both extraction pipelines against the labeled
 * gold set in eval/fixtures and writes eval/report.md.
 *
 * Usage:
 *   pnpm eval                 # or: npx tsx eval/run.ts
 *
 * Environment:
 *   EVAL_ENDPOINT   Extraction endpoint. Default:
 *                   https://musteleads.vercel.app/api/extract
 *   EVAL_PIPELINES  Comma list of pipelines to run. Default: A,B
 *   EVAL_MODEL      Optional model override passed to the endpoint.
 *   EVAL_CONCURRENCY Parallel requests. Default: 3
 *
 * The endpoint must have GEMINI_API_KEY configured (and, for
 * pipeline A, GOOGLE_CLOUD_VISION_API_KEY). No model keys are needed
 * locally because scoring goes through the deployed route.
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
const PIPELINES = (process.env.EVAL_PIPELINES || 'A,B')
  .split(',')
  .map((p) => p.trim().toUpperCase())
  .filter(Boolean);
const MODEL = process.env.EVAL_MODEL || undefined;
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 3);

const SCORED_FIELDS = [
  'firstName',
  'lastName',
  'company',
  'title',
  'email',
  'phone',
  'linkedIn',
  'eventName',
] as const;
type Field = (typeof SCORED_FIELDS)[number];

interface Label {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  eventName?: string;
  _skip?: boolean;
  _draft?: boolean;
}

interface Fixture {
  category: string;
  imagePath: string;
  name: string;
  label: Label;
}

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

function norm(s: string | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9@. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normField(field: Field, value: string | undefined): string {
  if (field === 'phone') return (value || '').replace(/\D/g, '');
  if (field === 'email' || field === 'linkedIn') {
    return (value || '').toLowerCase().replace(/\s+/g, '').trim();
  }
  return norm(value);
}

function loadFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const category of CATEGORIES) {
    const dir = join(FIXTURES, category);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const ext = extname(file).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const name = basename(file, ext);
      const labelPath = join(dir, `${name}.json`);
      if (!existsSync(labelPath)) continue;
      let label: Label;
      try {
        label = JSON.parse(readFileSync(labelPath, 'utf8'));
      } catch {
        console.warn(`Skipping ${file}: invalid label JSON.`);
        continue;
      }
      if (label._skip) continue;
      if (label._draft) {
        console.warn(`Skipping ${file}: label still marked _draft.`);
        continue;
      }
      out.push({ category, imagePath: join(dir, file), name, label });
    }
  }
  return out;
}

interface ExtractResult {
  fields: Record<string, string>;
  meta?: { latencyMs?: number; ocrConfidence?: number; model?: string };
  error?: string;
  confidence?: number;
}

async function callExtract(
  imagePath: string,
  pipeline: string,
): Promise<ExtractResult> {
  const ext = extname(imagePath).toLowerCase();
  const b64 = readFileSync(imagePath).toString('base64');
  const dataUrl = `data:${mimeFor(ext)};base64,${b64}`;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        mode: imagePath.includes('/cards/') ? 'card' : 'badge',
        pipeline,
        mimeType: mimeFor(ext),
        ...(MODEL ? { model: MODEL } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { fields: {}, error: data.error || `HTTP ${res.status}` };
    }
    const fields: Record<string, string> = {};
    for (const f of SCORED_FIELDS) fields[f] = data[f] ?? '';
    return {
      fields,
      meta: data._meta,
      confidence: data.confidence,
    };
  } catch (err) {
    return { fields: {}, error: err instanceof Error ? err.message : String(err) };
  }
}

interface Score {
  perField: Record<Field, { correct: number; total: number }>;
  exactRows: number;
  totalRows: number;
  latencyMs: number[];
  errors: number;
}

function emptyScore(): Score {
  const perField = {} as Score['perField'];
  for (const f of SCORED_FIELDS) perField[f] = { correct: 0, total: 0 };
  return { perField, exactRows: 0, totalRows: 0, latencyMs: [], errors: 0 };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function pct(c: number, t: number): string {
  if (t === 0) return 'n/a';
  return `${Math.round((c / t) * 1000) / 10}%`;
}

async function main() {
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    console.log(
      'No labeled fixtures found. Add images to eval/fixtures/{badges,cards}\n' +
        'and create label sidecars (or run `pnpm eval:label`).',
    );
    process.exit(0);
  }

  console.log(
    `Scoring ${fixtures.length} fixture(s) over pipeline(s) ${PIPELINES.join(', ')} via ${ENDPOINT}`,
  );

  const scores: Record<string, Score> = {};
  const perImageLines: string[] = [];

  for (const pipeline of PIPELINES) {
    scores[pipeline] = emptyScore();
  }

  type Row = { fixture: Fixture; pipeline: string };
  const rows: Row[] = [];
  for (const fixture of fixtures) {
    for (const pipeline of PIPELINES) rows.push({ fixture, pipeline });
  }

  const results = await mapLimit(rows, CONCURRENCY, async (row) => {
    const r = await callExtract(row.fixture.imagePath, row.pipeline);
    return { row, r };
  });

  for (const { row, r } of results) {
    const score = scores[row.pipeline];
    score.totalRows++;
    if (r.error) {
      score.errors++;
      perImageLines.push(
        `| ${row.fixture.category}/${row.fixture.name} | ${row.pipeline} | ERROR | ${r.error} |`,
      );
      continue;
    }
    if (r.meta?.latencyMs) score.latencyMs.push(r.meta.latencyMs);

    let allCorrect = true;
    const wrong: string[] = [];
    for (const f of SCORED_FIELDS) {
      const expected = normField(f, row.fixture.label[f]);
      const actual = normField(f, r.fields[f]);
      const correct = expected === actual;
      score.perField[f].total++;
      if (correct) score.perField[f].correct++;
      else {
        allCorrect = false;
        wrong.push(`${f}: "${r.fields[f] ?? ''}" != "${row.fixture.label[f] ?? ''}"`);
      }
    }
    if (allCorrect) score.exactRows++;
    perImageLines.push(
      `| ${row.fixture.category}/${row.fixture.name} | ${row.pipeline} | ${
        allCorrect ? 'PASS' : 'FAIL'
      } | ${wrong.join('; ') || 'all fields match'} |`,
    );
  }

  // Build report.
  const lines: string[] = [];
  lines.push('# Musteleads extraction eval report');
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Endpoint: ${ENDPOINT}`);
  lines.push(`- Fixtures: ${fixtures.length}`);
  lines.push(`- Pipelines: ${PIPELINES.join(', ')}`);
  lines.push('');

  lines.push('## Scorecard');
  lines.push('');
  const header = ['Metric', ...PIPELINES.map((p) => `Pipeline ${p}`)];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);

  const rowFor = (label: string, get: (p: string) => string) =>
    `| ${label} | ${PIPELINES.map(get).join(' | ')} |`;

  lines.push(
    rowFor('Exact row match', (p) =>
      pct(scores[p].exactRows, scores[p].totalRows - scores[p].errors),
    ),
  );
  for (const f of SCORED_FIELDS) {
    lines.push(
      rowFor(f, (p) => pct(scores[p].perField[f].correct, scores[p].perField[f].total)),
    );
  }
  lines.push(
    rowFor('Errors', (p) => String(scores[p].errors)),
  );
  lines.push(
    rowFor('Avg latency ms', (p) => {
      const l = scores[p].latencyMs;
      if (l.length === 0) return 'n/a';
      return String(Math.round(l.reduce((a, b) => a + b, 0) / l.length));
    }),
  );

  // Overall field accuracy.
  lines.push(
    rowFor('Overall field acc', (p) => {
      let c = 0;
      let t = 0;
      for (const f of SCORED_FIELDS) {
        c += scores[p].perField[f].correct;
        t += scores[p].perField[f].total;
      }
      return pct(c, t);
    }),
  );

  lines.push('');
  lines.push('## Per image');
  lines.push('');
  lines.push('| Fixture | Pipeline | Result | Notes |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(...perImageLines.sort());
  lines.push('');

  const reportPath = join(HERE, 'report.md');
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`\nWrote ${reportPath}`);

  // Console summary.
  for (const p of PIPELINES) {
    let c = 0;
    let t = 0;
    for (const f of SCORED_FIELDS) {
      c += scores[p].perField[f].correct;
      t += scores[p].perField[f].total;
    }
    console.log(
      `Pipeline ${p}: overall field acc ${pct(c, t)}, exact rows ${pct(
        scores[p].exactRows,
        scores[p].totalRows - scores[p].errors,
      )}, errors ${scores[p].errors}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
