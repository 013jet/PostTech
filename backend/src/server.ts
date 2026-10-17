import { pathToFileURL } from 'node:url'
import type { Pool } from 'pg'
import { createPool, databaseUrl } from './db.js'
import { buildApp } from './app.js'

export async function startServer(pool: Pool) {
  const app = await buildApp(pool, { logger: true })
  app.addHook('onClose', async () => { await pool.end() })
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 3001) })
  return app
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startServer(createPool(await databaseUrl()))
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close() })
}
