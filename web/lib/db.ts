import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { fail } from './domain';
import { SCHEMA_SQL } from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __dbInitPromise: Promise<void> | undefined;
}

function getPool(): Pool {
  if (globalThis.__pgPool) return globalThis.__pgPool;

  const connectionString = process.env.DATABASE_URL;
  let pool: Pool;

  if (connectionString) {
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX || 10),
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    });
  } else {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      database: process.env.POSTGRES_DB || 'postgres',
      max: Number(process.env.DB_POOL_MAX || 10)
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__pgPool = pool;
  }
  return pool;
}

export const db = getPool();

export async function ensureDb(): Promise<void> {
  if (!globalThis.__dbInitPromise) {
    globalThis.__dbInitPromise = (async () => {
      try {
        await db.query(SCHEMA_SQL);
      } catch (err) {
        console.error('Failed to initialize database schema:', err);
        globalThis.__dbInitPromise = undefined;
        throw err;
      }
    })();
  }
  return globalThis.__dbInitPromise;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureDb();
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const res = await fn(c);
    await c.query('COMMIT');
    return res;
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// Low-volume MVP: serialize membership-changing and room-write operations.
export async function roomTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(271828)');
    return fn(c);
  });
}

export async function rateLimit(key: string, limit: number, minutes: number): Promise<void> {
  return tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    const { rows } = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM rate_events WHERE bucket=$1 AND created_at>now()-($2::int*interval '1 minute')",
      [key, minutes]
    );
    if ((rows[0]?.n ?? 0) >= limit) {
      fail(429, 'Terlalu banyak percobaan. Coba beberapa saat lagi.');
    }
    await c.query('INSERT INTO rate_events(bucket) VALUES($1)', [key]);
  });
}
