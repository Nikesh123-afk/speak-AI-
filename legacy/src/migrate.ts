import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Database } from './db.js';
import { connect } from './db.js';
import { readConfig } from './config.js';

export async function migrate(db: Database) {
  await db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(734815)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
    for (const file of (await readdir('migrations')).filter(v => v.endsWith('.sql')).sort()) {
      if ((await tx.query('SELECT name FROM schema_migrations WHERE name=$1', [file])).rows.length) continue;
      // Migrations are trusted repository code, split into statements for both PostgreSQL drivers.
      const sql = await readFile(resolve('migrations', file), 'utf8');
      for (const statement of sql.split(';').map(v => v.trim()).filter(Boolean)) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const db = await connect(readConfig());
  try { await migrate(db); console.log('Database migrations applied.'); } finally { await db.close(); }
}
