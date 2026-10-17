import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createPool, databaseUrl } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { seed, localPassword } from '../src/seed.js'
import { buildApp } from '../src/app.js'

test('PostgreSQL: HR read-only scope and explicit private-data projections', async (t) => {
  const connection = await databaseUrl()
  const admin = createPool(connection)
  const schema = `test_roles_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(connection)
  url.searchParams.set('options', `-c search_path=${schema}`)
  const pool = createPool(url.href)
  const app = await buildApp(pool)
  const send = (method: 'GET' | 'POST' | 'PATCH', path: string, cookie = '', payload?: unknown, key?: string) => app.inject({ method, url: path, headers: { host: '127.0.0.1:3001', 'x-janamen-request': '1', cookie, ...(key ? { 'idempotency-key': key } : {}) }, ...(payload !== undefined ? { payload } : {}) })
  const state = async (cookie: string) => {
    const response = await send('GET', '/api/workspace', cookie)
    assert.equal(response.statusCode, 200)
    return response.json()
  }
  const login = async (email: string) => {
    const response = await send('POST', '/api/auth/login', '', { email, password: localPassword })
    assert.equal(response.statusCode, 200)
    return (response.headers['set-cookie'] as string).split(';')[0]
  }
  try {
    await migrate(pool)
    await seed(pool)
    // Unknown future JSON fields must not become part of any API response.
    await pool.query(`UPDATE employees SET data = data || '{"salary":987654,"privateNote":"private-marker"}', profile = profile || '{"internalNote":"private-marker"}'`)
    await pool.query(`UPDATE employees SET data = jsonb_set(data, '{company}', '"Another company"') WHERE id = 'employee-outside'`)
    const employee = await login('employee@janamen.local')
    const manager = await login('manager@janamen.local')
    const hr = await login('hr@janamen.local')
    const outside = await login('outside@janamen.local')
    const create = (cookie: string) => send('POST', '/api/requests', cookie, { startDate: '2098-08-01', endDate: '2098-08-03', comment: 'Role scope test' }, randomUUID())
    const created = await create(employee)
    assert.equal(created.statusCode, 201)
    const id = created.json().id
    assert.equal((await create(outside)).statusCode, 201)

    await t.test('employee receives only own personnel row and profile; arbitrary JSON fields never leak', async () => {
      for (const cookie of [employee, manager, hr]) {
        const data = await state(cookie)
        assert.ok(!JSON.stringify(data).includes('private-marker'))
        assert.ok(data.employees.every((person: any) => person.salary === undefined && person.privateNote === undefined))
        assert.deepEqual(data.profiles.map((profile: any) => profile.employeeId), [data.session.userId])
        assert.ok(data.notifications.every((notice: any) => notice.recipientId === data.session.userId))
      }
      const data = await state(employee)
      assert.deepEqual(data.employees.map((person: any) => person.id), ['employee-aidana'])
      assert.equal(data.employees[0].manager, 'Данияр Омаров')
    })
    await t.test('manager receives only self and direct reports, without reports hire dates or personal profiles', async () => {
      const data = await state(manager)
      assert.deepEqual(data.employees.map((person: any) => person.id).sort(), ['employee-aidana', 'employee-timur', 'manager-daniyar'])
      assert.ok(data.employees.filter((person: any) => person.id !== data.session.userId).every((person: any) => !('hiredAt' in person)))
      assert.deepEqual(data.requests.map((item: any) => item.id), [id])
    })
    await t.test('HR sees company directory and request histories, never another company or private learning/profile data', async () => {
      const data = await state(hr)
      assert.equal(data.session.role, 'hr')
      assert.equal(data.employees.length, 4)
      assert.ok(data.employees.every((person: any) => person.company === 'Jana Post' && !('contacts' in person) && !('birthDate' in person) && person.hiredAt))
      assert.deepEqual(data.requests.map((item: any) => item.id), [id])
      assert.equal(data.requests[0].history.length, 2)
      assert.deepEqual(data.courses, [])
      assert.deepEqual(data.enrollments, [])
    })
    await t.test('HR cannot submit, approve, reject, withdraw, change official fields or learn on behalf of employee', async () => {
      const before = await state(employee)
      assert.equal((await create(hr)).statusCode, 403)
      for (const decision of ['approved', 'rejected'])
        assert.equal((await send('POST', `/api/requests/${id}/decision`, hr, { decision, comment: 'Forbidden action' })).statusCode, 403)
      assert.equal((await send('POST', `/api/requests/${id}/withdraw`, hr, {})).statusCode, 403)
      const lesson = before.courses[0].lessons[0].id
      assert.equal((await send('POST', `/api/courses/onboarding/lessons/${lesson}/complete`, hr, {})).statusCode, 403)
      assert.equal((await send('PATCH', '/api/profile/contacts', hr, { email: 'hr@janamen.local', phone: '+77000000005', role: 'manager', vacationDays: 999 })).statusCode, 400)
      assert.equal((await send('PATCH', '/api/profile/contacts', hr, { email: 'hr@janamen.local', phone: '+77000000005', employeeId: 'employee-aidana' })).statusCode, 400)
      assert.deepEqual(await state(employee), before)
    })
    await t.test('HR can edit only own contacts; seed and repeated migrations preserve requests and contacts', async () => {
      assert.equal((await send('PATCH', '/api/profile/contacts', hr, { email: 'hr.updated@example.com', phone: '+77012345678' })).statusCode, 200)
      const before = await state(hr)
      await migrate(pool)
      await seed(pool)
      assert.deepEqual(await state(hr), before)
      assert.equal(before.profiles[0].contacts.email, 'hr.updated@example.com')
      assert.equal((await state(employee)).profiles[0].contacts.email, 'employee@janamen.local')
      assert.equal((await send('POST', `/api/requests/${id}/decision`, manager, { decision: 'approved', comment: 'Direct manager decision' })).statusCode, 200)
      const after = await state(hr)
      assert.equal(after.requests[0].status, 'approved')
      assert.equal(after.requests[0].history.length, 3)
    })
  } finally {
    await app.close()
    await pool.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  }
})
