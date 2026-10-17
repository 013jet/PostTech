import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { transaction } from './db.js'
import { fail, today, validateDates } from './security.js'
import { academySnapshot } from './academy.js'

export interface Identity { userId: string; role: 'employee' | 'manager' | 'hr' }
export interface VacationInput { startDate: string; endDate: string; comment: string; sourceRequestId?: string }
interface RequestRow { id: string; employee_id: string; status: string; start_date: string; end_date: string; days: number; comment: string; source_request_id: string | null; created_at: Date; deducted_days?: number }

async function remaining(client: PoolClient, employeeId: string) {
  const { rows } = await client.query('SELECT opening_days - COALESCE((SELECT sum(days) FROM vacation_debits WHERE employee_id = $1), 0)::int AS balance FROM employees WHERE id = $1', [employeeId])
  return rows[0].balance as number
}
async function checkAllowance(client: PoolClient, employeeId: string, start: string, end: string, days: number) {
  const balance = await remaining(client, employeeId)
  if (days > balance) fail(409, 'INSUFFICIENT_BALANCE', `Недостаточно дней отпуска: запрошено ${days}, доступно ${balance}. Сократите период отпуска.`)
  const conflict = await client.query("SELECT id FROM requests WHERE employee_id = $1 AND status = 'approved' AND start_date <= $3::date AND end_date >= $2::date", [employeeId, start, end])
  if (conflict.rowCount) fail(409, 'DATE_OVERLAP', `Даты пересекаются с одобренным отпуском ${conflict.rows.map((row) => row.id).join(', ')}. Выберите другой период.`)
}
async function event(client: PoolClient, requestId: string, actor: string, title: string, description: string, status: string) {
  await client.query('INSERT INTO request_history(id,request_id,actor_id,title,description,status) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), requestId, actor, title, description, status])
}
async function notify(client: PoolClient, recipient: string | null, requestId: string, title: string, description: string) {
  if (!recipient) return
  await client.query('INSERT INTO notifications(id,recipient_id,request_id,title,description) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), recipient, requestId, title, description])
}
export async function createVacation(pool: Pool, identity: Identity, input: VacationInput, key: string) {
  if (identity.role !== 'employee') fail(403, 'FORBIDDEN', 'Подача доступна только сотруднику.')
  const comment = input.comment.trim()
  const payload = { ...input, comment }
  return transaction(pool, async (client) => {
    // All mutations of one employee's leave serialize on this row, including distinct pending requests.
    const { rows: people } = await client.query('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [identity.userId])
    const existing = await client.query('SELECT id, employee_id, submission_payload FROM requests WHERE submission_key = $1', [key])
    if (existing.rowCount) {
      const saved = existing.rows[0]
      const old = saved.submission_payload
      if (saved.employee_id !== identity.userId || old.startDate !== payload.startDate || old.endDate !== payload.endDate || old.comment !== payload.comment || old.sourceRequestId !== payload.sourceRequestId)
        fail(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ отправки уже использован для другой заявки.')
      return saved.id as string
    }
    const days = validateDates(input.startDate, input.endDate)
    if (input.sourceRequestId) {
      const source = await client.query('SELECT employee_id, status FROM requests WHERE id = $1', [input.sourceRequestId])
      if (!source.rowCount || source.rows[0].employee_id !== identity.userId || !['rejected', 'cancelled'].includes(source.rows[0].status))
        fail(409, 'INVALID_SOURCE', 'Повторная подача доступна только для своей отклонённой или отозванной заявки.')
    }
    await checkAllowance(client, identity.userId, input.startDate, input.endDate, days)
    const { rows } = await client.query('INSERT INTO requests(employee_id,source_request_id,submission_key,submission_payload,start_date,end_date,days,comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [identity.userId, input.sourceRequestId || null, key, payload, input.startDate, input.endDate, days, comment])
    const id = rows[0].id as string
    await event(client, id, identity.userId, 'Заявка создана', input.sourceRequestId ? `Повторная подача на основе ${input.sourceRequestId}. Создана новая заявка.` : 'Заполнены данные заявки.', 'pending')
    await event(client, id, identity.userId, 'Передана на согласование', 'Заявка направлена руководителю.', 'pending')
    await notify(client, identity.userId, id, input.sourceRequestId ? 'Заявка подана повторно' : 'Заявка создана', `${id}: отпуск ожидает согласования.`)
    await notify(client, people[0].manager_id, id, input.sourceRequestId ? 'Повторная заявка на отпуск' : 'Новая заявка на отпуск', `${people[0].data.name} ожидает вашего решения по ${id}.`)
    return id
  })
}
export async function changeRequest(pool: Pool, identity: Identity, id: string, action: 'withdraw' | 'approved' | 'rejected', comment = '') {
  return transaction(pool, async (client) => {
    const found = await client.query<RequestRow>('SELECT * FROM requests WHERE id = $1', [id])
    if (!found.rowCount) fail(404, 'NOT_FOUND', 'Заявка не найдена.')
    const owner = found.rows[0].employee_id
    const { rows: people } = await client.query('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [owner])
    const person = people[0]
    if (action === 'withdraw' ? identity.role !== 'employee' || owner !== identity.userId : identity.role !== 'manager' || person.manager_id !== identity.userId || owner === identity.userId)
      fail(403, 'FORBIDDEN', 'У вас нет доступа к этому действию.')
    const { rows } = await client.query<RequestRow>('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [id])
    const request = rows[0]
    if (request.status !== 'pending') fail(409, 'ALREADY_DECIDED', 'Заявка уже рассмотрена или отозвана. Обновите список.')
    if (action !== 'withdraw' && !comment.trim()) fail(400, 'COMMENT_REQUIRED', 'Добавьте комментарий к решению.')
    if (action === 'approved') {
      await checkAllowance(client, owner, request.start_date, request.end_date, request.days)
      await client.query('INSERT INTO vacation_debits(request_id,employee_id,days) VALUES ($1,$2,$3)', [id, owner, request.days])
    }
    const status = action === 'withdraw' ? 'cancelled' : action
    const title = action === 'withdraw' ? 'Заявка отозвана' : action === 'approved' ? 'Отпуск одобрен' : 'Заявка отклонена'
    const description = action === 'withdraw' ? 'Сотрудник отозвал отпуск до решения руководителя.' : comment.trim()
    await client.query('UPDATE requests SET status = $2 WHERE id = $1', [id, status])
    await event(client, id, identity.userId, title, description, status)
    await notify(client, action === 'withdraw' ? person.manager_id : owner, id, title, `${id}: ${description}`)
  })
}
export async function snapshot(pool: Pool, identity: Identity) {
  return transaction(pool, async (client) => {
    const { rows: employeeRows } = await client.query(`SELECT * FROM employees
      WHERE id = $1 OR ($2::text = 'manager' AND manager_id = $1)
      OR ($2::text = 'hr' AND data->>'company' = (SELECT data->>'company' FROM employees WHERE id = $1))`, [identity.userId, identity.role])
    const ids = employeeRows.filter((row) => identity.role === 'hr' || (identity.role === 'manager' ? row.manager_id === identity.userId && row.id !== identity.userId : row.id === identity.userId)).map((row) => row.id)
    const { rows: requestRows } = await client.query<RequestRow>('SELECT r.*, d.days AS deducted_days FROM requests r LEFT JOIN vacation_debits d ON d.request_id = r.id WHERE r.employee_id = ANY($1::text[]) ORDER BY r.created_at DESC, r.id DESC', [ids])
    const { rows: history } = await client.query('SELECT h.*, e.data->>\'name\' AS actor, e.role FROM request_history h JOIN employees e ON e.id = h.actor_id WHERE h.request_id = ANY($1::text[]) ORDER BY h.occurred_at, h.title', [requestRows.map((row) => row.id)])
    const requests = requestRows.map((row) => ({
      id: row.id, employeeId: row.employee_id, type: 'vacation', title: 'Ежегодный отпуск', description: `${row.start_date} — ${row.end_date} · ${row.days} календ. дн.`, createdAt: today(row.created_at), status: row.status, startDate: row.start_date, endDate: row.end_date, days: row.days, comment: row.comment,
      ...(row.source_request_id ? { sourceRequestId: row.source_request_id } : {}),
      ...(row.deducted_days ? { deductedVacationDays: row.deducted_days } : {}),
      history: history.filter((item) => item.request_id === row.id).map((item) => ({ id: item.id, actor: item.actor, role: item.role === 'manager' ? 'Руководитель' : 'Сотрудник', title: item.title, description: item.description, status: item.status, occurredAt: item.occurred_at.toISOString() })),
    }))
    const { rows: notices } = await client.query('SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC, id DESC', [identity.userId])
    return {
      ...await academySnapshot(client, identity),
      session: identity,
      today: today(),
      // Explicit response projections prevent future JSON fields from silently becoming public.
      employees: employeeRows.map((row) => ({
        id: row.id, managerId: row.manager_id || '', firstName: row.data.firstName,
        name: row.data.name, initials: row.data.initials, position: row.data.position,
        department: row.data.department, company: row.data.company, manager: row.data.manager,
        location: row.data.location, vacationDays: row.opening_days,
        ...(row.id === identity.userId || identity.role === 'hr' ? { hiredAt: row.data.hiredAt } : {}),
      })),
      profiles: employeeRows.filter((row) => row.id === identity.userId).map(({ id, profile: p }) => ({
        employeeId: id, birthDate: p.birthDate, employeeNumber: p.employeeNumber,
        employmentType: p.employmentType, schedule: p.schedule, workEmail: p.workEmail,
        language: p.language, contacts: { email: p.contacts.email, phone: p.contacts.phone },
      })),
      requests,
      notifications: notices.map((row) => ({ id: row.id, recipientId: row.recipient_id, ...(row.request_id ? { requestId: row.request_id } : { courseId: row.course_id }), title: row.title, description: row.description, read: row.read, time: new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Qyzylorda', dateStyle: 'short', timeStyle: 'short' }).format(row.created_at) })),
    }
  }, true)
}
