import { formatCalendarDays } from '../utils/requests'
import type { Course, DemoRole, Employee, EmployeeRequest } from '../types'
import { formatDate, statusLabels } from '../mocks/dashboard'
import { Icon } from './Icon'

export function RequestsPanel({
  requests,
  onOpen,
  onViewAll,
  compact = false,
}: {
  requests: EmployeeRequest[]
  onOpen: (request: EmployeeRequest) => void
  onViewAll?: () => void
  compact?: boolean
}) {
  const items = compact ? requests.slice(0, 3) : requests
  return (
    <section className="panel requests-panel" aria-labelledby="requests-title">
      <div className="section-heading">
        <div>
          <h2 id="requests-title">
            Мои заявки <span className="heading-count">{requests.length}</span>
          </h2>
          <p>Всё под контролем, на каждом этапе</p>
        </div>
        {onViewAll && (
          <button className="text-button" onClick={onViewAll}>
            Все заявки <Icon name="arrow" size={16} />
          </button>
        )}
      </div>
      <div className="request-list">
        {items.map((request) => (
          <button
            className="request-row"
            key={request.id}
            onClick={() => onOpen(request)}
          >
            <span
              className={`item-icon ${request.type === 'advance' ? 'blue' : 'green'}`}
            >
              <Icon name={request.type === 'advance' ? 'file' : 'calendar'} />
            </span>
            <span className="request-info">
              <strong>{request.title}</strong>
              <small>
                {request.id} <span>·</span> {formatDate(request.createdAt)}
              </small>
            </span>
            <span className={`status-badge ${request.status}`}>
              <span />
              {statusLabels[request.status]}
            </span>
            <Icon name="chevron" size={17} className="row-chevron" />
          </button>
        ))}
      </div>
    </section>
  )
}

export function CoursesPanel({
  courses,
  onOpen,
  onViewAll,
}: {
  courses: Course[]
  onOpen: (course: Course) => void
  onViewAll?: () => void
}) {
  return (
    <section className="panel courses-panel" aria-labelledby="courses-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">РАСТЁМ ВМЕСТЕ</span>
          <h2 id="courses-title">Jana Academy</h2>
          <p>Новые знания для уверенного старта</p>
        </div>
        {onViewAll && (
          <button className="text-button" onClick={onViewAll}>
            Моё обучение <Icon name="arrow" size={16} />
          </button>
        )}
      </div>
      <div className="course-grid">
        {courses.map((course) => (
          <article className="course-card" key={course.id}>
            <div className={`course-art ${course.color}`}>
              <span className="art-orbit" />
              <span className="course-art-icon">
                <Icon
                  name={course.id === 'security' ? 'shield' : 'book'}
                  size={34}
                />
              </span>
              <span className="course-category">{course.category}</span>
            </div>
            <div className="course-content">
              <div className="course-meta">
                <Icon name="clock" size={13} />
                {course.duration}
                <span>·</span>Онлайн
              </div>
              <h3>{course.title}</h3>
              <p className="course-result-label">
                Материалы: {course.completedLessons}/{course.lessons.length}
                {course.result
                  ? ` · Тест: ${course.result.score}%`
                  : ' · Тест впереди'}
              </p>
              <div className="progress-label">
                <span>
                  {course.progress === 100
                    ? 'Курс завершён'
                    : course.progress > 0
                      ? 'Вы уже на верном пути'
                      : 'Можно начинать'}
                </span>
                <strong>{course.progress}%</strong>
              </div>
              <progress
                value={course.progress}
                max={100}
                aria-label={`Прогресс курса «${course.title}»`}
              />
              <button className="course-button" onClick={() => onOpen(course)}>
                {course.progress === 100
                  ? 'Посмотреть результат'
                  : course.progress > 0
                    ? 'Продолжить обучение'
                    : 'Начать обучение'}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function ProfilePanel({
  employee,
  onOpen,
  full = false,
  role = 'employee',
}: {
  employee: Employee
  onOpen?: () => void
  full?: boolean
  role?: DemoRole
}) {
  return (
    <section
      className={`panel profile-panel ${full ? 'full-profile' : ''}`}
      aria-labelledby="profile-title"
    >
      <div className="section-heading">
        <h2 id="profile-title">Мой профиль</h2>
        <span className="tiny-tag">
          {role === 'manager' ? 'Руководитель' : 'Сотрудник'}
        </span>
      </div>
      <div className="profile-person">
        <span className="avatar avatar-large">
          {employee.initials}
          <span className="avatar-status" />
        </span>
        <h3>{employee.name}</h3>
        <p>{employee.position}</p>
        <span className="profile-location">
          <Icon name="pin" size={14} />
          {employee.location}
        </span>
      </div>
      <dl className="profile-fields">
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
          <dt>В команде с</dt>
          <dd>{employee.hiredAt ? formatDate(employee.hiredAt) : '—'}</dd>
        </div>
        {full && (
          <div>
            <dt>Остаток отпуска</dt>
            <dd>{formatCalendarDays(employee.vacationDays)}</dd>
          </div>
        )}
      </dl>
      {onOpen ? (
        <button className="profile-link" onClick={onOpen}>
          Открыть профиль
          <Icon name="arrow" size={16} />
        </button>
      ) : (
        <p className="read-only-note">
          <Icon name="shield" size={15} />
          Кадровые данные доступны только для просмотра.
        </p>
      )}
    </section>
  )
}
