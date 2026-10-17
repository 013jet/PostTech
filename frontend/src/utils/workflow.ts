import type {
  DemoSession,
  Employee,
  EmployeeNotification,
  EmployeeRequest,
  ReviewDecision,
  CourseDefinition,
  CourseEnrollment,
  EmployeeProfile,
} from '../types/index.ts'
import { reduceAcademy } from './academy.ts'
import type { AcademyAction } from './academy.ts'
import { reduceProfile } from './profile.ts'
import type { ProfileAction } from './profile.ts'
import {
  approvedVacationConflicts,
  availableVacationDays,
  calendarDays,
  validateVacationDates,
  vacationBalanceMessage,
} from './requests.ts'

export interface WorkflowState {
  profiles: EmployeeProfile[]
  employees: Employee[]
  requests: EmployeeRequest[]
  notifications: EmployeeNotification[]
  courses: CourseDefinition[]
  enrollments: CourseEnrollment[]
}
type WorkflowAction =
  | AcademyAction
  | ProfileAction
  | { type: 'demo-reset'; state: WorkflowState }
  | {
      type: 'withdraw'
      session: DemoSession
      requestId: string
      occurredAt: string
      eventId: string
    }
  | {
      type: 'review'
      session: DemoSession
      requestId: string
      decision: ReviewDecision
      comment: string
      occurredAt: string
      eventId: string
    }
  | { type: 'create'; session: DemoSession; request: EmployeeRequest }
  | { type: 'read'; session: DemoSession; notificationId?: string }
  | { type: 'notify'; notification: EmployeeNotification }

export function canViewRequest(
  session: DemoSession,
  request: EmployeeRequest,
  employees: Employee[],
) {
  const applicant = employees.find((person) => person.id === request.employeeId)
  if (!applicant) return false
  if (session.role === 'hr') {
    const viewer = employees.find((person) => person.id === session.userId)
    return Boolean(viewer?.company && applicant.company === viewer.company)
  }
  return session.role === 'employee'
    ? request.employeeId === session.userId
    : applicant.managerId === session.userId && applicant.id !== session.userId
}

export function canReviewRequest(
  session: DemoSession,
  request: EmployeeRequest,
  employees: Employee[],
) {
  return (
    session.role === 'manager' &&
    canViewRequest(session, request, employees) &&
    request.type === 'vacation' &&
    request.status === 'pending'
  )
}

export function canWithdrawRequest(
  session: DemoSession,
  request: EmployeeRequest,
  employees: Employee[],
) {
  return (
    session.role === 'employee' &&
    canViewRequest(session, request, employees) &&
    request.type === 'vacation' &&
    request.status === 'pending'
  )
}

export function canResubmitRequest(
  session: DemoSession,
  request: EmployeeRequest,
  employees: Employee[],
) {
  return (
    session.role === 'employee' &&
    canViewRequest(session, request, employees) &&
    request.type === 'vacation' &&
    ['rejected', 'cancelled'].includes(request.status)
  )
}

// Frontend demo checks; a real API must independently authorize each operation.
export function workflowReducer(
  state: WorkflowState,
  action: WorkflowAction,
): WorkflowState {
  if (action.type === 'demo-reset') return action.state
  if (action.type === 'profile-contacts-save')
    return reduceProfile(state, action)
  if (
    action.type === 'lesson-complete' ||
    action.type === 'quiz-answer' ||
    action.type === 'quiz-submit' ||
    action.type === 'quiz-retry'
  )
    return reduceAcademy(state, action)
  if (action.type === 'read') {
    return {
      ...state,
      notifications: state.notifications.map((item) =>
        item.recipientId === action.session.userId &&
        (!action.notificationId || item.id === action.notificationId)
          ? { ...item, read: true }
          : item,
      ),
    }
  }
  if (action.type === 'notify')
    return {
      ...state,
      notifications: [action.notification, ...state.notifications],
    }
  if (action.type === 'create') {
    const { request, session } = action
    const applicant = state.employees.find(
      (person) => person.id === session.userId,
    )
    if (
      !applicant ||
      session.role !== 'employee' ||
      request.employeeId !== session.userId ||
      request.type !== 'vacation' ||
      request.status !== 'pending' ||
      request.deductedVacationDays !== undefined ||
      state.requests.some((item) => item.id === request.id) ||
      approvedVacationConflicts(
        request.startDate,
        request.endDate,
        session.userId,
        state.requests,
      ).length > 0
    )
      return state
    if (
      validateVacationDates(
        request.startDate,
        request.endDate,
        availableVacationDays(applicant, state.requests),
        request.createdAt,
      ) ||
      request.days !== calendarDays(request.startDate, request.endDate) ||
      request.comment.length > 500
    )
      return state
    if (request.sourceRequestId !== undefined) {
      const source = state.requests.find(
        (item) => item.id === request.sourceRequestId,
      )
      if (!source || !canResubmitRequest(session, source, state.employees))
        return state
    }
    return {
      ...state,
      requests: [request, ...state.requests],
      notifications: [
        {
          id: `created-${request.id}`,
          recipientId: applicant.id,
          requestId: request.id,
          title: request.sourceRequestId
            ? 'Заявка подана повторно'
            : 'Тестовая заявка создана',
          description: request.sourceRequestId
            ? `${request.id}: повторная подача на основе ${request.sourceRequestId}. Отпуск ожидает согласования.`
            : `${request.id}: отпуск ожидает согласования.`,
          time: 'Только что',
          read: false,
        },
        {
          id: `submitted-${request.id}`,
          recipientId: applicant.managerId,
          requestId: request.id,
          title: request.sourceRequestId
            ? 'Повторная заявка на отпуск'
            : 'Новая заявка на отпуск',
          description: request.sourceRequestId
            ? `${applicant.name} подаёт ${request.id} на основе ${request.sourceRequestId}. Проверьте новые даты отпуска.`
            : `${applicant.name} ожидает вашего решения по ${request.id}.`,
          time: 'Только что',
          read: false,
        },
        ...state.notifications,
      ],
    }
  }
  const request = state.requests.find((item) => item.id === action.requestId)
  if (action.type === 'withdraw') {
    const applicant = state.employees.find(
      (person) => person.id === action.session.userId,
    )
    if (
      !request ||
      !applicant ||
      !canWithdrawRequest(action.session, request, state.employees) ||
      !Number.isFinite(Date.parse(action.occurredAt))
    )
      return state
    return {
      ...state,
      requests: state.requests.map((item) =>
        item.id === request.id
          ? {
              ...item,
              status: 'cancelled',
              history: [
                ...item.history,
                {
                  id: action.eventId,
                  title: 'Заявка отозвана',
                  actor: applicant.name,
                  role: 'Сотрудник',
                  occurredAt: action.occurredAt,
                  description:
                    'Сотрудник отозвал отпуск до решения руководителя.',
                  status: 'cancelled',
                },
              ],
            }
          : item,
      ),
      notifications: [
        {
          id: `${action.eventId}-notification`,
          recipientId: applicant.managerId,
          requestId: request.id,
          title: 'Заявка на отпуск отозвана',
          description: `${request.id}: Отзыв заявки — ${applicant.name}. Согласование больше не требуется.`,
          time: 'Только что',
          read: false,
        },
        ...state.notifications,
      ],
    }
  }
  const reviewer = state.employees.find(
    (person) => person.id === action.session.userId,
  )
  const comment = action.comment.trim()
  if (
    !request ||
    !reviewer ||
    !canReviewRequest(action.session, request, state.employees) ||
    !comment ||
    comment.length > 500 ||
    !['approved', 'rejected'].includes(action.decision) ||
    !Number.isFinite(Date.parse(action.occurredAt))
  )
    return state
  if (
    action.decision === 'approved' &&
    request.type === 'vacation' &&
    approvedVacationConflicts(
      request.startDate,
      request.endDate,
      request.employeeId,
      state.requests,
    ).length > 0
  )
    return state
  if (action.decision === 'approved' && request.type === 'vacation') {
    const applicant = state.employees.find(
      (person) => person.id === request.employeeId,
    )
    if (
      !applicant ||
      !Number.isSafeInteger(request.days) ||
      request.days < 1 ||
      request.days !== calendarDays(request.startDate, request.endDate) ||
      vacationBalanceMessage(
        request.days,
        availableVacationDays(applicant, state.requests),
        'approval',
      )
    )
      return state
  }
  const title =
    action.decision === 'approved' ? 'Отпуск одобрен' : 'Заявка отклонена'
  return {
    ...state,
    requests: state.requests.map((item) =>
      item.id === request.id
        ? {
            ...item,
            ...(action.decision === 'approved' && item.type === 'vacation'
              ? { deductedVacationDays: item.days }
              : {}),
            status: action.decision,
            history: [
              ...item.history,
              {
                id: action.eventId,
                title,
                actor: reviewer.name,
                role: 'Руководитель',
                occurredAt: action.occurredAt,
                description: comment,
                status: action.decision,
              },
            ],
          }
        : item,
    ),
    notifications: [
      {
        id: `${action.eventId}-notification`,
        recipientId: request.employeeId,
        requestId: request.id,
        title,
        description: `${request.id}: ${reviewer.name}. ${comment}`,
        time: 'Только что',
        read: false,
      },
      ...state.notifications,
    ],
  }
}
