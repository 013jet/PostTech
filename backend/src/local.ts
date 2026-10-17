import EmbeddedPostgres from 'embedded-postgres'
import { randomBytes } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createPool, localConfigPath } from './db.js'
import { migrate } from './migrate.js'
import { seed } from './seed.js'
import { startServer } from './server.js'

await mkdir(new URL('../.local/', import.meta.url), { recursive: true })
let config: { password: string; url: string }
try { config = JSON.parse(await readFile(localConfigPath, 'utf8')) } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  const password = randomBytes(24).toString('hex')
  config = { password, url: `postgresql://posttech:${password}@127.0.0.1:55432/posttech` }
  await writeFile(localConfigPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 })
}
const databaseDir = new URL('../.local/postgres/', import.meta.url)
const postgres = new EmbeddedPostgres({
  databaseDir: fileURLToPath(databaseDir), user: 'posttech', password: config.password,
  port: 55432, persistent: true, authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {}, onError: (message: unknown) => console.error(message),
})
try { await access(new URL('PG_VERSION', databaseDir)) } catch { console.log('Подготовка локального PostgreSQL…'); await postgres.initialise() }
await postgres.start()
const client = postgres.getPgClient('postgres', '127.0.0.1')
await client.connect()
try {
  if (!(await client.query("SELECT 1 FROM pg_database WHERE datname = 'posttech'")).rowCount) await client.query('CREATE DATABASE posttech')
} finally { await client.end() }
const pool = createPool(config.url)
await migrate(pool)
await seed(pool)
const app = await startServer(pool)
console.log('Локальный сервер готов. PostgreSQL: 127.0.0.1:55432. Данные сохраняются в backend/.local/.')
let closing = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  if (closing) return
  closing = true
  void app.close().then(() => postgres.stop())
})
