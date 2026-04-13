import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { logs } from '@/db/schema';
import { desc, eq, and } from 'drizzle-orm';

function noDB() {
  return NextResponse.json(
    { error: 'Database not configured. Set POSTGRES_URL environment variable.' },
    { status: 503 },
  );
}

// GET /api/logs — list recent logs (last 100), filterable by level and source
export async function GET(request: NextRequest) {
  if (!process.env.POSTGRES_URL) return noDB();

  try {
    const { searchParams } = request.nextUrl;
    const level = searchParams.get('level');
    const source = searchParams.get('source');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

    const conditions = [];
    if (level) conditions.push(eq(logs.level, level));
    if (source) conditions.push(eq(logs.source, source));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const rows = await db
      .select()
      .from(logs)
      .where(where)
      .orderBy(desc(logs.createdAt))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[API /api/logs GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 },
    );
  }
}

// POST /api/logs — write a log entry
export async function POST(request: NextRequest) {
  if (!process.env.POSTGRES_URL) return noDB();

  try {
    const body = await request.json();

    if (!body.level || !body.message) {
      return NextResponse.json(
        { error: 'Missing required fields: level, message' },
        { status: 400 },
      );
    }

    const userAgent = request.headers.get('user-agent') ?? null;

    const [row] = await db
      .insert(logs)
      .values({
        level: body.level,
        message: body.message,
        data: body.data ?? null,
        source: body.source ?? null,
        userAgent,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[API /api/logs POST]', err);
    return NextResponse.json(
      { error: 'Failed to save log' },
      { status: 500 },
    );
  }
}
