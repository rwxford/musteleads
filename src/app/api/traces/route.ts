import { NextRequest, NextResponse } from 'next/server';
import { db, hasDatabase } from '@/db';
import { traces } from '@/db/schema';
import { desc } from 'drizzle-orm';

function noDB() {
  return NextResponse.json(
    { error: 'Database not configured. Set POSTGRES_URL or DATABASE_URL environment variable.' },
    { status: 503 },
  );
}

// GET /api/traces — list recent traces (last 50)
export async function GET() {
  if (!hasDatabase()) return noDB();

  try {
    const rows = await db
      .select()
      .from(traces)
      .orderBy(desc(traces.createdAt))
      .limit(50);

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[API /api/traces GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch traces' },
      { status: 500 },
    );
  }
}

// POST /api/traces — save a trace from client
export async function POST(request: NextRequest) {
  if (!hasDatabase()) return noDB();

  try {
    const body = await request.json();

    const values = {
      id: body.id as string,
      mode: (body.mode as string) ?? null,
      ocrConfidence: (body.ocrConfidence as number) ?? null,
      durationMs: (body.durationMs as number) ?? null,
      ocrRawText: (body.ocrRawText as string) ?? null,
      ocrLines: (body.ocrLines as string[]) ?? null,
      cleanedLines: (body.cleanedLines as string[]) ?? null,
      classificationLog: (body.classificationLog as string[]) ?? null,
      finalResult: body.finalResult ?? null,
      // Do NOT store full raw image data URLs — truncate to a size
      // note or skip entirely.
      rawImageUrl: body.rawImageDataUrl
        ? `[image ${Math.round(String(body.rawImageDataUrl).length / 1024)}KB]`
        : null,
      steps: body.steps ?? null,
    };

    const [row] = await db.insert(traces).values(values).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[API /api/traces POST]', err);
    return NextResponse.json(
      { error: 'Failed to save trace' },
      { status: 500 },
    );
  }
}
