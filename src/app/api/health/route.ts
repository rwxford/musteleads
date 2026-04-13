import { NextResponse } from 'next/server';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { sql } from 'drizzle-orm';

// GET /api/health — returns { status, db, timestamp }
export async function GET() {
  const timestamp = new Date().toISOString();

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { status: 'degraded', db: false, timestamp, error: 'POSTGRES_URL not set' },
      { status: 503 },
    );
  }

  try {
    // Simple query to verify DB connectivity.
    await db.select({ count: sql<number>`1` }).from(leads).limit(1);
    return NextResponse.json({ status: 'ok', db: true, timestamp });
  } catch (err) {
    console.error('[API /api/health]', err);
    return NextResponse.json(
      { status: 'degraded', db: false, timestamp, error: 'DB connection failed' },
      { status: 503 },
    );
  }
}
