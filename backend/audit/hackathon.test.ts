import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import { createPool, databaseUrl } from '../src/db.js'
import { buildApp } from '../src/app.js'
import { migrate } from '../src/migrate.js'
import { localPassword, seed } from '../src/seed.js'
import { answerQuestion } from '../../frontend/src/utils/assistant.ts'
import { knowledgeArticles } from '../../frontend/src/mocks/knowledge.ts'

// Compliance audit, intentionally separate from the regular regression suite.
// Failed assertions expose unmet PDF requirements; do not invert them to make the audit green.
describe('Digital HR PDF requirements audit', () => {
  let admin: Pool, pool: Pool, app: FastifyInstance
  const schema = `audit_hr_${randomUUID().replaceAll('-', '')}`
  let employee = '', manager = ''
  const send = (method: 'GET' | 'POST' | 'PATCH', path: string, cookie = '', payload?: unknown, key?: string) => app.inject({
    method, url: path,
    headers: { host: '127.0.0.1:3001', cookie, 'x-janamen-request': '1', ...(key ? { 'idempotency-key': key } : {}) },
    ...(payload !== undefined ? { payload } : {}),
  })
  const state = async (cookie: string) => {
    const response = await send('GET', '/api/workspace', cookie)
    assert.equal(response.statusCode, 200)
    return response.json()
  }
  before(async () => {
    const connection = await databaseUrl()
    admin = createPool(connection)
    await admin.query(`CREATE SCHEMA ${schema}`)
    const url = new URL(connection)
    url.searchParams.set('options', `-c search_path=${schema}`)
    pool = createPool(url.href)
    await migrate(pool)
    await seed(pool)
    app = await buildApp(pool)
    const login = async (email: string) => {
      const response = await send('POST', '/api/auth/login', '', { email, password: localPassword })
      assert.equal(response.statusCode, 200)
      return (response.headers['set-cookie'] as string).split(';')[0]
    }
    employee = await login('employee@janamen.local')
    manager = await login('manager@janamen.local')
  })
  after(async () => {
    await app?.close()
    await pool?.end()
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end() }
  })

  test('[HR-01] employee, manager and HR/admin roles are implemented (PDF 14-16)', async () => {
    const { rows } = await pool.query('SELECT DISTINCT role FROM employees ORDER BY role')
    const roles = rows.map((row) => row.role)
    assert.ok(roles.includes('employee') && roles.includes('manager') && roles.some((role) => ['hr', 'admin', 'hr_admin'].includes(role)), `Only server roles found: ${roles.join(', ')}; missing HR/admin account and role.`)
  })
  test('[HR-02] employee snapshot does not disclose another employee vacation balance or hire date (PDF 16-17)', async () => {
    const data = await state(employee)
    const overexposed = data.employees.filter((person: { id: string; vacationDays?: number; hiredAt?: string }) => person.id !== data.session.userId && (person.vacationDays !== undefined || person.hiredAt !== undefined))
    assert.equal(overexposed.length, 0, `Unauthorized HR fields returned for: ${overexposed.map((person: { id: string }) => person.id).join(', ')}. The manager name already exists in the current employee profile.`)
  })
  test('[HR-03] official HR fields are read-only at API boundary (PDF 16)', async () => {
    const before = await state(employee)
    const response = await send('PATCH', '/api/profile/contacts', employee, { email: 'local@example.com', phone: '+77000000001', position: 'Injected', vacationDays: 999, managerId: 'employee-outside' })
    assert.equal(response.statusCode, 400)
    const after = await state(employee)
    assert.deepEqual(after.employees, before.employees)
    assert.deepEqual(after.profiles, before.profiles)
  })
  test('[HR-04] role cannot be selected by login payload (PDF 15,17)', async () => {
    assert.equal((await send('POST', '/api/auth/login', '', { email: 'employee@janamen.local', password: localPassword, role: 'manager' })).statusCode, 400)
    assert.equal((await state(employee)).session.role, 'employee')
  })
  test('[HR-05] courses, profiles and notifications are scoped to authenticated account (PDF 15-17)', async () => {
    const data = await state(employee)
    assert.ok(data.profiles.every((profile: { employeeId: string }) => profile.employeeId === data.session.userId))
    assert.ok(data.enrollments.every((item: { employeeId: string }) => item.employeeId === data.session.userId))
    assert.ok(data.notifications.every((item: { recipientId: string }) => item.recipientId === data.session.userId))
    assert.deepEqual((await state(manager)).courses, [])
  })
  test('[HR-06] assistant answers cite prepared source and refuse unsupported personal/HR facts (PDF 15,17)', () => {
    const known = answerQuestion('Как оформить отпуск?')
    assert.equal(known.kind, 'answer')
    assert.ok(known.sourceIds.length > 0)
    assert.ok(known.sourceIds.every((id) => knowledgeArticles.some((article) => article.id === id)))
    for (const question of ['Какая зарплата у Тимура?', 'Сколько мне положено отпускных?', 'Какой пароль у руководителя?']) {
      const result = answerQuestion(question)
      assert.equal(result.kind, 'refusal')
      assert.deepEqual(result.sourceIds, [])
    }
  })
  test('[HR-07] assistant instructions match the current server-backed interface (PDF 15,17)', async () => {
    const connectedApp = await readFile(new URL('../../frontend/src/App.tsx', import.meta.url), 'utf8')
    assert.equal(connectedApp.includes('resetStoredDemo'), false)
    const result = answerQuestion('Как считается прогресс обучения?')
    assert.equal(result.kind, 'answer')
    assert.ok(!result.text.includes('Сбросить демо-данные') && !result.text.includes('обе демо-роли'), 'Assistant still recommends the removed demo reset and describes browser-only progress; Academy now uses PostgreSQL.')
  })
  test('[HR-08] one complete leave workflow provides server status, history and notification (PDF 13,15,17)', async () => {
    const created = await send('POST', '/api/requests', employee, { startDate: '2098-09-01', endDate: '2098-09-03', comment: 'PDF requirement audit' }, randomUUID())
    assert.equal(created.statusCode, 201)
    const id = created.json().id
    assert.equal((await state(employee)).requests.find((item: { id: string }) => item.id === id).status, 'pending')
    assert.equal((await send('POST', `/api/requests/${id}/decision`, manager, { decision: 'approved', comment: 'Согласовано для проверки' })).statusCode, 200)
    const result = await state(employee)
    const request = result.requests.find((item: { id: string }) => item.id === id)
    assert.equal(request.status, 'approved')
    assert.equal(request.history.length, 3)
    assert.equal(request.deductedVacationDays, 3)
    assert.ok(result.notifications.some((item: { requestId?: string; title: string }) => item.requestId === id && item.title === 'Отпуск одобрен'))
  })
})
