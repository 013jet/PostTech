import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { buildApp } from '../src/app.js'
import { createPool, databaseUrl } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { seed, localPassword } from '../src/seed.js'

test('Academy PostgreSQL: private grading, progress, retries, concurrent submissions and persistence', async (t) => {
  const connection = await databaseUrl()
  const admin = createPool(connection)
  const schema = `test_academy_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(connection)
  url.searchParams.set('options', `-c search_path=${schema}`)
  const pool = createPool(url.href)
  let app = await buildApp(pool)
  const send = (method: 'GET' | 'POST' | 'PATCH', path: string, cookie = '', payload?: unknown, key?: string) => app.inject({ method, url: path, headers: { host: '127.0.0.1:3001', 'x-janamen-request': '1', cookie, ...(key ? { 'idempotency-key': key } : {}) }, ...(payload !== undefined ? { payload } : {}) })
  const login = async (email: string) => {
    const response = await send('POST', '/api/auth/login', '', { email, password: localPassword })
    assert.equal(response.statusCode, 200)
    return (response.headers['set-cookie'] as string).split(';')[0]
  }
  const state = async (cookie: string) => {
    const response = await send('GET', '/api/workspace', cookie)
    assert.equal(response.statusCode, 200)
    return response.json()
  }
  const enrollment = (snapshot: any, courseId = 'onboarding') => snapshot.enrollments.find((item: any) => item.courseId === courseId)
  const current = async () => enrollment(await state(employee))
  const complete = (id: string, cookie = employee) => send('POST', `/api/courses/onboarding/lessons/${id}/complete`, cookie, {})
  const answer = async (questionId: string, optionId: string, revision?: number) => send('PATCH', '/api/courses/onboarding/answers', employee, { questionId, optionId, revision: revision ?? (await current()).revision })
  const submit = (revision: number, key = randomUUID()) => send('POST', '/api/courses/onboarding/quiz/submit', employee, { revision }, key)
  const catalog = JSON.parse(await readFile(new URL('../seed-data/academy.json', import.meta.url), 'utf8'))
  const course = catalog.find((item: any) => item.id === 'onboarding')
  let employee = '', manager = '', outside = '', failedKey = '', passedKey = '', passedId = '', passedRevision = 0
  try {
    await migrate(pool)
    await seed(pool)
    employee = await login('employee@janamen.local')
    manager = await login('manager@janamen.local')
    outside = await login('outside@janamen.local')
    await t.test('only assigned employee receives courses; correct answers are absent before first submission', async () => {
      assert.equal((await send('GET', '/api/workspace')).statusCode, 401)
      const own = await state(employee)
      assert.equal(own.courses.length, 2)
      assert.deepEqual(enrollment(own).completedLessonIds, [])
      assert.equal(enrollment(own).revision, 0)
      assert.equal(JSON.stringify(own.courses).includes('correctOptionId'), false)
      assert.equal(JSON.stringify(own.courses).includes('explanation'), false)
      assert.deepEqual(enrollment(own).attempts, [])
      assert.deepEqual((await state(manager)).courses, [])
      assert.deepEqual((await state(outside)).courses, [])
      assert.equal((await complete('company', manager)).statusCode, 403)
      assert.equal((await complete('company', outside)).statusCode, 404)
      assert.equal((await send('POST', '/api/courses/missing/lessons/company/complete', employee, {})).statusCode, 404)
    })
    await t.test('curriculum publishes only approved fields at every nesting level', async () => {
      const privateCourse = structuredClone(course)
      privateCourse.internalNote = 'private-course-marker'
      privateCourse.quiz.answerKey = 'private-course-marker'
      privateCourse.lessons[0].internalNote = 'private-course-marker'
      privateCourse.quiz.questions[0].internalNote = 'private-course-marker'
      privateCourse.quiz.questions[0].options[0].internalNote = 'private-course-marker'
      try {
        await pool.query('UPDATE courses SET data = $2 WHERE id = $1', [course.id, privateCourse])
        const published = (await state(employee)).courses.find((item: any) => item.id === course.id)
        assert.equal(JSON.stringify(published).includes('private-course-marker'), false)
        assert.equal(published.title, course.title)
        assert.deepEqual(published.lessons, course.lessons)
        assert.deepEqual(published.quiz.questions[0], {
          id: course.quiz.questions[0].id, text: course.quiz.questions[0].text,
          options: course.quiz.questions[0].options,
        })
      } finally {
        await pool.query('UPDATE courses SET data = $2 WHERE id = $1', [course.id, course])
      }
    })
    await t.test('materials gate enforced on API, wrong lessons and forged grades rejected', async () => {
      assert.equal((await answer('values-q', 'b', 0)).json().code, 'LESSONS_REQUIRED')
      assert.equal((await submit(0)).json().code, 'LESSONS_REQUIRED')
      assert.equal((await complete('missing')).statusCode, 404)
      assert.equal((await send('POST', '/api/courses/onboarding/quiz/submit', employee, { revision: 0, score: 100, completedAt: '2098-01-01' }, randomUUID())).statusCode, 400)
      assert.equal((await send('PATCH', '/api/courses/onboarding/answers', employee, { revision: 0, questionId: 'values-q', optionId: 'b', employeeId: 'employee-timur' })).statusCode, 400)
    })
    await t.test('concurrent lesson marks are idempotent and independent materials accumulate', async () => {
      const results = await Promise.all([complete('company'), complete('company'), complete('values'), complete('teamwork')])
      assert.ok(results.every((response) => response.statusCode === 200))
      assert.equal((await current()).completedLessonIds.length, 3)
      assert.equal((await current()).revision, 3)
      assert.equal((await complete('workspace')).statusCode, 200)
      assert.equal((await current()).completedLessonIds.length, 4)
      assert.equal((await answer('missing', 'a')).statusCode, 400)
      assert.equal((await answer('values-q', 'missing')).statusCode, 400)
      assert.equal((await submit((await current()).revision)).json().code, 'ANSWERS_REQUIRED')
    })
    await t.test('answer drafts persist, stale revisions cannot overwrite another tab, first failed result is graded server-side', async () => {
      const revision = (await current()).revision
      assert.equal((await answer('values-q', 'a', revision)).statusCode, 200)
      assert.equal((await answer('handoff-q', 'b', revision)).json().code, 'STALE_PROGRESS')
      assert.equal((await current()).answers['values-q'], 'a')
      assert.equal((await current()).answers['handoff-q'], undefined)
      for (const question of course.quiz.questions) {
        const wrong = question.options.find((option: any) => option.id !== question.correctOptionId).id
        assert.equal((await answer(question.id, wrong)).statusCode, 200)
      }
      failedKey = randomUUID()
      const ready = await current()
      const responses = await Promise.all([submit(ready.revision, failedKey), submit(ready.revision, failedKey)])
      assert.ok(responses.every((response) => response.statusCode === 201))
      assert.equal(responses[0].json().id, responses[1].json().id)
      const result = await current()
      assert.equal(result.attempts.length, 1)
      assert.equal(result.attempts[0].score, 0)
      assert.equal(result.attempts[0].passed, false)
      assert.equal(result.attempts[0].review.length, 5)
      assert.equal(result.completedAt, undefined)
      assert.equal((await state(employee)).notifications.filter((notice: any) => notice.title === 'Курс завершён').length, 0)
      assert.equal((await answer('values-q', 'b')).json().code, 'QUIZ_ALREADY_SUBMITTED')
    })
    await t.test('retry retains attempts and lessons, clears only current answers and rejects stale retry', async () => {
      const old = await current()
      assert.equal((await send('POST', '/api/courses/onboarding/quiz/retry', employee, { revision: old.revision - 1 })).json().code, 'STALE_PROGRESS')
      assert.equal((await send('POST', '/api/courses/onboarding/quiz/retry', employee, { revision: old.revision })).statusCode, 200)
      const next = await current()
      assert.equal(next.quizView, 'questions')
      assert.deepEqual(next.answers, {})
      assert.deepEqual(next.attempts, old.attempts)
      assert.deepEqual(next.completedLessonIds, old.completedLessonIds)
      assert.equal((await submit(old.revision, failedKey)).statusCode, 409)
    })
    await t.test('80% completion, concurrent distinct submits produce one attempt and one linked notification', async () => {
      for (const [index, question] of course.quiz.questions.entries()) {
        const option = index < 4 ? question.correctOptionId : question.options.find((option: any) => option.id !== question.correctOptionId).id
        assert.equal((await answer(question.id, option)).statusCode, 200)
      }
      passedRevision = (await current()).revision
      const keys = [randomUUID(), randomUUID()]
      const responses = await Promise.all(keys.map((key) => submit(passedRevision, key)))
      assert.deepEqual(responses.map((response) => response.statusCode).sort(), [201, 409])
      const index = responses.findIndex((response) => response.statusCode === 201)
      passedKey = keys[index]; passedId = responses[index].json().id
      const snapshot = await state(employee)
      const result = enrollment(snapshot)
      assert.equal(result.attempts.length, 2)
      assert.equal(result.attempts[1].score, 80)
      assert.equal(result.attempts[1].correct, 4)
      assert.equal(result.attempts[1].passed, true)
      assert.ok(result.completedAt)
      const notices = snapshot.notifications.filter((notice: any) => notice.title === 'Курс завершён')
      assert.equal(notices.length, 1)
      assert.equal(notices[0].courseId, 'onboarding')
      assert.equal(notices[0].requestId, undefined)
      assert.equal((await state(manager)).notifications.some((notice: any) => notice.courseId === 'onboarding'), false)
      assert.equal((await state(outside)).notifications.some((notice: any) => notice.courseId === 'onboarding'), false)
    })
    await t.test('completed course is immutable; submission retry cannot duplicate result or notification', async () => {
      const before = await current()
      assert.equal((await submit(passedRevision, passedKey)).json().id, passedId)
      assert.equal((await submit(before.revision, passedKey)).json().code, 'IDEMPOTENCY_CONFLICT')
      assert.equal((await answer('values-q', 'a')).json().code, 'COURSE_COMPLETED')
      assert.equal((await send('POST', '/api/courses/onboarding/quiz/retry', employee, { revision: before.revision })).json().code, 'COURSE_COMPLETED')
      assert.equal((await complete('company')).statusCode, 200)
      assert.deepEqual(await current(), before)
    })
    await t.test('stored quiz reviews cannot expose extra private fields', async () => {
      const { rows } = await pool.query('SELECT review FROM quiz_attempts WHERE id = $1', [passedId])
      const original = rows[0].review
      const withPrivateFields = structuredClone(original)
      withPrivateFields[0].internalNote = 'private-review-marker'
      withPrivateFields[0].options[0].internalNote = 'private-review-marker'
      try {
        await pool.query('UPDATE quiz_attempts SET review = $2 WHERE id = $1', [passedId, JSON.stringify(withPrivateFields)])
        const review = (await current()).attempts.find((item: any) => item.id === passedId).review
        assert.equal(JSON.stringify(review).includes('private-review-marker'), false)
        assert.deepEqual(review, original)
      } finally {
        await pool.query('UPDATE quiz_attempts SET review = $2 WHERE id = $1', [passedId, JSON.stringify(original)])
      }
    })
    await t.test('progress/attempts/read status survive restart and seed; separate account stays at zero', async () => {
      const before = await state(employee)
      const notice = before.notifications.find((notice: any) => notice.title === 'Курс завершён')
      assert.equal((await send('POST', `/api/notifications/${notice.id}/read`, employee, {})).statusCode, 200)
      const another = await login('employee@janamen.local')
      await app.close()
      app = await buildApp(pool)
      await seed(pool)
      const after = await state(another)
      assert.deepEqual(after.courses, before.courses)
      assert.deepEqual(after.enrollments, before.enrollments)
      assert.equal(after.notifications.filter((notice: any) => notice.title === 'Курс завершён').length, 1)
      assert.equal(after.notifications.find((item: any) => item.id === notice.id).read, true)
      const timur = await login('timur@janamen.local')
      assert.equal(enrollment(await state(timur)).attempts.length, 0)
      assert.deepEqual(enrollment(await state(timur)).completedLessonIds, [])
    })
  } finally {
    await app.close()
    await pool.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  }
})
