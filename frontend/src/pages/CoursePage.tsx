import { useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Course, CourseEnrollment } from '../types'
import { allLessonsCompleted } from '../utils/academy'
import { formatHistoryDate } from '../utils/requests'
import { Icon } from '../components/Icon'

export function CoursePage({
  course,
  enrollment,
  onBack,
  backLabel = 'Все курсы',
  onCompleteLesson,
  onAnswer,
  onSubmitQuiz,
  onRetry,
}: {
  course: Course
  enrollment: CourseEnrollment
  onBack: () => void
  backLabel?: string
  onCompleteLesson: (lessonId: string) => Promise<string | null>
  onAnswer: (questionId: string, optionId: string) => Promise<string | null>
  onSubmitQuiz: () => Promise<string | null>
  onRetry: () => Promise<string | null>
}) {
  const [activeStep, setActiveStep] = useState(() =>
    enrollment.completedAt || enrollment.quizView === 'result'
      ? 'test'
      : course.lessons.find(
          (lesson) => !enrollment.completedLessonIds.includes(lesson.id),
        )?.id || 'test',
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const [outlineOpen, setOutlineOpen] = useState(
    () => window.matchMedia('(min-width: 701px)').matches,
  )
  const readerRef = useRef<HTMLDivElement>(null)
  const [focusVersion, setFocusVersion] = useState(0)
  useLayoutEffect(() => {
    if (!focusVersion) return
    readerRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    readerRef.current?.focus({ preventScroll: true })
  }, [focusVersion])
  function focusReader() {
    setFocusVersion((version) => version + 1)
  }
  const lesson = course.lessons.find((item) => item.id === activeStep)
  const lessonIndex = course.lessons.findIndex((item) => item.id === activeStep)
  const lessonDone = Boolean(
    lesson && enrollment.completedLessonIds.includes(lesson.id),
  )
  const testAvailable = allLessonsCompleted(course, enrollment)
  const lastAttempt = enrollment.attempts.at(-1)
  const showResult =
    activeStep === 'test' && enrollment.quizView === 'result' && lastAttempt
  function selectStep(step: string) {
    setActiveStep(step)
    setError('')
    if (window.matchMedia('(max-width: 700px)').matches) setOutlineOpen(false)
    focusReader()
  }
  async function perform(action: () => Promise<string | null>, after?: () => void) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const message = await action()
      setError(message || '')
      if (!message) after?.()
    } catch { setError('Не удалось сохранить изменения. Повторите попытку.') }
    finally { sending.current = false; setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(onSubmitQuiz, focusReader)
  }

  return (
    <div className="academy-course-page">
      <button className="course-back" onClick={onBack} disabled={busy}>
        <Icon name="arrow" size={17} />
        {backLabel}
      </button>
      <header className={`academy-course-header ${course.color}`}>
        <div>
          <span className="eyebrow">JANA ACADEMY · {course.category}</span>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
          <div className="academy-course-meta">
            <span>
              <Icon name="clock" size={15} />
              {course.duration}
            </span>
            <span>
              <Icon name="book" size={15} />
              {course.lessons.length} материала
            </span>
            <span>
              <Icon name="check" size={15} />
              Проходной балл: {course.quiz.passingScore}%
            </span>
          </div>
        </div>
        <div className="course-progress-overview">
          <div
            className="course-progress-ring"
            role="progressbar"
            aria-label="Прогресс курса"
            aria-valuenow={course.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              background: `conic-gradient(#7b9e69 ${course.progress}%, #e1e9dc 0)`,
            }}
          >
            <span>
              {course.progress}
              <small>%</small>
            </span>
          </div>
          <strong>
            {enrollment.completedAt ? 'Курс завершён' : 'Ваш прогресс'}
          </strong>
          <span>
            Материалы: {course.completedLessons}/{course.lessons.length}
          </span>
        </div>
      </header>
      <div className="academy-course-layout">
        <aside className="course-outline panel">
          <details
            open={outlineOpen}
            onToggle={(event) => setOutlineOpen(event.currentTarget.open)}
          >
            <summary>
              Содержание курса <span>Шагов: {course.lessons.length + 1}</span>
            </summary>
            <nav aria-label="Материалы курса">
              {course.lessons.map((item, index) => {
                const done = enrollment.completedLessonIds.includes(item.id)
                return (
                  <button
                    key={item.id}
                    className={`outline-step ${activeStep === item.id ? 'outline-active' : ''}`}
                    aria-current={activeStep === item.id ? 'step' : undefined}
                    onClick={() => selectStep(item.id)}
                    disabled={busy}
                  >
                    <span
                      className={`outline-number ${done ? 'outline-done' : ''}`}
                    >
                      {done ? <Icon name="check" size={14} /> : index + 1}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{done ? 'Пройдено' : item.duration}</small>
                    </span>
                  </button>
                )
              })}
              <button
                className={`outline-step outline-test ${activeStep === 'test' ? 'outline-active' : ''}`}
                disabled={busy || !testAvailable}
                aria-current={activeStep === 'test' ? 'step' : undefined}
                onClick={() => selectStep('test')}
              >
                <span
                  className={`outline-number ${enrollment.completedAt ? 'outline-done' : ''}`}
                >
                  <Icon
                    name={enrollment.completedAt ? 'check' : 'shield'}
                    size={15}
                  />
                </span>
                <span>
                  <strong>Итоговый тест</strong>
                  <small>
                    {enrollment.completedAt
                      ? `Пройден · ${lastAttempt?.score}%`
                      : testAvailable
                        ? `${course.quiz.questions.length} вопросов · ${course.quiz.duration}`
                        : 'После всех материалов'}
                  </small>
                </span>
              </button>
            </nav>
          </details>
          <div className="course-outline-note">
            <Icon name="shield" size={16} />
            <p>
              Сначала материалы, затем тест. Для завершения наберите не менее{' '}
              {course.quiz.passingScore}%.
            </p>
          </div>
        </aside>
        <div className="course-reader" ref={readerRef} tabIndex={-1} aria-busy={busy}>
          {error && <p className="form-error quiz-error" role="alert">{error}</p>}
          {busy && <p role="status">Сохраняем изменения…</p>}
          {lesson && (
            <article className="panel lesson-panel">
              <div className="lesson-heading">
                <span className="eyebrow">
                  МАТЕРИАЛ {lessonIndex + 1} ИЗ {course.lessons.length}
                </span>
                <span>
                  <Icon name="clock" size={14} />
                  {lesson.duration}
                </span>
              </div>
              <h2>{lesson.title}</h2>
              <div className="lesson-body">
                {lesson.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <h3>Что важно запомнить</h3>
                <ul>
                  {lesson.takeaways.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="lesson-practice">
                  <span>
                    <Icon name="sparkle" size={19} />
                  </span>
                  <div>
                    <h3>На практике</h3>
                    <p>{lesson.practice}</p>
                  </div>
                </div>
              </div>
              <div className="lesson-actions">
                <button
                  className={`primary-button ${lessonDone ? 'lesson-completed-button' : ''}`}
                  disabled={busy || lessonDone}
                  onClick={() => void perform(() => onCompleteLesson(lesson.id))}
                >
                  <Icon name="check" size={17} />
                  {lessonDone
                    ? 'Материал пройден'
                    : 'Отметить материал пройденным'}
                </button>
                {lessonDone && (
                  <button
                    className="text-button"
                    onClick={() =>
                      selectStep(course.lessons[lessonIndex + 1]?.id || 'test')
                    }
                  >
                    {lessonIndex === course.lessons.length - 1
                      ? 'Перейти к тесту'
                      : 'Следующий материал'}
                    <Icon name="arrow" size={17} />
                  </button>
                )}
              </div>
            </article>
          )}
          {activeStep === 'test' && !testAvailable && (
            <section className="panel quiz-locked">
              <Icon name="shield" size={30} />
              <h2>Сначала пройдите материалы</h2>
              <p>
                Итоговый тест откроется после отметки всех материалов курса.
              </p>
            </section>
          )}
          {activeStep === 'test' && testAvailable && !showResult && (
            <section className="panel quiz-panel">
              <span className="eyebrow">ПРОВЕРКА ЗНАНИЙ</span>
              <h2>Итоговый тест</h2>
              <p className="quiz-intro">
                {course.quiz.questions.length} вопросов, по одному правильному
                ответу. Для завершения курса нужно набрать не менее{' '}
                {course.quiz.passingScore}%. Ответы можно менять до отправки.
              </p>
              <div className="quiz-attempt-meta">
                <span>Попытка {enrollment.attempts.length + 1}</span>
                <span>
                  <Icon name="clock" size={14} />
                  {course.quiz.duration}
                </span>
              </div>
              <form onSubmit={submit} noValidate aria-label="Итоговый тест">
                {course.quiz.questions.map((question, index) => (
                  <fieldset className="quiz-question" key={question.id} disabled={busy}>
                    <legend>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {question.text}
                    </legend>
                    <div className="quiz-options">
                      {question.options.map((option) => (
                        <label
                          key={option.id}
                          className={
                            enrollment.answers[question.id] === option.id
                              ? 'quiz-option-selected'
                              : ''
                          }
                        >
                          <input
                            type="radio"
                            name={`${course.id}-${question.id}`}
                            checked={
                              enrollment.answers[question.id] === option.id
                            }
                            onChange={() => {
                              void perform(() => onAnswer(question.id, option.id))
                            }}
                          />
                          <span>{option.text}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <div className="quiz-submit-row">
                  <span>
                    Отвечено:{' '}
                    {
                      course.quiz.questions.filter(
                        (question) => enrollment.answers[question.id],
                      ).length
                    }
                    /{course.quiz.questions.length}
                  </span>
                  <button className="primary-button" type="submit" disabled={busy}>
                    Проверить ответы
                    <Icon name="arrow" size={17} />
                  </button>
                </div>
              </form>
            </section>
          )}
          {showResult && (
            <section className="panel quiz-result-panel">
              <div
                className={`quiz-result-banner ${lastAttempt.passed ? 'quiz-passed' : 'quiz-failed'}`}
                role="status"
              >
                <span className="result-symbol">
                  <Icon
                    name={lastAttempt.passed ? 'check' : 'book'}
                    size={28}
                  />
                </span>
                <span className="eyebrow">
                  РЕЗУЛЬТАТ ПОПЫТКИ {enrollment.attempts.length}
                </span>
                <h2>
                  {lastAttempt.passed
                    ? 'Курс завершён!'
                    : 'Давайте попробуем ещё раз'}
                </h2>
                <p>
                  {lastAttempt.passed
                    ? 'Вы прошли материалы и успешно справились с тестом. Уведомление о завершении уже в вашем кабинете.'
                    : `Для завершения нужно ${course.quiz.passingScore}%. Посмотрите пояснения к ответам, вернитесь к материалам и повторите тест.`}
                </p>
                <div className="quiz-score">
                  <strong>
                    {lastAttempt.score}
                    <small>%</small>
                  </strong>
                  <span>
                    Правильных ответов: {lastAttempt.correct} из{' '}
                    {lastAttempt.total}
                  </span>
                </div>
                <time dateTime={lastAttempt.submittedAt}>
                  {formatHistoryDate(lastAttempt.submittedAt)}
                </time>
              </div>
              <div className="quiz-result-actions">
                {!lastAttempt.passed && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void perform(onRetry, focusReader)}
                  >
                    Пройти тест ещё раз
                    <Icon name="arrow" size={17} />
                  </button>
                )}
                <button
                  className="secondary-button"
                  onClick={() => selectStep(course.lessons[0].id)}
                >
                  Вернуться к материалам
                </button>
              </div>
              <div className="quiz-review">
                <h3>Разбор ответов</h3>
                {(lastAttempt.review || []).map((question, index) => {
                  const answer = question.options.find(
                    (option) => option.id === lastAttempt.answers[question.id],
                  )
                  const correct = question.correct
                  return (
                    <article
                      key={question.id}
                      className={`quiz-review-item ${correct ? 'review-correct' : 'review-incorrect'}`}
                    >
                      <span className="review-answer-icon">
                        <Icon name={correct ? 'check' : 'close'} size={16} />
                      </span>
                      <div>
                        <h4>
                          {index + 1}. {question.text}
                        </h4>
                        <p className="quiz-your-answer">
                          Ваш ответ: {answer?.text || 'Ответ не выбран'}
                        </p>
                        {!correct && (
                          <p className="quiz-correct-answer">
                            Правильный ответ:{' '}
                            {
                              question.options.find(
                                (option) =>
                                  option.id === question.correctOptionId,
                              )?.text
                            }
                          </p>
                        )}
                        <p>{question.explanation}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
              <div className="attempt-history">
                <h3>Попытки прохождения</h3>
                <ol>
                  {enrollment.attempts.map((attempt, index) => (
                    <li key={attempt.id}>
                      <span>
                        Попытка {index + 1}
                        <time dateTime={attempt.submittedAt}>
                          {formatHistoryDate(attempt.submittedAt)}
                        </time>
                      </span>
                      <strong
                        className={attempt.passed ? 'attempt-passed' : ''}
                      >
                        {attempt.score}% ·{' '}
                        {attempt.passed ? 'Пройдено' : 'Не пройдено'}
                      </strong>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
          <p className="academy-demo-note">
            Учебные материалы стенда · прогресс и результаты сохраняются на сервере.
          </p>
        </div>
      </div>
    </div>
  )
}
