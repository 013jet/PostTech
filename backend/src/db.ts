import pg from 'pg'
import type { PoolClient } from 'pg'
import { readFile } from 'node:fs/promises'

pg.types.setTypeParser(1082, (value: string) => value)
export const localConfigPath = new URL('../.local/database.json', import.meta.url)

export async function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const config = JSON.parse(await readFile(localConfigPath, 'utf8'))
    return config.url as string
  } catch {
    throw new Error('База не настроена. Запустите pnpm dev:local или задайте DATABASE_URL в .env.')
  }
}

export function createPool(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: process.env.VERCEL ? 5 : 10, connectionTimeoutMillis: 15000, idleTimeoutMillis: 5000 })
  pool.on('error', (error) => console.error('PostgreSQL connection error:', error.message))
  return pool
}

export async function transaction<T>(pool: pg.Pool, work: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
