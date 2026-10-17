import type {
  EmployeeRequest,
  Employee,
  RequestHistoryEvent,
  VacationRequest,
} from '../types'

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

export function vacationDayWord(days: number) {
  const lastHundred = Math.abs(days) % 100
  const last = lastHundred % 10
  return lastHundred >= 11 && lastHundred <= 14
    ? 'дней'
    : last === 1
      ? 'день'
      : last >= 2 && last <= 4
        ? 'дня'
        : 'дней'
}

export function formatCalendarDays(days: number) {
  const word = vacationDayWord(days)
  return `${days} ${word === 'день' ? 'календарный' : 'календарных'} ${word}`
}

// Opening balances already account for legacy approvals. Only new approvals
// carry a deduction; deriving the balance prevents a second charge on reload.
export function availableVacationDays(
  employee: Employee,
  requests: EmployeeRequest[],
): number {
  if (!Number.isSafeInteger(employee.vacationDays) || employee.vacationDays < 0)
    return 0
  const used = requests.reduce(
    (total, request) =>
      request.employeeId === employee.id &&
      request.type === 'vacation' &&
      ['approved', 'completed'].includes(request.status) &&
      request.days > 0 &&
      request.deductedVacationDays === request.days
        ? total + request.deductedVacationDays
        : total,
    0,
  )
  return Math.max(0, employee.vacationDays - used)
}

export function vacationBalanceMessage(
  days: number,
  availableDays: number,
  purpose: 'submission' | 'approval' = 'submission',
): string | null {
  if (availableDays > 0 && days <= availableDays) return null
  const reason =
    availableDays === 0
      ? 'Доступных дней отпуска нет.'
      : `Недостаточно дней отпуска: запрошено ${days}, доступно ${formatCalendarDays(availableDays)}.`
  return `${reason} ${purpose === 'approval' ? 'Одобрение недоступно. Можно отклонить заявку с комментарием или оставить на согласовании.' : availableDays === 0 ? 'Отправка заявки недоступна.' : 'Сократите период отпуска. Отправка пока недоступна.'}`
}

export function calendarDays(start: string, end: string) {
  if (!start || !end) return 0
  const difference =
    Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  return Number.isFinite(difference)
    ? Math.round(difference / 86_400_000) + 1
    : 0
}

export function validateVacationDates(
  start: string,
  end: string,
  availableDays: number,
  earliestDate: string,
): string | null {
  if (
    !validDate(start) ||
    !validDate(end) ||
    start < earliestDate ||
    end < start
  )
    return 'Выберите корректные даты отпуска: начало не раньше текущей даты, окончание не раньше начала.'
  if (!Number.isSafeInteger(availableDays) || availableDays < 0)
    return 'Проверьте доступный остаток отпуска.'
  return vacationBalanceMessage(calendarDays(start, end), availableDays)
}

export function approvedVacationConflicts(
  start: string,
  end: string,
  employeeId: string,
  requests: EmployeeRequest[],
): VacationRequest[] {
  if (!validDate(start) || !validDate(end) || end < start) return []
  // Both dates are included. ISO date comparison avoids time-zone shifts.
  return requests
    .filter(
      (request): request is VacationRequest =>
        request.type === 'vacation' &&
        request.status === 'approved' &&
        request.employeeId === employeeId &&
        start <= request.endDate &&
        end >= request.startDate,
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
    )
}

export function vacationConflictMessage(
  conflicts: VacationRequest[],
  purpose: 'submission' | 'approval' = 'submission',
): string | null {
  if (!conflicts.length) return null
  const format = (date: string) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  const periods = conflicts
    .map(
      (request) =>
        `${request.id} (${format(request.startDate)} — ${format(request.endDate)})`,
    )
    .join('; ')
  const conflict = `даты пересекаются с ${conflicts.length === 1 ? 'одобренным отпуском' : 'одобренными отпусками'}: ${periods}.`
  return purpose === 'approval'
    ? `Нельзя одобрить отпуск: ${conflict} Можно отклонить заявку с комментарием или оставить на согласовании.`
    : `Выбранные ${conflict} Выберите другой период.`
}

export function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Qyzylorda',
  }).format(new Date(value))
}

export function submissionHistory(
  id: string,
  createdAt: string,
  submittedAt: string,
  actor: string,
): RequestHistoryEvent[] {
  return [
    {
      id: `${id}-created`,
      title: 'Заявка создана',
      actor,
      role: 'Сотрудник',
      occurredAt: createdAt,
      description: 'Заполнены данные заявки.',
    },
    {
      id: `${id}-submitted`,
      title: 'Передана на согласование',
      actor,
      role: 'Сотрудник',
      occurredAt: submittedAt,
      description: 'Заявка направлена руководителю.',
      status: 'pending',
    },
  ]
}
