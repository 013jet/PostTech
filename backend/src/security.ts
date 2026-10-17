import { randomBytes, scrypt as deriveKey, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(deriveKey)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64) as Buffer
  return `scrypt:${salt}:${key.toString('hex')}`
}
export async function checkPassword(password: string, stored: string) {
  const [, salt, digest] = stored.split(':')
  const key = await scrypt(password, salt, 64) as Buffer
  const expected = Buffer.from(digest, 'hex')
  return expected.length === key.length && timingSafeEqual(expected, key)
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message) }
}
export const fail = (status: number, code: string, message: string): never => { throw new ApiError(status, code, message) }
export function today(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qyzylorda', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function validateDates(start: string, end: string) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
  if (!valid(start) || !valid(end) || start < today() || end < start)
    fail(400, 'INVALID_DATES', 'Выберите корректные даты: начало не раньше сегодняшнего дня, окончание не раньше начала.')
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
}
