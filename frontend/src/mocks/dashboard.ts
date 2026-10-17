import type { Employee, EmployeeNotification, RequestStatus } from '../types'

// All names and records are fictional. No real employee data is used.
export const employee: Employee = {
  id: 'employee-aidana',
  managerId: 'manager-daniyar',
  firstName: 'Айдана',
  name: 'Айдана Серик',
  initials: 'АС',
  position: 'Специалист по логистике',
  department: 'Операционный отдел',
  company: 'Jana Post',
  manager: 'Данияр Омаров',
  hiredAt: '2025-03-10',
  location: 'Алматы, Казахстан',
  vacationDays: 18,
}

export { initialRequests } from './requests'

export const initialNotifications: EmployeeNotification[] = [
  {
    id: 'n1',
    courseId: 'security',
    recipientId: employee.id,
    title: 'Назначен новый курс',
    description: 'Основы информационной безопасности ждут вас в Jana Academy.',
    time: 'Сегодня, 09:00',
    read: false,
  },
  {
    id: 'n2',
    recipientId: employee.id,
    requestId: 'JP-1048',
    title: 'Заявка передана руководителю',
    description: 'Заявка JP-1048 на отпуск ожидает рассмотрения.',
    time: 'Вчера, 14:30',
    read: false,
  },
  {
    id: 'n3',
    recipientId: employee.id,
    requestId: 'JP-1036',
    title: 'Заявка на аванс одобрена',
    description: 'Статус заявки JP-1036 обновлён.',
    time: '30 сентября, 11:15',
    read: true,
  },
]

export const statusLabels: Record<RequestStatus, string> = {
  pending: 'На согласовании',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  completed: 'Завершено',
  cancelled: 'Отозвано',
}

export const demoDate = '2026-10-16'

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
}
