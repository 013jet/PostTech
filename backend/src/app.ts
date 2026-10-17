import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { randomBytes } from 'node:crypto'
import type { Pool } from 'pg'
import type { FastifyRequest } from 'fastify'
import { ApiError, checkPassword, fail, hashPassword, tokenHash } from './security.js'
import { changeRequest, createVacation, snapshot } from './workflow.js'
import type { Identity, VacationInput } from './workflow.js'
import { completeLesson, retryQuiz, saveAnswer, submitQuiz } from './academy.js'

const string = (maxLength: number, minLength = 0) => ({ type: 'string', maxLength, minLength })
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required })
const idParams = object({ id: string(80, 1) })
const revision = { type: 'integer', minimum: 0, maximum: 2147483647 }
const keyHeaders = { type: 'object', properties: { 'idempotency-key': { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } }, required: ['idempotency-key'] }
const sessionCookie = 'janamen_session'
const ttl = 12 * 60 * 60

export async function buildApp(pool: Pool, options: { logger?: boolean; origins?: string[] } = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 16384, ajv: { customOptions: { removeAdditional: false } } })
  const origins = new Set(options.origins ?? (process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173').split(','))
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  const dummyHash = await hashPassword(randomBytes(24).toString('hex'))
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    const host = request.headers.host?.split(':')[0]
    if (host !== '127.0.0.1' && host !== 'localhost') fail(403, 'INVALID_HOST', 'Сервер доступен только локально.')
    if (request.headers.origin && !origins.has(request.headers.origin)) fail(403, 'INVALID_ORIGIN', 'Этот источник запроса не разрешён.')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers['x-janamen-request'] !== '1')
      fail(403, 'CSRF_REJECTED', 'Обновите страницу и повторите действие.')
  })
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ code: error.code, message: error.message })
    const detail = error as { validation?: unknown; statusCode?: number; name?: string; code?: string }
    if (detail.validation) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Проверьте заполненные поля и формат данных.' })
    if (detail.statusCode === 429) return reply.code(429).send({ code: 'RATE_LIMITED', message: 'Слишком много попыток. Повторите через минуту.' })
    if (detail.statusCode && detail.statusCode >= 400 && detail.statusCode < 500)
      return reply.code(detail.statusCode).send({ code: 'INVALID_REQUEST', message: 'Не удалось прочитать запрос. Проверьте формат данных.' })
    if (detail.code === '23505') return reply.code(409).send({ code: 'CONFLICT', message: 'Эта операция уже выполнена. Обновите данные.' })
    // Do not expose SQL, connection strings, passwords or request bodies to clients/logs.
    request.log.error({ name: detail.name, code: detail.code }, 'Request failed')
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Не удалось выполнить действие. Повторите позже.' })
  })
  async function identity(request: FastifyRequest): Promise<Identity> {
    const token = request.cookies[sessionCookie]
    if (!token || token.length !== 64) return fail(401, 'UNAUTHENTICATED', 'Войдите в аккаунт.')
    const { rows } = await pool.query('SELECT s.user_id, e.role FROM sessions s JOIN employees e ON e.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [tokenHash(token)])
    if (!rows.length) return fail(401, 'UNAUTHENTICATED', 'Сессия завершилась. Войдите снова.')
    return { userId: rows[0].user_id, role: rows[0].role }
  }
  app.get('/api/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', database: 'postgresql' } })
  app.post<{ Body: { email: string; password: string } }>('/api/auth/login', {
    schema: { body: object({ email: string(254, 3), password: string(128, 1) }) },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [request.body.email.trim().toLowerCase()])
    const valid = await checkPassword(request.body.password, rows[0]?.password_hash ?? dummyHash)
    if (!rows.length || !valid) return fail(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль.')
    const token = randomBytes(32).toString('hex')
    await pool.query('DELETE FROM sessions WHERE expires_at <= now() OR token_hash = $1', [tokenHash(request.cookies[sessionCookie] || '')])
    await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now() + interval '12 hours')", [tokenHash(token), rows[0].id])
    reply.setCookie(sessionCookie, token, { path: '/api', httpOnly: true, sameSite: 'strict', secure: false, maxAge: ttl })
    return { ok: true }
  })
  app.post('/api/auth/logout', async (request, reply) => {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(request.cookies[sessionCookie] || '')])
    reply.clearCookie(sessionCookie, { path: '/api', httpOnly: true, sameSite: 'strict' })
    return { ok: true }
  })
  app.get('/api/workspace', async (request) => snapshot(pool, await identity(request)))
  app.post<{ Body: VacationInput }>('/api/requests', {
    schema: {
      body: object({ startDate: string(10, 10), endDate: string(10, 10), comment: string(500), sourceRequestId: string(80, 1) }, ['startDate', 'endDate', 'comment']),
      headers: keyHeaders,
    },
  }, async (request, reply) => {
    const user = await identity(request)
    const id = await createVacation(pool, user, request.body, request.headers['idempotency-key'] as string)
    return reply.code(201).send({ id })
  })
  app.post<{ Params: { id: string }; Body: { decision: 'approved' | 'rejected'; comment: string } }>('/api/requests/:id/decision', {
    schema: { params: idParams, body: object({ decision: { type: 'string', enum: ['approved', 'rejected'] }, comment: string(500, 1) }) },
  }, async (request) => {
    await changeRequest(pool, await identity(request), request.params.id, request.body.decision, request.body.comment)
    return { ok: true }
  })
  app.post<{ Params: { id: string } }>('/api/requests/:id/withdraw', { schema: { params: idParams, body: object({}) } }, async (request) => {
    await changeRequest(pool, await identity(request), request.params.id, 'withdraw')
    return { ok: true }
  })
  app.post<{ Params: { id: string } }>('/api/notifications/:id/read', { schema: { params: idParams, body: object({}) } }, async (request) => {
    const user = await identity(request)
    const result = await pool.query('UPDATE notifications SET read = true WHERE id::text = $1 AND recipient_id = $2', [request.params.id, user.userId])
    if (!result.rowCount) fail(404, 'NOT_FOUND', 'Уведомление не найдено.')
    return { ok: true }
  })
  app.post('/api/notifications/read-all', { schema: { body: object({}) } }, async (request) => {
    const user = await identity(request)
    await pool.query('UPDATE notifications SET read = true WHERE recipient_id = $1', [user.userId])
    return { ok: true }
  })
  app.patch<{ Body: { email: string; phone: string } }>('/api/profile/contacts', { schema: { body: object({ email: string(254, 3), phone: string(40, 1) }) } }, async (request) => {
    const user = await identity(request)
    const email = request.body.email.trim()
    const phone = request.body.phone.replace(/[\s()\-]/g, '')
    if (!/^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) || !/^\+7\d{10}$/.test(phone))
      fail(400, 'INVALID_CONTACTS', 'Проверьте email и телефон в формате +7XXXXXXXXXX.')
    await pool.query("UPDATE employees SET profile = jsonb_set(profile, '{contacts}', $2::jsonb) WHERE id = $1", [user.userId, JSON.stringify({ email, phone })])
    return { ok: true }
  })
  app.post<{ Params: { id: string; lessonId: string } }>('/api/courses/:id/lessons/:lessonId/complete', {
    schema: { params: object({ id: string(80, 1), lessonId: string(80, 1) }), body: object({}) },
  }, async (request) => {
    await completeLesson(pool, await identity(request), request.params.id, request.params.lessonId)
    return { ok: true }
  })
  app.patch<{ Params: { id: string }; Body: { revision: number; questionId: string; optionId: string } }>('/api/courses/:id/answers', {
    schema: { params: idParams, body: object({ revision, questionId: string(80, 1), optionId: string(80, 1) }) },
  }, async (request) => {
    const body = request.body
    await saveAnswer(pool, await identity(request), request.params.id, body.questionId, body.optionId, body.revision)
    return { ok: true }
  })
  app.post<{ Params: { id: string }; Body: { revision: number } }>('/api/courses/:id/quiz/submit', {
    schema: { params: idParams, body: object({ revision }), headers: keyHeaders },
  }, async (request, reply) => {
    const id = await submitQuiz(pool, await identity(request), request.params.id, request.body.revision, request.headers['idempotency-key'] as string)
    return reply.code(201).send({ id })
  })
  app.post<{ Params: { id: string }; Body: { revision: number } }>('/api/courses/:id/quiz/retry', {
    schema: { params: idParams, body: object({ revision }) },
  }, async (request) => {
    await retryQuiz(pool, await identity(request), request.params.id, request.body.revision)
    return { ok: true }
  })
  return app
}
