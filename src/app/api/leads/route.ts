import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

function noDB() {
  return NextResponse.json(
    { error: 'Database not configured. Set POSTGRES_URL environment variable.' },
    { status: 503 },
  );
}

// GET /api/leads — list all leads
export async function GET(request: NextRequest) {
  if (!process.env.POSTGRES_URL) return noDB();

  try {
    const { searchParams } = request.nextUrl;
    const event = searchParams.get('event');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
    const offset = Number(searchParams.get('offset')) || 0;

    let query = db
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    if (event) {
      query = query.where(eq(leads.eventName, event)) as typeof query;
    }

    const rows = await query;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[API /api/leads GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 },
    );
  }
}

// POST /api/leads — create or upsert lead(s)
export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) return noDB();

  try {
    const body = await request.json();
    const items: Record<string, unknown>[] = Array.isArray(body) ? body : [body];

    const results = [];
    for (const item of items) {
      const values = {
        id: item.id as string,
        firstName: (item.firstName as string) ?? null,
        lastName: (item.lastName as string) ?? null,
        company: (item.company as string) ?? null,
        title: (item.title as string) ?? null,
        email: (item.email as string) ?? null,
        phone: (item.phone as string) ?? null,
        notes: (item.notes as string) ?? null,
        tags: (item.tags as string[]) ?? [],
        eventName: (item.eventName as string) ?? null,
        scannedAt: (item.scannedAt as string) ?? null,
        source: (item.source as string) ?? null,
        syncStatus: (item.syncStatus as string) ?? 'synced',
        rawQRData: (item.rawQRData as string) ?? null,
        rawOCRText: (item.rawOCRText as string) ?? null,
        ocrConfidence: (item.ocrConfidence as number) ?? null,
      };

      const [row] = await db
        .insert(leads)
        .values(values)
        .onConflictDoUpdate({
          target: leads.id,
          set: {
            firstName: values.firstName,
            lastName: values.lastName,
            company: values.company,
            title: values.title,
            email: values.email,
            phone: values.phone,
            notes: values.notes,
            tags: values.tags,
            eventName: values.eventName,
            scannedAt: values.scannedAt,
            source: values.source,
            syncStatus: values.syncStatus,
            rawQRData: values.rawQRData,
            rawOCRText: values.rawOCRText,
            ocrConfidence: values.ocrConfidence,
            updatedAt: new Date(),
          },
        })
        .returning();

      results.push(row);
    }

    return NextResponse.json(
      Array.isArray(body) ? results : results[0],
      { status: 201 },
    );
  } catch (err) {
    console.error('[API /api/leads POST]', err);
    return NextResponse.json(
      { error: 'Failed to save lead(s)' },
      { status: 500 },
    );
  }
}
