import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ServerWorkspace } from './api/client'
import type { FormEvent } from 'react'
import { Header, pageLabels, requestPageLabel, Sidebar } from './components/AppShell'
import { EmployeesPage } from './pages/EmployeesPage'
import { ProfilePage } from './pages/ProfilePage'
import { validateContacts } from './utils/profile'
import { Icon } from './components/Icon'
import { Modal } from './components/Modal'
import { FeedbackToast } from './components/FeedbackToast'
import { AssistantChat } from './components/AssistantChat'
import { answerQuestion } from './utils/assistant'
import type { ChatTurn } from './utils/assistant'
import { RequestDetails } from './components/RequestDetails'
import { RequestsPage } from './pages/RequestsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { notificationFeed, notificationTarget } from './utils/notifications'
import {
  calendarDays,
  formatCalendarDays,
  availableVacationDays,
  vacationBalanceMessage,
  approvedVacationConflicts,
  vacationConflictMessage,
  validateVacationDates,
} from './utils/requests'
import { EmployeeHome } from './pages/EmployeeHome'
import { AcademyPage } from './pages/AcademyPage'
import { CoursePage } from './pages/CoursePage'
import {
  completedLessons,
  courseProgress,
} from './utils/academy'
import type {
  EmployeeRequest,
  Employee,
  Page,
  RequestFilter,
  NotificationFilter,
  ReviewDecision,
  ProfileContacts,
  VacationRequest,
} from './types'
import {
  canReviewRequest,
  canViewRequest,
  canWithdrawRequest,
  canResubmitRequest,
} from './utils/workflow'
import './App.css'
import './styles/requests.css'
import './styles/manager.css'
import './styles/academy.css'
import './styles/assistant.css'
import './styles/notifications.css'
import './styles/profile.css'
import './styles/storage.css'

type Overlay = 'menu' | 'new-request' | 'assistant' | null

function VacationForm({
  onSubmit,
  source,
  onCancel,
  requests,
  applicant,
  today,
}: {
  onSubmit: (
    start: string,
    end: string,
    days: number,
    comment: string,
  ) => Promise<string | null>
  source?: VacationRequest
  onCancel: () => void
  requests: EmployeeRequest[]
  applicant: Employee
  today: string
}) {
  const [start, setStart] = useState(source?.startDate || '')
  const [end, setEnd] = useState(source?.endDate || '')
  const [comment, setComment] = useState(source?.comment || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const startField = useRef<HTMLInputElement>(null)
  const endField = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const days = calendarDays(start, end)
  const conflictError = vacationConflictMessage(
    approvedVacationConflicts(start, end, applicant.id, requests),
  )
  const balanceError = vacationBalanceMessage(days, applicant.vacationDays)
  const shownError = error || conflictError || balanceError
  const datesInvalid = Boolean(conflictError || balanceError || (error && validateVacationDates(start, end, applicant.vacationDays, today)))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    const validation = !start ? 'Укажите дату начала отпуска.' : !end ? 'Укажите дату окончания отпуска.' : validateVacationDates(
      start,
      end,
      applicant.vacationDays,
      today,
    )
    if (validation) {
      setError(validation)
      ;(!start || start < today ? startField : endField).current?.focus()
      return
    }
    if (conflictError || balanceError) return
    sending.current = true
    setBusy(true)
    try { setError(await onSubmit(start, end, days, comment.trim()) || '') }
    catch { setError('Не удалось отправить заявку. Повторите попытку.') }
    finally { sending.current = false; setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="vacation-form" noValidate>
      {source && (
        <div className="resubmit-source-note">
          <strong>На основе заявки {source.id}</strong>
          <p>
            Исправьте даты и комментарий перед отправкой. Будет создана новая
            заявка с новым номером; исходная заявка и её история сохранятся.
          </p>
        </div>
      )}
      <p className="modal-description">
        Выберите даты ежегодного отпуска. Доступно{' '}
        <strong>{formatCalendarDays(applicant.vacationDays)}</strong>.
      </p>
      <div className="form-dates">
        <label>
          Дата начала
          <input
            type="date"
            ref={startField}
            disabled={busy}
            min={today}
            value={start}
            aria-invalid={datesInvalid}
            aria-describedby={shownError ? errorId : undefined}
            onInput={(event) => {
              setStart(event.currentTarget.value)
              setError('')
            }}
            required
          />
        </label>
        <label>
          Дата окончания
          <input
            type="date"
            ref={endField}
            disabled={busy}
            min={start || today}
            value={end}
            aria-invalid={datesInvalid}
            aria-describedby={shownError ? errorId : undefined}
            onInput={(event) => {
              setEnd(event.currentTarget.value)
              setError('')
            }}
            required
          />
        </label>
      </div>
      {shownError && (
        <p id={errorId} className="form-error" role="alert">
          {shownError}
        </p>
      )}
      <label className="request-comment-field">
        Комментарий <span>необязательно</span>
        <textarea
          disabled={busy}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Например, кому передадите текущие задачи"
        />
        <small>{comment.length}/500</small>
      </label>
      {days > 0 && (
        <div className="form-summary">
          <Icon name="calendar" size={18} />
          Продолжительность: {days} календ. дн.
        </div>
      )}
      <p className="demo-note">
        Заявка сохранится на сервере и будет направлена вашему руководителю.
      </p>
      <button
        className="primary-button full-width"
        type="submit"
        disabled={busy || Boolean(conflictError || balanceError)}
      >
        <Icon name="plus" size={17} />
        {busy ? 'Отправляем…' : source ? 'Подать повторно' : 'Отправить заявку'}
      </button>
      {source && (
        <button
          type="button"
          className="withdraw-secondary full-width resubmit-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          Отмена
        </button>
      )}
    </form>
  )
}

function App({ remote }: { remote: ServerWorkspace }) {
  const [page, setPage] = useState<Page>(() => remote.data.session.role === 'employee' ? 'home' : 'requests')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const { session, today } = remote.data
  const role = session.role
  const workflow = remote.data
  const viewerRecord = workflow.employees.find((person) => person.id === session.userId)!
  const viewer = {
    ...viewerRecord,
    vacationDays: availableVacationDays(viewerRecord, workflow.requests),
  }
  const profile = workflow.profiles.find(
    (item) => item.employeeId === session.userId,
  )
  const requests = workflow.requests.filter((request) =>
    canViewRequest(session, request, workflow.employees),
  )
  const notifications = notificationFeed(workflow.notifications, session)
  const members = workflow.employees.filter(
    (person) => person.managerId === viewer.id && person.id !== viewer.id,
  )
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('all')
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationFilter>('all')
  const [courseOrigin, setCourseOrigin] = useState<
    'learning' | 'notifications'
  >('learning')
  const courses =
    role === 'employee'
      ? workflow.courses.flatMap((course) => {
          const enrollment = workflow.enrollments.find(
            (item) =>
              item.courseId === course.id && item.employeeId === session.userId,
          )
          return enrollment
            ? [
                {
                  ...course,
                  progress: courseProgress(course, enrollment),
                  completedLessons: completedLessons(course, enrollment),
                  result: enrollment.attempts.at(-1),
                },
              ]
            : []
        })
      : []
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  )
  const selectedRequest = requests.find(
    (request) => request.id === selectedRequestId,
  )
  const [resubmitSourceId, setResubmitSourceId] = useState<string | null>(null)
  const resubmitSource = workflow.requests.find(
    (item): item is VacationRequest =>
      item.id === resubmitSourceId &&
      item.type === 'vacation' &&
      canResubmitRequest(session, item, workflow.employees),
  )
  const originalRequest =
    selectedRequest?.type === 'vacation'
      ? requests.find((item) => item.id === selectedRequest.sourceRequestId)
      : undefined
  function beginVacationRequest(source?: EmployeeRequest) {
    if (source && !canResubmitRequest(session, source, workflow.employees))
      return
    setResubmitSourceId(source?.id || null)
    setSelectedRequestId(null)
    setOverlay('new-request')
  }
  function closeVacationForm() {
    setOverlay(null)
    if (resubmitSource) setSelectedRequestId(resubmitSource.id)
    setResubmitSourceId(null)
  }
  const requestApplicantRecord = workflow.employees.find(
    (person) => person.id === selectedRequest?.employeeId,
  )
  const requestApplicant = requestApplicantRecord
    ? {
        ...requestApplicantRecord,
        vacationDays: availableVacationDays(
          requestApplicantRecord,
          workflow.requests,
        ),
      }
    : undefined
  function openRequest(request: EmployeeRequest) {
    setSelectedRequestId(request.id)
  }
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])
  const mainRef = useRef<HTMLElement>(null)
  const [mainFocusVersion, setMainFocusVersion] = useState(1)
  useLayoutEffect(() => {
    if (!mainFocusVersion) return
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [mainFocusVersion])
  function focusMain() {
    setMainFocusVersion((version) => version + 1)
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length
  const pendingCount = requests.filter(
    (request) => request.status === 'pending',
  ).length
  const selectedCourse = courses.find(
    (course) => course.id === selectedCourseId,
  )
  const selectedEnrollment = workflow.enrollments.find(
    (item) =>
      item.courseId === selectedCourseId && item.employeeId === session.userId,
  )

  function openCourse(
    courseId: string,
    origin: 'learning' | 'notifications' = 'learning',
  ) {
    if (
      role !== 'employee' ||
      !courses.some((course) => course.id === courseId)
    )
      return
    setSelectedCourseId(courseId)
    setCourseOrigin(origin)
    setPage('learning')
    setOverlay(null)
    focusMain()
  }
  async function saveProfileContacts(contacts: ProfileContacts): Promise<string | null> {
    const result = validateContacts(contacts)
    if (!result.valid) return 'Проверьте email и номер телефона.'
    try {
      await remote.mutate('/profile/contacts', 'PATCH', result.contacts)
      setNotice('Контакты обновлены')
      return null
    } catch (error) { return (error as Error).message }
  }
  function markNotificationRead(notificationId: string) {
    const item = notifications.find((item) => item.id === notificationId && !item.read)
    if (!item) return
    void remote.mutate(`/notifications/${encodeURIComponent(notificationId)}/read`, 'POST', {}).then(() => setNotice('Уведомление отмечено прочитанным')).catch((error: Error) => setNotice(error.message))
  }
  function openNotification(notificationId: string) {
    const notification = notifications.find(
      (item) => item.id === notificationId,
    )
    if (!notification) return
    const target = notificationTarget(notification, session, workflow)
    if (!target) {
      setNotice('Связанный материал недоступен')
      return
    }
    markNotificationRead(notificationId)
    if (target.type === 'course') openCourse(target.id, 'notifications')
    else setSelectedRequestId(target.id)
  }
  async function academyAction(path: string, method: string, body: unknown, key?: string): Promise<string | null> {
    try { await remote.mutate(path, method, body, key); return null }
    catch (error) { return (error as Error).message }
  }
  const quizSubmission = useRef<{ stamp: string; key: string } | null>(null)
  async function submitQuiz(): Promise<string | null> {
    if (!selectedCourse || !selectedEnrollment) return 'Курс недоступен.'
    const stamp = `${selectedCourse.id}:${selectedEnrollment.revision}`
    if (quizSubmission.current?.stamp !== stamp) quizSubmission.current = { stamp, key: crypto.randomUUID() }
    const error = await academyAction(`/courses/${encodeURIComponent(selectedCourse.id)}/quiz/submit`, 'POST', { revision: selectedEnrollment.revision }, quizSubmission.current.key)
    if (!error) quizSubmission.current = null
    return error
  }

  function navigate(next: Page) {
    setSelectedCourseId(null)
    setPage(
      (role !== 'employee' && (next === 'home' || next === 'learning')) || (role !== 'hr' && next === 'employees')
        ? 'requests'
        : next,
    )
    setOverlay(null)
    focusMain()
  }
  async function reviewRequest(requestId: string, decision: ReviewDecision, comment: string): Promise<string | null> {
    try {
      await remote.mutate(`/requests/${encodeURIComponent(requestId)}/decision`, 'POST', { decision, comment })
      setNotice(`${requestId}: решение сохранено. Сотруднику добавлено уведомление.`)
      return null
    } catch (error) { return (error as Error).message }
  }
  async function withdrawRequest(requestId: string): Promise<string | null> {
    try {
      await remote.mutate(`/requests/${encodeURIComponent(requestId)}/withdraw`, 'POST', {})
      setNotice(`${requestId}: заявка отозвана.`)
      return null
    } catch (error) { return (error as Error).message }
  }
  const lastSubmission = useRef<{ payload: string; key: string } | null>(null)
  async function createRequest(start: string, end: string, _days: number, comment: string): Promise<string | null> {
    const body = { startDate: start, endDate: end, comment, ...(resubmitSourceId ? { sourceRequestId: resubmitSourceId } : {}) }
    const payload = JSON.stringify(body)
    // A retry after a lost response uses the same key; the server returns the existing request.
    if (lastSubmission.current?.payload !== payload) lastSubmission.current = { payload, key: crypto.randomUUID() }
    try {
      const { id } = await remote.mutate<{ id: string }>('/requests', 'POST', body, lastSubmission.current.key)
      lastSubmission.current = null
      setRequestFilter('all'); setOverlay(null); setResubmitSourceId(null); setSelectedRequestId(id)
      setNotice(`Заявка ${id} создана`)
      return null
    } catch (error) { return (error as Error).message }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <aside className="sidebar">
        <Sidebar
          activePage={page}
          onNavigate={navigate}
          onAssistant={() => setOverlay('assistant')}
          employee={viewer}
          role={role}
          pendingCount={pendingCount}
          unreadCount={unreadCount}
        />
      </aside>
      <div className="workspace">
        <Header
          page={page}
          employee={viewer}
          role={role}
          onLogout={remote.logout}
          unreadCount={unreadCount}
          onMenu={() => setOverlay('menu')}
          onNotifications={() => navigate('notifications')}
          onProfile={() => navigate('profile')}
        />
        <main id="main" className="main-content" ref={mainRef} tabIndex={-1}>
          <section className={`server-bar ${remote.error ? 'server-bar-error' : ''}`} aria-label="Состояние подключения">
            <p role={remote.error ? 'alert' : undefined}><span className="sync-indicator" aria-hidden="true" />{remote.error || 'Данные обновлены'}</p>
            <button aria-label={remote.refreshing ? 'Обновляем…' : 'Обновить данные'} disabled={remote.refreshing} onClick={() => void remote.refresh()}>{remote.refreshing ? 'Обновляем…' : 'Обновить'}</button>
          </section>
          {page === 'home' && role === 'employee' ? (
            <EmployeeHome
              today={today}
              employee={viewer}
              requests={requests}
              courses={courses}
              onNewRequest={() => beginVacationRequest()}
              onRequest={openRequest}
              onCourse={(course) => openCourse(course.id)}
              onRequests={() => navigate('requests')}
              onLearning={() => navigate('learning')}
              onProfile={() => navigate('profile')}
              onAssistant={() => setOverlay('assistant')}
            />
          ) : page === 'learning' &&
            role === 'employee' &&
            selectedCourse &&
            selectedEnrollment ? (
            <CoursePage
              key={selectedCourse.id}
              course={selectedCourse}
              enrollment={selectedEnrollment}
              onBack={() => navigate(courseOrigin)}
              backLabel={
                courseOrigin === 'notifications'
                  ? 'К уведомлениям'
                  : 'Все курсы'
              }
              onCompleteLesson={(lessonId) => academyAction(`/courses/${encodeURIComponent(selectedCourse.id)}/lessons/${encodeURIComponent(lessonId)}/complete`, 'POST', {})}
              onAnswer={(questionId, optionId) => academyAction(`/courses/${encodeURIComponent(selectedCourse.id)}/answers`, 'PATCH', { questionId, optionId, revision: selectedEnrollment.revision })}
              onSubmitQuiz={submitQuiz}
              onRetry={() => academyAction(`/courses/${encodeURIComponent(selectedCourse.id)}/quiz/retry`, 'POST', { revision: selectedEnrollment.revision })}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">{role === 'hr' ? 'КАБИНЕТ HR' : 'ЛИЧНЫЙ КАБИНЕТ'}</span>
                  <h1>
                    {page === 'requests'
                      ? requestPageLabel(role)
                      : pageLabels[page]}
                  </h1>
                  <p>
                    {page === 'requests'
                      ? role === 'hr' ? 'Заявки сотрудников вашей компании: статусы и история решений.' : role === 'manager'
                        ? 'Рассматривайте заявки сотрудников вашей команды.'
                        : 'Ваши обращения и актуальные статусы.'
                      : page === 'notifications'
                        ? 'События по заявкам и обучению — в одном месте.'
                        : page === 'employees'
                          ? 'Сотрудники вашей компании и кадровые сведения для работы HR.'
                        : page === 'learning'
                          ? 'Развивайтесь в своём темпе.'
                          : 'Ваша информация в одном месте.'}
                  </p>
                </div>
                {page === 'requests' && role === 'employee' && (
                  <button
                    className="primary-button"
                    onClick={() => beginVacationRequest()}
                  >
                    <Icon name="plus" size={18} />
                    Новая заявка
                  </button>
                )}
              </div>
              {page === 'requests' && role === 'manager' && (
                <section className="team-summary" aria-label="Обзор команды">
                  <div>
                    <span>Сотрудников в команде</span>
                    <strong>{members.length}</strong>
                    <small>Операционный отдел</small>
                  </div>
                  <div>
                    <span>Отпусков ждут решения</span>
                    <strong>
                      {
                        requests.filter(
                          (item) =>
                            item.type === 'vacation' &&
                            item.status === 'pending',
                        ).length
                      }
                    </strong>
                    <small>Доступны для согласования</small>
                  </div>
                  <div>
                    <span>Заявок команды</span>
                    <strong>{requests.length}</strong>
                    <small>Все типы и статусы</small>
                  </div>
                </section>
              )}
              {page === 'requests' && (
                <RequestsPage
                  requests={requests}
                  mode={role === 'hr' ? 'hr' : role === 'manager' ? 'team' : 'personal'}
                  employees={role === 'hr' ? workflow.employees : members}
                  filter={requestFilter}
                  onFilter={setRequestFilter}
                  onOpen={openRequest}
                  onNewRequest={() => beginVacationRequest()}
                />
              )}
              {page === 'learning' && (
                <AcademyPage courses={courses} onOpen={openCourse} />
              )}
              {page === 'employees' && role === 'hr' && (
                <EmployeesPage employees={workflow.employees} requests={requests} />
              )}
              {page === 'notifications' && (
                <NotificationsPage
                  entries={notificationFeed(
                    workflow.notifications,
                    session,
                    notificationFilter,
                  ).map((notification) => ({
                    notification,
                    target: notificationTarget(notification, session, workflow),
                  }))}
                  totalCount={notifications.length}
                  unreadCount={unreadCount}
                  filter={notificationFilter}
                  onFilter={setNotificationFilter}
                  onRead={markNotificationRead}
                  onReadAll={() => {
                    void remote.mutate('/notifications/read-all', 'POST', {}).then(() => {
                      setNotice('Все уведомления отмечены прочитанными')
                    }).catch((error: Error) => setNotice(error.message))
                  }}
                  onOpen={openNotification}
                />
              )}
              {page === 'profile' &&
                (profile ? (
                  <ProfilePage
                    key={profile.employeeId}
                    employee={viewer}
                    profile={profile}
                    role={role}
                    onSave={saveProfileContacts}
                  />
                ) : (
                  <p role="alert">Профиль недоступен.</p>
                ))}
            </>
          )}
          <footer className="page-footer">
            <span>© 2026 JanaМен</span>
            <span>Демонстрационный стенд · все сотрудники вымышлены</span>
            <span className="footer-company">
              Часть команды Jana Post <span>↗</span>
            </span>
          </footer>
        </main>
      </div>
      <FeedbackToast key={notice} message={notice} onDismiss={dismissNotice} />
      {overlay === 'menu' && (
        <Modal
          title="Меню"
          onClose={() => setOverlay(null)}
          className="mobile-drawer"
        >
          <Sidebar
            activePage={page}
            onNavigate={navigate}
            onAssistant={() => setOverlay('assistant')}
            employee={viewer}
            role={role}
            pendingCount={pendingCount}
            unreadCount={unreadCount}
          />
        </Modal>
      )}
      {overlay === 'new-request' && role === 'employee' && (
        <Modal
          key={resubmitSourceId || 'new'}
          title={
            resubmitSourceId ? 'Повторная подача отпуска' : 'Оформить отпуск'
          }
          onClose={closeVacationForm}
        >
          <VacationForm
            applicant={viewer}
            today={today}
            requests={requests}
            key={resubmitSourceId || 'new'}
            source={resubmitSource}
            onSubmit={createRequest}
            onCancel={closeVacationForm}
          />
        </Modal>
      )}
      {selectedRequest && requestApplicant && (
        <Modal
          key={selectedRequest.id}
          title={`Заявка ${selectedRequest.id}`}
          onClose={() => {
            setSelectedRequestId(null)
            if (page === 'notifications') focusMain()
          }}
          className="request-details-modal"
        >
          <RequestDetails
            key={selectedRequest.id}
            request={selectedRequest}
            employee={requestApplicant}
            isManager={role === 'manager'}
            isHr={role === 'hr'}
            approvalBlockReason={
              selectedRequest.type === 'vacation' &&
              canReviewRequest(session, selectedRequest, workflow.employees)
                ? vacationConflictMessage(
                    approvedVacationConflicts(
                      selectedRequest.startDate,
                      selectedRequest.endDate,
                      selectedRequest.employeeId,
                      workflow.requests,
                    ),
                    'approval',
                  ) ||
                  vacationBalanceMessage(
                    selectedRequest.days,
                    requestApplicant.vacationDays,
                    'approval',
                  )
                : null
            }
            canResubmit={canResubmitRequest(
              session,
              selectedRequest,
              workflow.employees,
            )}
            onResubmit={() => beginVacationRequest(selectedRequest)}
            sourceRequest={originalRequest}
            onOpenSource={
              originalRequest ? () => openRequest(originalRequest) : undefined
            }
            canWithdraw={canWithdrawRequest(
              session,
              selectedRequest,
              workflow.employees,
            )}
            onWithdraw={() => withdrawRequest(selectedRequest.id)}
            canReview={canReviewRequest(
              session,
              selectedRequest,
              workflow.employees,
            )}
            onReview={(decision, comment) =>
              reviewRequest(selectedRequest.id, decision, comment)
            }
          />
        </Modal>
      )}
      {overlay === 'assistant' && role === 'employee' && (
        <AssistantChat
          turns={chatTurns}
          onClose={() => setOverlay(null)}
          onReset={() => setChatTurns([])}
          onNavigate={navigate}
          onSend={(question) =>
            setChatTurns((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                question,
                answer: answerQuestion(question),
              },
            ])
          }
        />
      )}
    </div>
  )
}

export default App
