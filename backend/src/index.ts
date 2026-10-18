import { attachDatabasePool } from '@vercel/functions'
import { buildApp } from './app.js'
import { createPool } from './db.js'
import { deploymentOptions } from './deployment.js'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the hosted API')
const pool = createPool(process.env.DATABASE_URL)
attachDatabasePool(pool)
const app = await buildApp(pool, deploymentOptions())
await app.ready()

// The Fastify framework adapter accepts the exported instance.
export default app
