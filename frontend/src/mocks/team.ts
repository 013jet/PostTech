import { employee } from './dashboard'
import type { Employee, EmployeeRequest, EmployeeNotification } from '../types'
import { submissionHistory } from '../utils/requests'

export const manager: Employee = {
  ...employee,
  id: 'manager-daniyar',
  managerId: 'director',
  firstName: 'Данияр',
  name: 'Данияр Омаров',
  initials: 'ДО',
  position: 'Руководитель операционного отдела',
  manager: 'Елена Соколова',
  hiredAt: '2024-06-03',
  vacationDays: 24,
}
export const teamEmployees: Employee[] = [
  employee,
  {
    ...employee,
    id: 'employee-timur',
    firstName: 'Тимур',
    name: 'Тимур Алиев',
    initials: 'ТА',
    position: 'Координатор доставки',
    hiredAt: '2025-09-01',
    vacationDays: 14,
  },
  {
    ...employee,
    id: 'employee-aliya',
    firstName: 'Алия',
    name: 'Алия Касым',
    initials: 'АК',
    position: 'Оператор склада',
    hiredAt: '2026-01-12',
    vacationDays: 20,
  },
]
export const outsideEmployee: Employee = {
  ...employee,
  id: 'employee-ruslan',
  managerId: 'manager-other',
  firstName: 'Руслан',
  name: 'Руслан Ахметов',
  initials: 'РА',
  department: 'Отдел продаж',
  manager: 'Арман Беков',
}
export const employees: Employee[] = [
  ...teamEmployees,
  manager,
  outsideEmployee,
]

export const teamRequests: EmployeeRequest[] = [
  {
    id: 'JP-1051',
    employeeId: 'employee-timur',
    type: 'vacation',
    title: 'Ежегодный отпуск',
    description: '16–20 ноября 2026 · 5 календарных дней',
    createdAt: '2026-10-16',
    status: 'pending',
    startDate: '2026-11-16',
    endDate: '2026-11-20',
    days: 5,
    comment: 'Передам маршруты дежурному координатору.',
    history: submissionHistory(
      'JP-1051',
      '2026-10-16T08:30:00+05:00',
      '2026-10-16T08:32:00+05:00',
      'Тимур Алиев',
    ),
  },
  {
    id: 'JP-1049',
    employeeId: 'employee-aliya',
    type: 'advance',
    title: 'Аванс',
    description: '30 000 ₸',
    createdAt: '2026-10-15',
    status: 'pending',
    amount: 30000,
    comment: '',
    history: submissionHistory(
      'JP-1049',
      '2026-10-15T16:00:00+05:00',
      '2026-10-15T16:02:00+05:00',
      'Алия Касым',
    ),
  },
  {
    id: 'JP-1040',
    employeeId: 'employee-timur',
    type: 'vacation',
    title: 'Ежегодный отпуск',
    description: '1–3 октября 2026 · 3 календарных дня',
    createdAt: '2026-09-20',
    status: 'completed',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    days: 3,
    comment: '',
    history: [
      ...submissionHistory(
        'JP-1040',
        '2026-09-20T10:00:00+05:00',
        '2026-09-20T10:02:00+05:00',
        'Тимур Алиев',
      ),
      {
        id: 'JP-1040-approved',
        title: 'Отпуск одобрен',
        actor: manager.name,
        role: 'Руководитель',
        occurredAt: '2026-09-21T09:00:00+05:00',
        description: 'Даты согласованы.',
        status: 'approved',
      },
      {
        id: 'JP-1040-completed',
        title: 'Отпуск завершён',
        actor: 'Мадина Ким',
        role: 'HR',
        occurredAt: '2026-10-05T09:00:00+05:00',
        description: 'Период закрыт в тестовом сценарии.',
        status: 'completed',
      },
    ],
  },
  // A different manager's request is intentionally present to verify scoping.
  {
    id: 'JP-OUTSIDE',
    employeeId: outsideEmployee.id,
    type: 'vacation',
    title: 'Ежегодный отпуск',
    description: '23–27 ноября 2026 · 5 календарных дней',
    createdAt: '2026-10-16',
    status: 'pending',
    startDate: '2026-11-23',
    endDate: '2026-11-27',
    days: 5,
    comment: 'Тестовая заявка другой команды.',
    history: submissionHistory(
      'JP-OUTSIDE',
      '2026-10-16T09:00:00+05:00',
      '2026-10-16T09:02:00+05:00',
      outsideEmployee.name,
    ),
  },
]

export const managerNotifications: EmployeeNotification[] = [
  {
    id: 'manager-n1',
    recipientId: manager.id,
    requestId: 'JP-1051',
    title: 'Новая заявка на отпуск',
    description: 'Тимур Алиев ожидает вашего решения по JP-1051.',
    time: 'Сегодня, 08:32',
    read: false,
  },
  {
    id: 'manager-n2',
    recipientId: manager.id,
    requestId: 'JP-1048',
    title: 'Новая заявка на отпуск',
    description: 'Айдана Серик ожидает вашего решения по JP-1048.',
    time: 'Вчера, 14:30',
    read: false,
  },
]
