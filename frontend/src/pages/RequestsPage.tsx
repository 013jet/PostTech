import { Icon } from '../components/Icon'
import { formatDate, statusLabels } from '../mocks/dashboard'
import type { Employee, EmployeeRequest, RequestFilter } from '../types'

const filters: RequestFilter[] = [
  'all',
  'pending',
  'approved',
  'rejected',
  'completed',
  'cancelled',
]

export function RequestsPage({
  requests,
  filter,
  onFilter,
  onOpen,
  onNewRequest,
  mode = 'personal',
  employees = [],
}: {
  requests: EmployeeRequest[]
  filter: RequestFilter
  onFilter: (filter: RequestFilter) => void
  onOpen: (request: EmployeeRequest) => void
  onNewRequest: () => void
  mode?: 'personal' | 'team' | 'hr'
  employees?: Employee[]
}) {
  const filtered = requests
    .filter((request) => filter === 'all' || request.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <section
      className="panel requests-workspace"
      aria-label={
        mode === 'hr' ? 'Список заявок компании' : mode === 'team' ? 'Список заявок команды' : 'Список моих заявок'
      }
    >
      <div
        className="request-filters"
        role="group"
        aria-label="Фильтр по статусу"
      >
        {filters.map((value) => (
          <button
            key={value}
            className={`filter-button ${filter === value ? 'is-selected' : ''}`}
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
          >
            {value === 'all' ? 'Все заявки' : statusLabels[value]}
            <span>
              {value === 'all'
                ? requests.length
                : requests.filter((request) => request.status === value).length}
            </span>
          </button>
        ))}
      </div>
      <div className="request-results-summary">
        <p role="status" aria-live="polite" aria-atomic="true">
          Показано: <strong>{filtered.length}</strong> из {requests.length}
        </p>
        <span>Сначала новые</span>
      </div>
      {filtered.length > 0 ? (
        <>
          <div className="request-table-heading" aria-hidden="true">
            <span>{mode !== 'personal' ? 'Сотрудник / заявка' : 'Заявка'}</span>
            <span>Период / сумма</span>
            <span>Дата создания</span>
            <span>Статус</span>
            <span />
          </div>
          <ul className="request-table-list">
            {filtered.map((request) => (
              <li key={request.id}>
                <button
                  className="request-table-row"
                  onClick={() => onOpen(request)}
                  aria-label={`Открыть заявку ${request.id}: ${request.title}, ${statusLabels[request.status]}`}
                >
                  <span className="request-table-name">
                    <span
                      className={`item-icon ${request.type === 'advance' ? 'blue' : 'green'}`}
                    >
                      <Icon
                        name={request.type === 'advance' ? 'file' : 'calendar'}
                      />
                    </span>
                    <span>
                      <strong>{request.title}</strong>
                      {mode !== 'personal' && (
                        <span className="team-request-applicant">
                          {
                            employees.find(
                              (person) => person.id === request.employeeId,
                            )?.name
                          }
                        </span>
                      )}
                      <small>{request.id}</small>
                    </span>
                  </span>
                  <span className="request-table-period">
                    {request.type === 'vacation' ? (
                      <>
                        <span>{formatDate(request.startDate)} —</span>
                        <span>{formatDate(request.endDate)}</span>
                        <small>{request.days} календ. дн.</small>
                      </>
                    ) : (
                      <strong>{request.description}</strong>
                    )}
                  </span>
                  <time
                    className="request-table-date"
                    dateTime={request.createdAt}
                  >
                    {formatDate(request.createdAt)}
                  </time>
                  <span className={`status-badge ${request.status}`}>
                    <span />
                    {statusLabels[request.status]}
                  </span>
                  <Icon
                    name="chevron"
                    size={17}
                    className="request-table-arrow"
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="requests-empty">
          <span className="empty-icon">
            <Icon name="file" size={28} />
          </span>
          <h2>
            {requests.length === 0
              ? mode !== 'personal'
                ? 'Пока нет заявок'
                : 'У вас пока нет заявок'
              : 'Заявок с таким статусом пока нет'}
          </h2>
          <p>
            {requests.length === 0
              ? mode !== 'personal'
                ? 'Заявки появятся здесь, когда сотрудники отправят обращения.'
                : 'Создайте первую заявку на отпуск — она появится здесь вместе с историей изменений.'
              : 'Попробуйте выбрать другой статус или вернитесь ко всем заявкам.'}
          </p>
          {(requests.length > 0 || mode === 'personal') && (
            <button
              className={
                requests.length === 0 ? 'primary-button' : 'secondary-button'
              }
              onClick={
                requests.length === 0 ? onNewRequest : () => onFilter('all')
              }
            >
              {requests.length === 0 ? 'Создать заявку' : 'Показать все заявки'}
              <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      )}
      <div className="request-list-footer">
        <Icon name="shield" size={15} />
        <span>
          {mode === 'hr' ? 'Просмотр заявок вашей компании. Согласование доступно только прямому руководителю.' : mode === 'team'
            ? 'Здесь отображаются только заявки сотрудников вашей команды.'
            : 'Здесь отображаются только ваши заявки.'}
        </span>
      </div>
    </section>
  )
}
