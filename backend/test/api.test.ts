import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../src/app.js'
import { createPool, databaseUrl } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { localPassword, seed } from '../src/seed.js'

test('PostgreSQL: authentication, authorization and leave lifecycle', async (t) => {
  const connection = await databaseUrl()
  const admin = createPool(connection)
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(connection)
  url.searchParams.set('options', `-c search_path=${schema}`)
  const pool = createPool(url.href)
  let app = await buildApp(pool)
  const headers = { host: '127.0.0.1:3001', 'x-janamen-request': '1' }
  const send = (method: 'GET' | 'POST' | 'PATCH', path: string, cookie = '', payload?: unknown, extra = {}) => app.inject({ method, url: path, headers: { ...headers, cookie, ...extra }, ...(payload !== undefined ? { payload } : {}) })
  const login = async (email: string) => {
    const response = await send('POST', '/api/auth/login', '', { email, password: localPassword })
    assert.equal(response.statusCode, 200)
    const value = response.headers['set-cookie'] as string
    assert.match(value, /HttpOnly/i)
    assert.match(value, /SameSite=Strict/i)
    return value.split(';')[0]
  }
  const create = (cookie: string, startDate: string, endDate: string, sourceRequestId?: string, key = randomUUID()) => send('POST', '/api/requests', cookie, { startDate, endDate, comment: 'API integration test', ...(sourceRequestId ? { sourceRequestId } : {}) }, { 'idempotency-key': key })
  const decide = (id: string, decision = 'approved', comment = 'Согласовано') => send('POST', `/api/requests/${id}/decision`, manager, { decision, comment })
  let employee = '', manager = '', outside = '', first = ''
  try {
    await migrate(pool)
    await seed(pool)
    await t.test('login, denied anonymous and invalid credentials; CSRF/origin/overposting protection', async () => {
      assert.equal((await send('GET', '/api/workspace')).statusCode, 401)
      assert.equal((await send('POST', '/api/auth/login', '', { email: 'employee@janamen.local', password: 'wrong' })).statusCode, 401)
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', headers: { host: 'localhost' }, payload: { email: 'employee@janamen.local', password: localPassword } })).statusCode, 403)
      assert.equal((await send('POST', '/api/auth/login', '', { email: 'employee@janamen.local', password: localPassword }, { origin: 'https://foreign.example' })).statusCode, 403)
      employee = await login('employee@janamen.local'); manager = await login('manager@janamen.local'); outside = await login('outside@janamen.local')
      assert.equal((await send('POST', '/api/requests', employee, { startDate: '2098-01-01', endDate: '2098-01-03', comment: '', status: 'approved', employeeId: 'employee-timur' }, { 'idempotency-key': randomUUID() })).statusCode, 400)
    })
    await t.test('creation is idempotent, numbered by server and visible only to owner/team', async () => {
      const key = randomUUID()
      const response = await create(employee, '2098-01-01', '2098-01-03', undefined, key)
      assert.equal(response.statusCode, 201)
      first = response.json().id
      assert.equal((await create(employee, '2098-01-01', '2098-01-03', undefined, key)).json().id, first)
      assert.equal((await create(employee, '2098-01-01', '2098-01-04', undefined, key)).statusCode, 409)
      const state = (await send('GET', '/api/workspace', employee)).json()
      assert.equal(state.requests.length, 1)
      assert.equal(state.requests[0].history.length, 2)
      assert.equal(state.requests[0].days, 3)
      assert.equal(state.profiles.length, 1)
      assert.equal((await send('GET', '/api/workspace', manager)).json().requests.length, 1)
      assert.equal((await send('GET', '/api/workspace', outside)).json().requests.length, 0)
      assert.equal((await create(manager, '2098-01-01', '2098-01-02')).statusCode, 403)
      assert.equal((await send('POST', `/api/requests/${first}/decision`, employee, { decision: 'approved', comment: 'not allowed' })).statusCode, 403)
      assert.equal((await send('POST', `/api/requests/${first}/withdraw`, outside, {})).statusCode, 403)
    })
    await t.test('required comment, atomic approval, single debit/history/notification', async () => {
      assert.equal((await decide(first, 'rejected', '   ')).statusCode, 400)
      assert.equal((await decide(first)).statusCode, 200)
      assert.equal((await decide(first)).statusCode, 409)
      const state = (await send('GET', '/api/workspace', employee)).json()
      assert.equal(state.requests[0].status, 'approved')
      assert.equal(state.requests[0].deductedVacationDays, 3)
      assert.equal(state.requests[0].history.length, 3)
      assert.equal(state.notifications.filter((n: { title: string }) => n.title === 'Отпуск одобрен').length, 1)
      assert.equal((await pool.query('SELECT sum(days)::int AS used FROM vacation_debits')).rows[0].used, 3)
      assert.equal((await create(employee, '2098-01-03', '2098-01-04')).statusCode, 409)
      assert.equal((await create(employee, '2098-02-01', '2098-02-16')).statusCode, 409)
      assert.equal((await create(employee, '2098-02-30', '2098-03-02')).statusCode, 400)
    })
    await t.test('simultaneous approvals of different pending requests cannot overspend', async () => {
      const a = await create(employee, '2098-03-01', '2098-03-10')
      const b = await create(employee, '2098-04-01', '2098-04-10')
      assert.equal(a.statusCode, 201); assert.equal(b.statusCode, 201)
      const results = await Promise.all([decide(a.json().id), decide(b.json().id)])
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409])
      const blocked = results[0].statusCode === 409 ? a.json().id : b.json().id
      assert.equal((await decide(blocked, 'rejected', 'Недостаточно дней')).statusCode, 200)
      assert.equal((await pool.query('SELECT sum(days)::int AS used FROM vacation_debits')).rows[0].used, 13)
    })
    await t.test('inclusive overlap is rechecked on concurrent approval; rejection still available', async () => {
      const a = (await create(employee, '2098-05-01', '2098-05-02')).json().id
      const b = (await create(employee, '2098-05-02', '2098-05-03')).json().id
      const results = await Promise.all([decide(a), decide(b)])
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409])
      const blockedIndex = results.findIndex((r) => r.statusCode === 409)
      assert.equal(results[blockedIndex].json().code, 'DATE_OVERLAP')
      assert.equal((await decide(blockedIndex === 0 ? a : b, 'rejected', 'Пересечение дат')).statusCode, 200)
    })
    await t.test('withdrawal blocks approval; resubmission preserves original and enforces remaining balance', async () => {
      const source = (await create(employee, '2098-06-01', '2098-06-02')).json().id
      assert.equal((await send('POST', `/api/requests/${source}/withdraw`, employee, {})).statusCode, 200)
      assert.equal((await decide(source)).statusCode, 409)
      assert.equal((await create(employee, '2098-07-01', '2098-07-04', source)).statusCode, 409)
      const repeat = await create(employee, '2098-07-01', '2098-07-03', source)
      assert.equal(repeat.statusCode, 201)
      assert.notEqual(repeat.json().id, source)
      const state = (await send('GET', '/api/workspace', employee)).json()
      assert.equal(state.requests.find((r: { id: string }) => r.id === source).status, 'cancelled')
      assert.equal(state.requests.find((r: { id: string }) => r.id === repeat.json().id).sourceRequestId, source)
      const before = await pool.query('SELECT count(*)::int AS n FROM request_history WHERE request_id = $1', [source])
      assert.equal(before.rows[0].n, 3)
      assert.equal((await decide(repeat.json().id)).statusCode, 200)
      assert.equal((await create(employee, '2098-08-01', '2098-08-01')).statusCode, 409)
    })
    await t.test('notification read ownership; data, sessions and debits survive application restart', async () => {
      assert.equal((await send('PATCH', '/api/profile/contacts', employee, { email: 'invalid', phone: '123' })).statusCode, 400)
      assert.equal((await send('PATCH', '/api/profile/contacts', employee, { email: 'aidana.local@example.com', phone: '+77000000001' })).statusCode, 200)
      const before = (await send('GET', '/api/workspace', employee)).json()
      const notice = before.notifications[0].id
      assert.equal((await send('POST', `/api/notifications/${notice}/read`, outside, {})).statusCode, 404)
      assert.equal((await send('POST', `/api/notifications/${notice}/read`, employee, {})).statusCode, 200)
      await app.close()
      app = await buildApp(pool)
      await seed(pool)
      const after = (await send('GET', '/api/workspace', employee)).json()
      assert.deepEqual(after.requests, before.requests)
      assert.equal(after.profiles[0].contacts.email, 'aidana.local@example.com')
      assert.equal(after.notifications.find((n: { id: string }) => n.id === notice).read, true)
      assert.equal((await pool.query('SELECT sum(days)::int AS used FROM vacation_debits')).rows[0].used, 18)
      assert.equal((await send('POST', '/api/auth/logout', employee, {})).statusCode, 200)
      assert.equal((await send('GET', '/api/workspace', employee)).statusCode, 401)
      await pool.query('UPDATE sessions SET expires_at = now() - interval \'1 second\'')
      assert.equal((await send('GET', '/api/workspace', manager)).statusCode, 401)
    })
  } finally {
    await app.close()
    await pool.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  }
})
