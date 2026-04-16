import { NextRequest, NextResponse } from 'next/server';
import { db, hasDatabase } from '@/db';
import { leads } from '@/db/schema';
import { eq } from 'drizzle-orm';

function noDB() {
  return NextResponse.json(
    { error: 'Database not configured. Set POSTGRES_URL or DATABASE_URL environment variable.' },
    { status: 503 },
  );
}

// GET /api/leads/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasDatabase()) return noDB();

  try {
    const { id } = await params;
    const [row] = await db.select().from(leads).where(eq(leads.id, id));
    if (!row) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    console.error('[API /api/leads/[id] GET]', err);
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
  }
}

// PATCH /api/leads/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasDatabase()) return noDB();

  try {
    const { id } = await params;
    const updates = await request.json();

    // Only allow updating known fields.
    const allowed: Record<string, unknown> = {};
    const fields = [
      'firstName', 'lastName', 'company', 'title', 'email',
      'phone', 'notes', 'tags', 'eventName', 'source',
      'syncStatus', 'rawQRData', 'rawOCRText', 'ocrConfidence',
    ] as const;
    for (const f of fields) {
      if (f in updates) allowed[f] = updates[f];
    }
    allowed.updatedAt = new Date();

    const [row] = await db
      .update(leads)
      .set(allowed)
      .where(eq(leads.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    console.error('[API /api/leads/[id] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}

// DELETE /api/leads/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasDatabase()) return noDB();

  try {
    const { id } = await params;
    const [row] = await db.delete(leads).where(eq(leads.id, id)).returning();
    if (!row) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    console.error('[API /api/leads/[id] DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}
