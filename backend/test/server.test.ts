import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { createPool, databaseUrl } from '../src/db.js'
import { startServer } from '../src/server.js'

test('server startup releases its database pool when the listening port is busy', async () => {
  const blocker = createServer()
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(0, '127.0.0.1', resolve)
  })
  const previousPort = process.env.PORT
  const pool = createPool(await databaseUrl())
  const end = pool.end.bind(pool)
  let closes = 0
  pool.end = async () => { ++closes; await end() }
  try {
    process.env.PORT = String((blocker.address() as AddressInfo).port)
    await assert.rejects(startServer(pool), { code: 'EADDRINUSE' })
    assert.equal(closes, 1, 'Failed startup must close the pool without requiring a signal')
  } finally {
    if (previousPort === undefined) delete process.env.PORT
    else process.env.PORT = previousPort
    if (!closes) await pool.end()
    await new Promise<void>((resolve, reject) => blocker.close(error => error ? reject(error) : resolve()))
  }
})

test('server startup releases its pool when the port configuration is invalid', async () => {
  const previousPort = process.env.PORT
  const pool = createPool(await databaseUrl())
  const end = pool.end.bind(pool)
  let closes = 0
  pool.end = async () => { ++closes; await end() }
  try {
    process.env.PORT = 'not-a-port'
    await assert.rejects(startServer(pool))
    assert.equal(closes, 1)
  } finally {
    if (previousPort === undefined) delete process.env.PORT
    else process.env.PORT = previousPort
    if (!closes) await pool.end()
  }
})

test('server serves health over HTTP and closes its active pool exactly once', async () => {
  const previousPort = process.env.PORT
  const pool = createPool(await databaseUrl())
  const end = pool.end.bind(pool)
  let closes = 0
  pool.end = async () => { ++closes; await end() }
  try {
    process.env.PORT = '0'
    const app = await startServer(pool)
    try {
      const port = (app.server.address() as AddressInfo).port
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { status: 'ok', database: 'postgresql' })
      assert.equal(closes, 0)
    } finally {
      await app.close()
    }
    assert.equal(closes, 1)
    assert.equal(pool.totalCount, 0)
  } finally {
    if (previousPort === undefined) delete process.env.PORT
    else process.env.PORT = previousPort
    if (!closes) await pool.end()
  }
})
