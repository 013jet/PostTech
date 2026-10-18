import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Pool, PoolClient } from 'pg'
import { transaction } from './db.js'
import { fail } from './security.js'
import type { Identity } from './workflow.js'

interface Question {
  id: string
  text: string
  options: { id: string; text: string }[]
  correctOptionId: string
  explanation: string
}
interface Curriculum {
  id: string
  title: string
  category: string
  duration: string
  color: 'green' | 'peach'
  description: string
  lessons: { id: string; title: string; duration: string; paragraphs: string[]; takeaways: string[]; practice: string }[]
  quiz: { passingScore: number; duration: string; questions: Question[] }
}
interface QuizReview extends Question { correct: boolean }

function publicQuestion({ id, text, options }: Question) {
  return { id, text, options: options.map(({ id, text }) => ({ id, text })) }
}
function publicReview(question: QuizReview) {
  return { ...publicQuestion(question), correctOptionId: question.correctOptionId, explanation: question.explanation, correct: question.correct }
}
interface EnrollmentRow {
  employee_id: string
  course_id: string
  completed_lessons: string[]
  answers: Record<string, string>
  quiz_view: 'questions' | 'result'
  revision: number
  completed_at: Date | null
  data: Curriculum
}

export async function seedAcademy(client: PoolClient) {
  const catalog: Curriculum[] = JSON.parse(await readFile(new URL('../seed-data/academy.json', import.meta.url), 'utf8'))
  for (const course of catalog) {
    // Never overwrite existing curriculum or progress on startup.
    await client.query('INSERT INTO courses(id,data) VALUES ($1,$2) ON CONFLICT DO NOTHING', [course.id, course])
    for (const userId of ['employee-aidana', 'employee-timur']) {
      const added = await client.query('INSERT INTO course_enrollments(employee_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING employee_id', [userId, course.id])
      if (!added.rowCount) continue
      await client.query('INSERT INTO notifications(id,recipient_id,course_id,event_key,title,description) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_key) DO NOTHING', [randomUUID(), userId, course.id, `course-assigned:${userId}:${course.id}`, 'Назначен новый курс', `${course.title}. Материалы и тест доступны в Jana Academy.`])
    }
  }
}

async function lockEnrollment(client: PoolClient, identity: Identity, courseId: string) {
  if (identity.role !== 'employee') fail(403, 'FORBIDDEN', 'Обучение доступно только сотруднику по его назначениям.')
  const { rows } = await client.query<EnrollmentRow>('SELECT e.*, c.data FROM course_enrollments e JOIN courses c ON c.id = e.course_id WHERE e.employee_id = $1 AND e.course_id = $2 FOR UPDATE OF e', [identity.userId, courseId])
  if (!rows.length) fail(404, 'COURSE_NOT_ASSIGNED', 'Курс не найден или не назначен вам.')
  return rows[0]
}
function requireRevision(enrollment: EnrollmentRow, revision: number) {
  if (enrollment.revision !== revision) fail(409, 'STALE_PROGRESS', 'Прогресс уже изменился в другом окне. Данные обновлены; повторите действие.')
}
function requireMaterials(enrollment: EnrollmentRow) {
  if (!enrollment.data.lessons.length || !enrollment.data.lessons.every((lesson) => enrollment.completed_lessons.includes(lesson.id)))
    fail(409, 'LESSONS_REQUIRED', 'Сначала пройдите все материалы курса.')
}
function requireQuestions(enrollment: EnrollmentRow) {
  if (enrollment.completed_at) fail(409, 'COURSE_COMPLETED', 'Курс уже завершён. Результат сохранён.')
  if (enrollment.quiz_view !== 'questions') fail(409, 'QUIZ_ALREADY_SUBMITTED', 'Результат уже сохранён. Для новой попытки нажмите «Пройти тест ещё раз».')
}
export async function completeLesson(pool: Pool, identity: Identity, courseId: string, lessonId: string) {
  await transaction(pool, async (client) => {
    const enrollment = await lockEnrollment(client, identity, courseId)
    if (!enrollment.data.lessons.some((lesson) => lesson.id === lessonId)) fail(404, 'LESSON_NOT_FOUND', 'Материал не найден в этом курсе.')
    if (enrollment.completed_lessons.includes(lessonId)) return
    if (enrollment.completed_at) fail(409, 'COURSE_COMPLETED', 'Курс уже завершён.')
    await client.query('UPDATE course_enrollments SET completed_lessons = $3, revision = revision + 1 WHERE employee_id = $1 AND course_id = $2', [identity.userId, courseId, JSON.stringify([...enrollment.completed_lessons, lessonId])])
  })
}
export async function saveAnswer(pool: Pool, identity: Identity, courseId: string, questionId: string, optionId: string, revision: number) {
  await transaction(pool, async (client) => {
    const enrollment = await lockEnrollment(client, identity, courseId)
    requireMaterials(enrollment)
    requireQuestions(enrollment)
    requireRevision(enrollment, revision)
    const question = enrollment.data.quiz.questions.find((item) => item.id === questionId)
    if (!question?.options.some((option) => option.id === optionId)) fail(400, 'INVALID_ANSWER', 'Выберите существующий вариант ответа в этом курсе.')
    if (enrollment.answers[questionId] === optionId) return
    await client.query('UPDATE course_enrollments SET answers = $3, revision = revision + 1 WHERE employee_id = $1 AND course_id = $2', [identity.userId, courseId, { ...enrollment.answers, [questionId]: optionId }])
  })
}
export async function submitQuiz(pool: Pool, identity: Identity, courseId: string, revision: number, key: string) {
  return transaction(pool, async (client) => {
    const enrollment = await lockEnrollment(client, identity, courseId)
    const previous = await client.query('SELECT id,employee_id,course_id,submitted_revision FROM quiz_attempts WHERE submission_key = $1', [key])
    if (previous.rowCount) {
      const saved = previous.rows[0]
      if (saved.employee_id !== identity.userId || saved.course_id !== courseId || saved.submitted_revision !== revision)
        fail(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другой попытки.')
      return saved.id as string
    }
    requireMaterials(enrollment)
    requireQuestions(enrollment)
    requireRevision(enrollment, revision)
    const { data: course } = enrollment
    if (!course.quiz.questions.length || !course.quiz.questions.every((question) => question.options.some((option) => option.id === enrollment.answers[question.id])))
      fail(400, 'ANSWERS_REQUIRED', 'Ответьте на все вопросы перед отправкой.')
    const correct = course.quiz.questions.filter((question) => question.correctOptionId === enrollment.answers[question.id]).length
    const total = course.quiz.questions.length
    const score = Math.round(correct / total * 100)
    const passed = score >= course.quiz.passingScore
    const review = course.quiz.questions.map((question) => publicReview({ ...question, correct: enrollment.answers[question.id] === question.correctOptionId }))
    const { rows: count } = await client.query('SELECT count(*)::int AS count FROM quiz_attempts WHERE employee_id = $1 AND course_id = $2', [identity.userId, courseId])
    const id = randomUUID()
    await client.query('INSERT INTO quiz_attempts(id,submission_key,submitted_revision,employee_id,course_id,attempt_number,answers,review,score,correct,total,passed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id, key, revision, identity.userId, courseId, count[0].count + 1, enrollment.answers, JSON.stringify(review), score, correct, total, passed])
    await client.query("UPDATE course_enrollments SET quiz_view = 'result', revision = revision + 1, completed_at = CASE WHEN $3 THEN now() ELSE completed_at END WHERE employee_id = $1 AND course_id = $2", [identity.userId, courseId, passed])
    if (passed) await client.query('INSERT INTO notifications(id,recipient_id,course_id,event_key,title,description) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_key) DO NOTHING', [randomUUID(), identity.userId, courseId, `course-completed:${identity.userId}:${courseId}`, 'Курс завершён', `${course.title}. Результат: ${score}% (${correct} из ${total}).`])
    return id
  })
}
export async function retryQuiz(pool: Pool, identity: Identity, courseId: string, revision: number) {
  await transaction(pool, async (client) => {
    const enrollment = await lockEnrollment(client, identity, courseId)
    requireRevision(enrollment, revision)
    if (enrollment.completed_at) fail(409, 'COURSE_COMPLETED', 'Курс уже завершён. Повторная сдача не требуется.')
    const { rows } = await client.query('SELECT passed FROM quiz_attempts WHERE employee_id = $1 AND course_id = $2 ORDER BY attempt_number DESC LIMIT 1', [identity.userId, courseId])
    if (enrollment.quiz_view !== 'result' || !rows.length || rows[0].passed) fail(409, 'RETRY_UNAVAILABLE', 'Новая попытка доступна после неуспешного теста.')
    await client.query("UPDATE course_enrollments SET answers = '{}', quiz_view = 'questions', revision = revision + 1 WHERE employee_id = $1 AND course_id = $2", [identity.userId, courseId])
  })
}

export async function academySnapshot(client: PoolClient, identity: Identity) {
  if (identity.role !== 'employee') return { courses: [], enrollments: [] }
  const { rows } = await client.query<EnrollmentRow>('SELECT e.*, c.data FROM course_enrollments e JOIN courses c ON c.id = e.course_id WHERE e.employee_id = $1 ORDER BY c.id', [identity.userId])
  const { rows: attempts } = await client.query('SELECT * FROM quiz_attempts WHERE employee_id = $1 ORDER BY course_id,attempt_number', [identity.userId])
  return {
    // Curriculum and stored reviews may gain internal fields; publish only the UI contract.
    courses: rows.map(({ data }) => ({
      id: data.id, title: data.title, category: data.category, duration: data.duration,
      color: data.color, description: data.description,
      lessons: data.lessons.map(({ id, title, duration, paragraphs, takeaways, practice }) => ({ id, title, duration, paragraphs, takeaways, practice })),
      quiz: { passingScore: data.quiz.passingScore, duration: data.quiz.duration, questions: data.quiz.questions.map(publicQuestion) },
    })),
    enrollments: rows.map((row) => ({
      employeeId: row.employee_id, courseId: row.course_id, revision: row.revision,
      completedLessonIds: row.completed_lessons, answers: row.answers, quizView: row.quiz_view,
      ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
      attempts: attempts.filter((attempt) => attempt.course_id === row.course_id).map((attempt) => ({
        id: attempt.id, answers: attempt.answers, review: (attempt.review as QuizReview[]).map(publicReview),
        score: attempt.score, correct: attempt.correct, total: attempt.total, passed: attempt.passed,
        submittedAt: attempt.submitted_at.toISOString(),
      })),
    })),
  }
}
