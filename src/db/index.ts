import { createPool } from '@vercel/postgres';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import * as schema from './schema';

/**
 * Resolve the Postgres connection URL from whichever env var
 * Vercel or Neon decided to set. Vercel Storage integration
 * rotates between these names depending on how the DB was linked.
 */
export function getPostgresUrl(): string | undefined {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL
  );
}

const connectionString = getPostgresUrl();

const pool = connectionString
  ? createPool({ connectionString })
  : undefined;

// Drizzle instance — only usable when a connection string exists.
// API routes guard with hasDatabase() before touching db.
export const db = pool ? drizzle(pool, { schema }) : (undefined as never);

export function hasDatabase(): boolean {
  return !!connectionString;
}
