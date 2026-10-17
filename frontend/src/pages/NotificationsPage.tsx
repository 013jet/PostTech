import { useId, useRef } from 'react'
import { Icon } from '../components/Icon'
import type { EmployeeNotification, NotificationFilter } from '../types'
import type { NotificationTarget } from '../utils/notifications'

export interface NotificationEntry {
  notification: EmployeeNotification
  target: NotificationTarget | null
}

function NotificationCard({
  entry,
  onRead,
  onOpen,
  onReadFocus,
}: {
  entry: NotificationEntry
  onRead: (id: string) => void
  onOpen: (id: string) => void
  onReadFocus: () => boolean
}) {
  const { notification, target } = entry
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const related = Boolean(notification.requestId || notification.courseId)
  return (
    <li>
      <article
        className={`notice-card ${notification.read ? 'is-read' : 'is-unread'}`}
        aria-labelledby={titleId}
      >
        <span
          className={`notice-icon ${target?.type === 'course' ? 'is-course' : ''}`}
        >
          <Icon
            name={
              notification.courseId
                ? 'book'
                : notification.requestId
                  ? 'file'
                  : 'bell'
            }
            size={21}
          />
        </span>
        <div className="notice-content">
          <div className="notice-meta">
            <span>
              {notification.courseId
                ? 'Jana Academy'
                : notification.requestId
                  ? `Заявка ${notification.requestId}`
                  : 'Личный кабинет'}
            </span>
            <span
              className={`notice-state ${notification.read ? '' : 'is-unread'}`}
            >
              <span />
              {notification.read ? 'Прочитано' : 'Не прочитано'}
            </span>
          </div>
          <h2 id={titleId} tabIndex={-1} ref={heading}>
            {notification.title}
          </h2>
          <p>{notification.description}</p>
          <span className="notice-time">
            <Icon name="clock" size={13} />
            {notification.time}
          </span>
          <div className="notice-actions">
            {target ? (
              <button
                className="notice-open"
                onClick={() => onOpen(notification.id)}
              >
                {target.type === 'request' ? 'Открыть заявку' : 'Открыть курс'}
                <Icon name="arrow" size={16} />
              </button>
            ) : related ? (
              <span className="notice-unavailable">
                Связанный материал недоступен
              </span>
            ) : (
              <span className="notice-information">
                Информационное уведомление
              </span>
            )}
            {!notification.read && (
              <button
                className="notice-read"
                onClick={() => {
                  onRead(notification.id)
                  if (!onReadFocus())
                    heading.current?.focus({ preventScroll: true })
                }}
              >
                <Icon name="check" size={15} />
                Отметить прочитанным
              </button>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

export function NotificationsPage({
  entries,
  totalCount,
  unreadCount,
  filter,
  onFilter,
  onRead,
  onReadAll,
  onOpen,
}: {
  entries: NotificationEntry[]
  totalCount: number
  unreadCount: number
  filter: NotificationFilter
  onFilter: (filter: NotificationFilter) => void
  onRead: (id: string) => void
  onReadAll: () => void
  onOpen: (id: string) => void
}) {
  const filterRef = useRef<HTMLButtonElement>(null)
  const allFilterRef = useRef<HTMLButtonElement>(null)
  return (
    <section
      className="panel notifications-workspace"
      aria-label="Личные уведомления"
    >
      <div className="notice-toolbar">
        <div
          className="notice-filters"
          role="group"
          aria-label="Фильтр уведомлений"
        >
          <button
            ref={allFilterRef}
            className={`filter-button ${filter === 'all' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => onFilter('all')}
          >
            Все <span>{totalCount}</span>
          </button>
          <button
            ref={filterRef}
            className={`filter-button ${filter === 'unread' ? 'is-selected' : ''}`}
            aria-pressed={filter === 'unread'}
            onClick={() => onFilter('unread')}
          >
            Непрочитанные <span>{unreadCount}</span>
          </button>
        </div>
        <button
          className="notice-read-all"
          disabled={!unreadCount}
          onClick={() => {
            onReadAll()
            ;(filter === 'unread' ? filterRef : allFilterRef).current?.focus({
              preventScroll: true,
            })
          }}
        >
          <Icon name="check" size={17} />
          Отметить все прочитанными
        </button>
      </div>
      <div className="notice-results">
        <p role="status" aria-live="polite" aria-atomic="true">
          Показано: <strong>{entries.length}</strong> из {totalCount}
        </p>
        <span>Сначала новые</span>
      </div>
      {entries.length ? (
        <ul className="notice-list">
          {entries.map((entry) => (
            <NotificationCard
              key={entry.notification.id}
              entry={entry}
              onRead={onRead}
              onOpen={onOpen}
              onReadFocus={() => {
                if (filter !== 'unread') return false
                filterRef.current?.focus({ preventScroll: true })
                return true
              }}
            />
          ))}
        </ul>
      ) : (
        <div className="notice-empty">
          <span className="notice-empty-icon">
            <Icon
              name={filter === 'unread' && totalCount ? 'check' : 'bell'}
              size={30}
            />
          </span>
          <h2>
            {filter === 'unread' && totalCount
              ? 'Всё прочитано'
              : 'Уведомлений пока нет'}
          </h2>
          <p>
            {filter === 'unread' && totalCount
              ? 'Новых событий нет. Прочитанные уведомления доступны в общем списке.'
              : 'Здесь появятся события по вашим заявкам и обучению.'}
          </p>
          {filter === 'unread' && (
            <button className="notice-open" onClick={() => onFilter('all')}>
              Показать все уведомления
              <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      )}
      <div className="notice-footnote">
        <Icon name="shield" size={15} />
        <p>
          Показаны только ваши уведомления. Открытие заявки или курса
          отмечает уведомление прочитанным.
        </p>
      </div>
    </section>
  )
}
