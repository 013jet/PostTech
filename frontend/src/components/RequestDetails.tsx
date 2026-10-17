import { useLayoutEffect, useRef } from 'react'
import type {
  Employee,
  EmployeeRequest,
  RequestStatus,
  ReviewDecision,
} from '../types'
import { ReviewForm } from './ReviewForm'
import { WithdrawRequest } from './WithdrawRequest'
import { formatDate, statusLabels } from '../mocks/dashboard'
import { formatCalendarDays, formatHistoryDate } from '../utils/requests'
import { Icon } from './Icon'
import type { IconName } from './Icon'

const statusIcons: Record<RequestStatus, IconName> = {
  pending: 'clock',
  approved: 'check',
  rejected: 'close',
  completed: 'check',
  cancelled: 'close',
}

export function RequestDetails({
  request,
  employee,
  canReview = false,
  isManager = false,
  onReview,
  canWithdraw = false,
  onWithdraw,
  canResubmit = false,
  onResubmit,
  sourceRequest,
  onOpenSource,
  approvalBlockReason = null,
}: {
  request: EmployeeRequest
  employee: Employee
  canReview?: boolean
  isManager?: boolean
  onReview?: (decision: ReviewDecision, comment: string) => Promise<string | null>
  canWithdraw?: boolean
  onWithdraw?: () => Promise<string | null>
  canResubmit?: boolean
  onResubmit?: () => void
  sourceRequest?: EmployeeRequest
  onOpenSource?: () => void
  approvalBlockReason?: string | null
}) {
  const statusRef = useRef<HTMLDivElement>(null)
  const previousStatus = useRef(request.status)
  useLayoutEffect(() => {
    if (previousStatus.current !== request.status) statusRef.current?.focus()
    previousStatus.current = request.status
  }, [request.status])
  const history = [...request.history].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  )
  const rejection = history.findLast((event) => event.status === 'rejected')
  const statusDescriptions: Record<RequestStatus, string> = {
    pending: `Заявка ожидает решения руководителя: ${employee.manager}.`,
    approved:
      request.type === 'vacation'
        ? 'Даты отпуска согласованы руководителем.'
        : 'Заявка на аванс согласована руководителем.',
    rejected:
      rejection?.description ||
      'Заявка отклонена. Подробности указаны в истории изменений.',
    completed:
      request.type === 'vacation'
        ? 'Период отпуска завершён. История заявки сохранена.'
        : 'Обработка заявки завершена.',
    cancelled: 'Заявка отозвана сотрудником и больше не ожидает согласования.',
  }

  return (
    <div className="request-details">
      <div className="request-detail-overview">
        <div>
          <span className="eyebrow">
            {request.type === 'vacation' ? 'ОТПУСК' : 'HR-СЕРВИС'} ·{' '}
            {request.id}
          </span>
          <h3>{request.title}</h3>
          <p>Создана {formatDate(request.createdAt)}</p>
        </div>
        <span className={`status-badge ${request.status}`}>
          <span />
          {statusLabels[request.status]}
        </span>
      </div>
      {sourceRequest && onOpenSource && (
        <div className="request-source-link">
          <span>Повторная подача</span>
          <button type="button" className="text-button" onClick={onOpenSource}>
            Исходная заявка {sourceRequest.id}
            <Icon name="arrow" size={15} />
          </button>
        </div>
      )}
      <div
        ref={statusRef}
        tabIndex={-1}
        className={`request-status-message ${request.status}`}
      >
        <Icon name={statusIcons[request.status]} size={19} />
        <div>
          <strong>
            {request.status === 'rejected'
              ? 'Комментарий руководителя'
              : statusLabels[request.status]}
          </strong>
          <p>{statusDescriptions[request.status]}</p>
        </div>
      </div>
      {request.type === 'vacation' &&
        request.deductedVacationDays !== undefined && (
          <p className="request-days-deducted">
            По этой заявке списано{' '}
            {formatCalendarDays(request.deductedVacationDays)} отпуска.
          </p>
        )}
      {request.type === 'vacation' ? (
        <dl className="vacation-period">
          <div>
            <dt>Начало отпуска</dt>
            <dd>
              <Icon name="calendar" size={17} />
              <time dateTime={request.startDate}>
                {formatDate(request.startDate)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Окончание отпуска</dt>
            <dd>
              <Icon name="calendar" size={17} />
              <time dateTime={request.endDate}>
                {formatDate(request.endDate)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Продолжительность</dt>
            <dd>
              <strong>{request.days}</strong>
              <span>календ. дн.</span>
            </dd>
          </div>
        </dl>
      ) : (
        <dl className="advance-summary">
          <div>
            <dt>Запрошенная сумма</dt>
            <dd>
              {new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'KZT',
                maximumFractionDigits: 0,
              }).format(request.amount)}
            </dd>
          </div>
        </dl>
      )}
      {canReview && onReview && (
        <ReviewForm
          onReview={onReview}
          approvalBlockReason={approvalBlockReason}
          availableDays={employee.vacationDays}
          requestedDays={request.type === 'vacation' ? request.days : 0}
        />
      )}
      {canWithdraw && onWithdraw && (
        <WithdrawRequest requestId={request.id} onWithdraw={onWithdraw} />
      )}
      {canResubmit && onResubmit && (
        <section className="withdraw-request" aria-labelledby="resubmit-title">
          <h3 id="resubmit-title">Подать отпуск ещё раз</h3>
          <p>
            Даты и комментарий можно исправить. После отправки появится новая
            заявка с новым номером, а эта сохранится в истории.
          </p>
          <div className="withdraw-actions">
            <button
              type="button"
              className="primary-button"
              onClick={onResubmit}
            >
              <Icon name="plus" size={17} />
              Подать повторно
            </button>
          </div>
        </section>
      )}
      {isManager && !canReview && (
        <p className="review-readonly">
          <Icon name="shield" size={16} />
          {request.type !== 'vacation'
            ? 'Согласование авансов пока не подключено. Заявка доступна для просмотра.'
            : request.status === 'cancelled'
              ? 'Заявка отозвана сотрудником. Согласование недоступно.'
              : 'Решение по этой заявке уже принято. Повторное рассмотрение недоступно.'}
        </p>
      )}
      <div className="request-detail-grid">
        <section
          className="request-information"
          aria-labelledby="request-applicant-title"
        >
          <h3 id="request-applicant-title">Данные сотрудника</h3>
          <div className="request-applicant">
            <span className="avatar avatar-small">{employee.initials}</span>
            <div>
              <strong>{employee.name}</strong>
              <span>{employee.position}</span>
            </div>
          </div>
          <dl className="request-applicant-fields">
            <div>
              <dt>Компания</dt>
              <dd>{employee.company}</dd>
            </div>
            <div>
              <dt>Подразделение</dt>
              <dd>{employee.department}</dd>
            </div>
            <div>
              <dt>Руководитель</dt>
              <dd>{employee.manager}</dd>
            </div>
            <div>
              <dt>Тип заявки</dt>
              <dd>{request.title}</dd>
            </div>
          </dl>
          <div className="request-comment">
            <h3>Комментарий сотрудника</h3>
            <p className={request.comment ? '' : 'comment-empty'}>
              {request.comment || 'Комментарий не добавлен.'}
            </p>
          </div>
          <p className="read-only-note">
            <Icon name="shield" size={15} />
            Данные заявки доступны только для просмотра.
          </p>
        </section>
        <section
          className="request-history"
          aria-labelledby="request-history-title"
        >
          <div className="history-heading">
            <h3 id="request-history-title">История изменений</h3>
            <span className="heading-count">{history.length}</span>
          </div>
          <p className="history-timezone">Время Казахстана · UTC+5</p>
          {history.length ? (
            <ol className="history-list">
              {history.map((event, index) => (
                <li
                  key={event.id}
                  className={
                    index === history.length - 1 ? 'history-latest' : ''
                  }
                  aria-current={
                    index === history.length - 1 ? 'step' : undefined
                  }
                >
                  <span
                    className={`history-marker ${event.status || 'created'}`}
                  >
                    <Icon
                      name={event.status ? statusIcons[event.status] : 'file'}
                      size={14}
                    />
                  </span>
                  <div className="history-content">
                    <time dateTime={event.occurredAt}>
                      {formatHistoryDate(event.occurredAt)}
                    </time>
                    <h4>{event.title}</h4>
                    <p className="history-actor">
                      {event.actor}
                      <span> · {event.role}</span>
                    </p>
                    {event.description && (
                      <p className="history-description">{event.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="history-empty">История пока пуста.</p>
          )}
        </section>
      </div>
      <p className="request-detail-demo">
        История и решения сохранены на сервере. Время указано для Казахстана.
      </p>
    </div>
  )
}
