import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type pg from 'pg'
import { createPool, databaseUrl, transaction } from './db.js'

export async function migrate(pool: pg.Pool) {
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(771254)')
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const directory = new URL('../migrations/', import.meta.url)
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rowCount) continue
      await client.query(await readFile(new URL(name, directory), 'utf8'))
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name])
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool(await databaseUrl())
  try { await migrate(pool); console.log('Миграции применены.') } finally { await pool.end() }
}
