import type { CourseEnrollment, DemoSession, Employee, EmployeeNotification, EmployeeProfile, EmployeeRequest, PublicCourseDefinition } from '../types'

export interface ServerSnapshot {
  session: DemoSession
  today: string
  employees: Employee[]
  profiles: EmployeeProfile[]
  requests: EmployeeRequest[]
  notifications: EmployeeNotification[]
  courses: PublicCourseDefinition[]
  enrollments: (CourseEnrollment & { revision: number })[]
}
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Janamen-Request': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Сервер недоступен. Проверьте подключение и повторите попытку.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new ApiError(response.status, data?.code || 'SERVER_ERROR', data?.message || 'Не удалось получить ответ сервера. Повторите позже.')
  return data as T
}
export interface ServerWorkspace {
  data: ServerSnapshot
  error: string
  refreshing: boolean
  refresh: () => Promise<boolean>
  mutate: <T>(path: string, method: string, body: unknown, key?: string) => Promise<T>
  logout: () => Promise<void>
}
