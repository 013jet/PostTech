import test from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError } from './client.ts'

test('API transport preserves session-expiry and conflict messages for forms', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Войдите снова.' }), { status: 401 })
  await assert.rejects(api('/workspace'), (error) => error instanceof ApiError && error.status === 401 && error.message === 'Войдите снова.')
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'ALREADY_DECIDED', message: 'Заявка уже рассмотрена.' }), { status: 409 })
  await assert.rejects(api('/requests/JP-1001/decision', 'POST', { decision: 'approved', comment: 'ok' }), (error) => error.code === 'ALREADY_DECIDED' && error.status === 409)
})
test('API transport reports offline/timeout and invalid proxy response without false success', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => { throw new TypeError('Network failed') }
  await assert.rejects(api('/workspace'), (error) => error.code === 'NETWORK_ERROR' && error.status === 0)
  globalThis.fetch = async () => new Response('<html>proxy error</html>', { status: 502 })
  await assert.rejects(api('/workspace'), (error) => error.code === 'SERVER_ERROR' && error.status === 502)
})
test('request retry keeps supplied idempotency key and sends same-origin credentials and CSRF header', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ id: 'JP-1001' }), { status: 201 }) }
  const body = { startDate: '2098-01-01', endDate: '2098-01-02', comment: 'Retry' }
  const key = '1f855ea1-a762-4e79-a5bd-e07452f7c186'
  assert.equal((await api('/requests', 'POST', body, key)).id, 'JP-1001')
  assert.equal((await api('/requests', 'POST', body, key)).id, 'JP-1001')
  assert.equal(calls[0].url, '/api/requests')
  assert.equal(calls[0].options.credentials, 'same-origin')
  assert.equal(calls[0].options.headers['X-Janamen-Request'], '1')
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key'])
  assert.equal(calls[0].options.body, calls[1].options.body)
  assert.equal(calls[0].options.headers.Authorization, undefined)
})
