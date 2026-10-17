import type {
  DemoSession,
  EmployeeNotification,
  NotificationFilter,
} from '../types/index.ts'
import { canViewRequest } from './workflow.ts'
import type { WorkflowState } from './workflow.ts'

export type NotificationTarget = { type: 'request' | 'course'; id: string }

export function notificationFeed(
  notifications: EmployeeNotification[],
  session: DemoSession,
  filter: NotificationFilter = 'all',
) {
  // Preserve event order: new events are prepended by the workflow reducer.
  return notifications.filter(
    (item) =>
      item.recipientId === session.userId && (filter === 'all' || !item.read),
  )
}

export function notificationTarget(
  notification: EmployeeNotification,
  session: DemoSession,
  state: Pick<WorkflowState, 'requests' | 'employees' | 'enrollments'> & { courses: { id: string }[] },
): NotificationTarget | null {
  if (notification.recipientId !== session.userId) return null
  if (notification.requestId && notification.courseId) return null
  if (notification.requestId) {
    const request = state.requests.find(
      (item) => item.id === notification.requestId,
    )
    return request && canViewRequest(session, request, state.employees)
      ? { type: 'request', id: request.id }
      : null
  }
  if (notification.courseId && session.role === 'employee') {
    const course = state.courses.find(
      (item) => item.id === notification.courseId,
    )
    const assigned = state.enrollments.some(
      (item) =>
        item.employeeId === session.userId && item.courseId === course?.id,
    )
    if (course && assigned) return { type: 'course', id: course.id }
  }
  return null
}
