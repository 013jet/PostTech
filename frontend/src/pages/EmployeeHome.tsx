import type { Course, Employee, EmployeeRequest } from '../types'
import { Icon } from '../components/Icon'
import { formatCalendarDays, vacationDayWord } from '../utils/requests'
import {
  CoursesPanel,
  ProfilePanel,
  RequestsPanel,
} from '../components/DashboardSections'

export function EmployeeHome({
  employee,
  requests,
  courses,
  onNewRequest,
  onRequest,
  onCourse,
  onRequests,
  onLearning,
  onProfile,
  onAssistant,
  today,
}: {
  employee: Employee
  requests: EmployeeRequest[]
  courses: Course[]
  onNewRequest: () => void
  onRequest: (request: EmployeeRequest) => void
  onCourse: (course: Course) => void
  onRequests: () => void
  onLearning: () => void
  onProfile: () => void
  onAssistant: () => void
  today: string
}) {
  const pending = requests.filter(
    (request) => request.status === 'pending',
  ).length
  const unfinished = courses.filter((course) => course.progress < 100).length
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАШ ЛИЧНЫЙ КАБИНЕТ</div>
          <h1>
            Здравствуйте, {employee.firstName}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Всё важное о работе — здесь, в одном месте.</p>
        </div>
        <div className="today-date">
          <Icon name="calendar" size={17} />
          <time dateTime={today}>{new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${today}T12:00:00Z`))}</time>
        </div>
      </div>
      <section className="welcome-banner" aria-label="Быстрый доступ к отпуску">
        <div className="welcome-copy">
          <span className="banner-kicker">
            <span />
            {employee.vacationDays > 0
              ? 'ВРЕМЯ ДЛЯ ВАШИХ ПЛАНОВ'
              : 'ДОСТУПНЫХ ДНЕЙ ПОКА НЕТ'}
          </span>
          <h2>
            Запланируйте свой отпуск
          </h2>
          <p>Выберите даты — мы направим заявку вашему руководителю.</p>
          <span className="welcome-mobile-balance">Доступно <strong>{formatCalendarDays(employee.vacationDays)}</strong></span>
          <button className="primary-button" onClick={onNewRequest}>
            <Icon name="plus" size={18} />
            Оформить отпуск
          </button>
        </div>
        <div className="vacation-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="sun-dot" />
          <div className="balance-card">
            <span className="balance-icon">
              <Icon name="calendar" size={21} />
            </span>
            <span className="balance-number">
              {employee.vacationDays}
              <small>{vacationDayWord(employee.vacationDays)}</small>
            </span>
            <span className="balance-label">для новых впечатлений</span>
            <span className="balance-line" />
            <span className="balance-footer">
              <span />
              Доступно для отпуска
            </span>
          </div>
          <span className="floating-star">✳</span>
        </div>
        <span className="sr-only">
          Доступно {formatCalendarDays(employee.vacationDays)} отпуска.
        </span>
      </section>
      <div className="stats-grid">
        <button className="stat-card" onClick={onNewRequest}>
          <span className="stat-icon mint">
            <Icon name="calendar" size={22} />
          </span>
          <span className="stat-copy">
            <span>Остаток отпуска</span>
            <strong>
              {employee.vacationDays}{' '}
              <small>{vacationDayWord(employee.vacationDays)}</small>
            </strong>
            <small>
              {employee.vacationDays > 0
                ? 'Время для себя'
                : 'Все доступные дни использованы'}
            </small>
          </span>
          <Icon name="chevron" size={17} />
        </button>
        <button className="stat-card" onClick={onRequests}>
          <span className="stat-icon lavender">
            <Icon name="file" size={22} />
          </span>
          <span className="stat-copy">
            <span>Мои заявки</span>
            <strong>
              {requests.length} <small>всего</small>
            </strong>
            <small>
              {pending > 0
                ? `На согласовании: ${pending}`
                : 'Все заявки рассмотрены'}
            </small>
          </span>
          <Icon name="chevron" size={17} />
        </button>
        <button className="stat-card" onClick={onLearning}>
          <span className="stat-icon peach">
            <Icon name="book" size={22} />
          </span>
          <span className="stat-copy">
            <span>Моё обучение</span>
            <strong>
              {unfinished} <small>к прохождению</small>
            </strong>
            <small>
              {unfinished > 0
                ? 'Продолжайте развиваться'
                : 'Все курсы завершены'}
            </small>
          </span>
          <Icon name="chevron" size={17} />
        </button>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <RequestsPanel
            requests={requests}
            onOpen={onRequest}
            onViewAll={onRequests}
            compact
          />
          <CoursesPanel
            courses={courses}
            onOpen={onCourse}
            onViewAll={onLearning}
          />
        </div>
        <div className="dashboard-aside">
          <ProfilePanel employee={employee} onOpen={onProfile} />
          <section className="assistant-card">
            <div className="assistant-card-heading">
              <span className="assistant-symbol">
                <Icon name="sparkle" size={24} />
              </span>
              <span className="tiny-tag">Тестовая база знаний</span>
            </div>
            <h2>Знакомьтесь, AI Jana</h2>
            <p>
              Ответит на вопросы о кабинете и покажет источники. Если ответа нет
              — сообщит об этом.
            </p>
            <button onClick={onAssistant}>
              Задать вопрос
              <Icon name="arrow" size={17} />
            </button>
            <div className="assistant-decoration" aria-hidden="true" />
          </section>
        </div>
      </div>
    </>
  )
}
