import type {
  CourseDefinition,
  CourseEnrollment,
  EmployeeRequest,
  EmployeeNotification,
  RequestHistoryEvent,
} from '../types/index.ts'
import type { WorkflowState } from './workflow.ts'
import { gradeQuiz } from './academy.ts'
import { validateContacts } from './profile.ts'

export const demoStorageKey = 'posttech.janamen.demo'
export const demoStorageVersion = 1
const maxStoredLength = 2_000_000
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>
export type StorageIssue =
  'invalid' | 'incompatible' | 'unavailable' | 'write-error' | 'conflict'
export type StorageStatus = 'saved' | StorageIssue
type WriteResult =
  { ok: true; raw: string } | { ok: false; issue: StorageIssue }
const browserStorage: StorageAccess = () => window.localStorage

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max = 2000): value is string =>
  typeof value === 'string' && value.length <= max
const id = (value: unknown): value is string =>
  text(value, 120) && /^[a-zA-Z0-9_-]+$/.test(value)
const date = (value: unknown): value is string =>
  text(value, 10) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const timestamp = (value: unknown): value is string =>
  text(value, 40) &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value))
const status = (value: unknown) =>
  ['pending', 'approved', 'rejected', 'completed', 'cancelled'].includes(
    String(value),
  )
const unique = (values: string[]) => new Set(values).size === values.length
function list<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.length <= 10_000 && value.every(guard)
}

function history(value: unknown): value is RequestHistoryEvent {
  return (
    object(value) &&
    id(value.id) &&
    text(value.title, 200) &&
    text(value.actor, 200) &&
    text(value.role, 100) &&
    timestamp(value.occurredAt) &&
    (value.description === undefined || text(value.description)) &&
    (value.status === undefined || status(value.status))
  )
}
function request(
  value: unknown,
  seed: WorkflowState,
): value is EmployeeRequest {
  if (
    !object(value) ||
    !id(value.id) ||
    !seed.employees.some((item) => item.id === value.employeeId) ||
    !text(value.title, 200) ||
    !text(value.description) ||
    !text(value.comment, 500) ||
    !date(value.createdAt) ||
    !status(value.status) ||
    !list(value.history, history) ||
    !unique(value.history.map((item) => item.id))
  )
    return false
  if (value.type === 'advance')
    return (
      value.sourceRequestId === undefined &&
      value.deductedVacationDays === undefined &&
      typeof value.amount === 'number' &&
      Number.isFinite(value.amount) &&
      value.amount > 0
    )
  if (
    value.type !== 'vacation' ||
    (value.sourceRequestId !== undefined && !id(value.sourceRequestId)) ||
    !date(value.startDate) ||
    !date(value.endDate) ||
    typeof value.days !== 'number'
  )
    return false
  return (
    (value.deductedVacationDays === undefined ||
      (Number.isSafeInteger(value.deductedVacationDays) &&
        value.deductedVacationDays === value.days &&
        ['approved', 'completed'].includes(String(value.status)))) &&
    value.endDate >= value.startDate &&
    value.days ===
      Math.round(
        (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86_400_000,
      ) +
        1
  )
}
function notification(
  value: unknown,
  seed: WorkflowState,
): value is EmployeeNotification {
  return (
    object(value) &&
    id(value.id) &&
    seed.employees.some((item) => item.id === value.recipientId) &&
    text(value.title, 200) &&
    text(value.description) &&
    text(value.time, 100) &&
    typeof value.read === 'boolean' &&
    (value.requestId === undefined || id(value.requestId)) &&
    (value.courseId === undefined || id(value.courseId)) &&
    !(value.requestId && value.courseId)
  )
}

function validRequestSources(requests: EmployeeRequest[]) {
  const byId = new Map(requests.map((item) => [item.id, item]))
  return requests.every((item) => {
    const visited = new Set([item.id])
    let current = item
    while (current.type === 'vacation' && current.sourceRequestId) {
      const source = byId.get(current.sourceRequestId)
      if (
        !source ||
        source.type !== 'vacation' ||
        source.employeeId !== item.employeeId ||
        !['rejected', 'cancelled'].includes(source.status) ||
        visited.has(source.id)
      )
        return false
      visited.add(source.id)
      current = source
    }
    return true
  })
}
function answers(
  value: unknown,
  course: CourseDefinition,
): value is Record<string, string> {
  return (
    object(value) &&
    Object.entries(value).every(([questionId, optionId]) =>
      course.quiz.questions.some(
        (question) =>
          question.id === questionId &&
          question.options.some((option) => option.id === optionId),
      ),
    )
  )
}
function enrollment(
  value: unknown,
  seed: WorkflowState,
): value is CourseEnrollment {
  if (!object(value)) return false
  const assigned = seed.enrollments.find(
    (item) =>
      item.employeeId === value.employeeId && item.courseId === value.courseId,
  )
  const course = seed.courses.find((item) => item.id === value.courseId)
  if (
    !assigned ||
    !course ||
    !list(
      value.completedLessonIds,
      (item): item is string =>
        id(item) && course.lessons.some((lesson) => lesson.id === item),
    ) ||
    !unique(value.completedLessonIds) ||
    !answers(value.answers, course) ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > 2000 ||
    !['questions', 'result'].includes(String(value.quizView))
  )
    return false
  for (const attempt of value.attempts) {
    if (
      !object(attempt) ||
      !id(attempt.id) ||
      !timestamp(attempt.submittedAt) ||
      !answers(attempt.answers, course) ||
      Object.keys(attempt.answers).length !== course.quiz.questions.length
    )
      return false
    const grade = gradeQuiz(course, attempt.answers)
    if (
      attempt.score !== grade.score ||
      attempt.correct !== grade.correct ||
      attempt.total !== grade.total ||
      attempt.passed !== grade.passed
    )
      return false
  }
  if (!unique(value.attempts.map((attempt) => attempt.id))) return false
  const allMaterials = value.completedLessonIds.length === course.lessons.length
  if (
    (!allMaterials &&
      (Object.keys(value.answers).length || value.attempts.length)) ||
    (value.quizView === 'result' && !value.attempts.length)
  )
    return false
  const successful = value.attempts.filter((attempt) => attempt.passed)
  if (value.completedAt === undefined) return successful.length === 0
  return (
    timestamp(value.completedAt) &&
    allMaterials &&
    value.quizView === 'result' &&
    successful.length === 1 &&
    successful[0] === value.attempts.at(-1) &&
    value.completedAt === successful[0].submittedAt
  )
}

export function encodeDemoState(state: WorkflowState) {
  // Store mutable data only. Catalog, employee identities and HR fields come from code.
  return JSON.stringify({
    version: demoStorageVersion,
    data: {
      requests: state.requests,
      enrollments: state.enrollments,
      notifications: state.notifications,
      contacts: state.profiles.map((profile) => ({
        employeeId: profile.employeeId,
        email: profile.contacts.email,
        phone: profile.contacts.phone,
      })),
    },
  })
}

export function decodeDemoState(
  raw: string,
  seed: WorkflowState,
):
  | { ok: true; state: WorkflowState }
  | { ok: false; issue: 'invalid' | 'incompatible' } {
  try {
    if (raw.length > maxStoredLength) return { ok: false, issue: 'invalid' }
    const envelope: unknown = JSON.parse(raw)
    if (!object(envelope)) return { ok: false, issue: 'invalid' }
    if (envelope.version !== demoStorageVersion)
      return { ok: false, issue: 'incompatible' }
    const data = envelope.data
    if (
      !object(data) ||
      !list(data.requests, (item): item is EmployeeRequest =>
        request(item, seed),
      ) ||
      !unique(data.requests.map((item) => item.id)) ||
      !validRequestSources(data.requests) ||
      !seed.requests.every((item) =>
        (data.requests as EmployeeRequest[]).some(
          (saved) => saved.id === item.id,
        ),
      ) ||
      !list(data.notifications, (item): item is EmployeeNotification =>
        notification(item, seed),
      ) ||
      !unique(data.notifications.map((item) => item.id)) ||
      !list(data.enrollments, (item): item is CourseEnrollment =>
        enrollment(item, seed),
      ) ||
      data.enrollments.length !== seed.enrollments.length ||
      !unique(
        data.enrollments.map((item) => `${item.employeeId}/${item.courseId}`),
      ) ||
      !Array.isArray(data.contacts) ||
      data.contacts.length !== seed.profiles.length
    )
      return { ok: false, issue: 'invalid' }
    const contacts = new Map<string, { email: string; phone: string }>()
    for (const saved of data.contacts) {
      if (
        !object(saved) ||
        !id(saved.employeeId) ||
        !seed.profiles.some(
          (profile) => profile.employeeId === saved.employeeId,
        ) ||
        contacts.has(saved.employeeId) ||
        !text(saved.email, 254) ||
        !text(saved.phone, 40)
      )
        return { ok: false, issue: 'invalid' }
      const validation = validateContacts({
        email: saved.email,
        phone: saved.phone,
      })
      if (!validation.valid) return { ok: false, issue: 'invalid' }
      contacts.set(saved.employeeId, validation.contacts)
    }
    return {
      ok: true,
      state: {
        ...seed,
        requests: data.requests,
        enrollments: data.enrollments,
        notifications: data.notifications,
        profiles: seed.profiles.map((profile) => ({
          ...profile,
          contacts: contacts.get(profile.employeeId)!,
        })),
      },
    }
  } catch {
    return { ok: false, issue: 'invalid' }
  }
}

export function loadDemoState(
  seed: WorkflowState,
  access: StorageAccess = browserStorage,
) {
  try {
    const raw = access().getItem(demoStorageKey)
    if (raw === null)
      return {
        state: seed,
        raw,
        status: 'saved' as StorageStatus,
        blocked: false,
      }
    const loaded = decodeDemoState(raw, seed)
    return loaded.ok
      ? {
          state: loaded.state,
          raw,
          status: 'saved' as StorageStatus,
          blocked: false,
        }
      : {
          state: seed,
          raw,
          status: loaded.issue as StorageStatus,
          blocked: true,
        }
  } catch {
    return {
      state: seed,
      raw: null,
      status: 'unavailable' as StorageStatus,
      blocked: true,
    }
  }
}

export function saveDemoState(
  state: WorkflowState,
  expectedRaw: string | null,
  access: StorageAccess = browserStorage,
): WriteResult {
  try {
    const storage = access()
    if (storage.getItem(demoStorageKey) !== expectedRaw)
      return { ok: false, issue: 'conflict' }
    const raw = encodeDemoState(state)
    if (raw.length > maxStoredLength) return { ok: false, issue: 'write-error' }
    if (raw !== expectedRaw) storage.setItem(demoStorageKey, raw)
    return { ok: true, raw }
  } catch {
    return { ok: false, issue: 'write-error' }
  }
}

export function resetDemoState(
  seed: WorkflowState,
  access: StorageAccess = browserStorage,
): WriteResult {
  try {
    const raw = encodeDemoState(seed)
    access().setItem(demoStorageKey, raw)
    return { ok: true, raw }
  } catch {
    return { ok: false, issue: 'write-error' }
  }
}

export function nextDemoRequestId(requests: EmployeeRequest[]) {
  const maximum = requests.reduce((max, item) => {
    const match = /^JP-(\d+)$/.exec(item.id)
    const number = match ? Number(match[1]) : 0
    return Number.isSafeInteger(number) && number < 1e12
      ? Math.max(max, number)
      : max
  }, 1059)
  return `JP-${maximum + 1}`
}
