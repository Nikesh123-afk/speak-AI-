import pg from 'pg';
import type { Config } from './config.js';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function postgres(connectionString: string, ssl = false): Database {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 10000, ssl: ssl ? { rejectUnauthorized: true } : false });
  pool.on('error', () => console.error('PostgreSQL idle connection failed'));
  return {
    async query<T>(sql: string, values?: unknown[]) { const result = await pool.query(sql, values); return { rows: result.rows as T[] }; },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn(client as Queryable); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end()
  };
}

// Loaded lazily so production images never initialise the embedded engine.
export async function embedded(path?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(path);
  await db.waitReady;
  return {
    query: <T>(sql: string, values?: unknown[]) => db.query<T>(sql, values),
    transaction: fn => db.transaction(tx => fn({ query: <T>(sql: string, values?: unknown[]) => tx.query<T>(sql, values) })),
    close: () => db.close()
  };
}

export async function connect(config: Config): Promise<Database> {
  if (config.DATABASE_URL) return postgres(config.DATABASE_URL, config.DATABASE_SSL);
  if (config.NODE_ENV === 'production') throw new Error('PostgreSQL is required in production');
  return embedded('.data/postgres');
}
