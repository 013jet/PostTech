import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowReducer } from './workflow.ts'
import { allLessonsCompleted, courseProgress } from './academy.ts'
import { courseCatalog, initialEnrollments } from '../../test/academy-fixture.mjs'

const session = { role: 'employee', userId: 'employee-aidana' }
const security = courseCatalog.find((course) => course.id === 'security')
const onboarding = courseCatalog.find((course) => course.id === 'onboarding')
function fixture() {
  return {
    employees: [],
    requests: [],
    courses: structuredClone(courseCatalog),
    enrollments: structuredClone(initialEnrollments),
    notifications: [
      {
        id: 'manager-notice',
        recipientId: 'manager-daniyar',
        title: 'Команда',
        description: '',
        time: '',
        read: false,
      },
    ],
  }
}
function enrollment(state, id = 'security') {
  return state.enrollments.find((item) => item.courseId === id)
}
function complete(state, lessonId, overrides = {}) {
  return workflowReducer(state, {
    type: 'lesson-complete',
    session,
    courseId: 'security',
    lessonId,
    ...overrides,
  })
}
function readAll(state) {
  return security.lessons.reduce(
    (current, lesson) => complete(current, lesson.id),
    state,
  )
}
function answer(state, questionId, optionId) {
  return workflowReducer(state, {
    type: 'quiz-answer',
    session,
    courseId: 'security',
    questionId,
    optionId,
  })
}
function answerQuiz(state, correctCount) {
  return security.quiz.questions.reduce(
    (current, question, index) =>
      answer(
        current,
        question.id,
        index < correctCount
          ? question.correctOptionId
          : question.options.find(
              (option) => option.id !== question.correctOptionId,
            ).id,
      ),
    state,
  )
}
function submit(state, overrides = {}) {
  return workflowReducer(state, {
    type: 'quiz-submit',
    session,
    courseId: 'security',
    attemptId: 'attempt-1',
    submittedAt: '2026-10-16T18:00:00+05:00',
    ...overrides,
  })
}

test('progress reflects unique materials and reserves the final step for the test', () => {
  const state = fixture()
  assert.equal(courseProgress(onboarding, enrollment(state, 'onboarding')), 60)
  assert.equal(courseProgress(security, enrollment(state)), 0)
  const first = complete(state, 'access')
  assert.equal(courseProgress(security, enrollment(first)), 25)
  assert.strictEqual(complete(first, 'access'), first)
  assert.strictEqual(complete(first, 'unknown'), first)
  assert.equal(courseProgress(security, enrollment(readAll(first))), 75)
  assert.equal(enrollment(state).completedLessonIds.length, 0)
})

test('test and answers are blocked before all materials are completed', () => {
  const state = fixture()
  assert.equal(allLessonsCompleted(security, enrollment(state)), false)
  assert.strictEqual(submit(state), state)
  assert.strictEqual(answer(state, 'password-q', 'c'), state)
  assert.equal(state.notifications.length, 1)
})

test('academy actions are limited to the assigned employee and valid material/question IDs', () => {
  const state = fixture()
  assert.strictEqual(
    complete(state, 'access', {
      session: { role: 'manager', userId: session.userId },
    }),
    state,
  )
  assert.strictEqual(
    complete(state, 'access', {
      session: { role: 'employee', userId: 'employee-timur' },
    }),
    state,
  )
  assert.strictEqual(complete(state, 'access', { courseId: 'missing' }), state)
  const ready = readAll(state)
  assert.strictEqual(answer(ready, 'unknown', 'a'), ready)
  assert.strictEqual(answer(ready, 'password-q', 'invalid'), ready)
  assert.strictEqual(submit(ready), ready)
  assert.equal(enrollment(ready).attempts.length, 0)
})

test('failed attempts retain materials, keep the course incomplete and send no completion notification', () => {
  const answered = answerQuiz(readAll(fixture()), 3)
  const failed = submit(answered)
  assert.equal(enrollment(failed).attempts[0].score, 60)
  assert.equal(enrollment(failed).attempts[0].passed, false)
  assert.equal(enrollment(failed).completedAt, undefined)
  assert.equal(enrollment(failed).quizView, 'result')
  assert.equal(courseProgress(security, enrollment(failed)), 75)
  assert.equal(failed.notifications.length, 1)
  assert.strictEqual(submit(failed, { attemptId: 'duplicate-click' }), failed)
  assert.equal(enrollment(answered).attempts.length, 0)
})

test('retry clears only current answers; an exact passing score completes the course and notifies its author', () => {
  const failed = submit(answerQuiz(readAll(fixture()), 3))
  const snapshot = structuredClone(enrollment(failed).attempts[0].answers)
  const retry = workflowReducer(failed, {
    type: 'quiz-retry',
    session,
    courseId: 'security',
  })
  assert.deepEqual(enrollment(retry).answers, {})
  assert.equal(enrollment(retry).quizView, 'questions')
  assert.equal(enrollment(retry).completedLessonIds.length, 3)
  const passed = submit(answerQuiz(retry, 4), { attemptId: 'attempt-2' })
  assert.equal(enrollment(passed).attempts.length, 2)
  assert.equal(enrollment(passed).attempts[1].score, 80)
  assert.equal(enrollment(passed).attempts[1].passed, true)
  assert.equal(courseProgress(security, enrollment(passed)), 100)
  assert.equal(passed.notifications[0].recipientId, session.userId)
  assert.equal(passed.notifications[0].courseId, 'security')
  assert.match(passed.notifications[0].description, /80% \(4 из 5\)/)
  assert.equal(passed.notifications.length, 2)
  assert.deepEqual(enrollment(passed).attempts[0].answers, snapshot)
  assert.equal(courseProgress(onboarding, enrollment(passed, 'onboarding')), 60)
})

test('completion is idempotent; reopening, retrying and answering cannot duplicate completion or notifications', () => {
  const passed = submit(answerQuiz(readAll(fixture()), 5))
  assert.strictEqual(submit(passed, { attemptId: 'new-id' }), passed)
  assert.strictEqual(
    workflowReducer(passed, {
      type: 'quiz-retry',
      session,
      courseId: 'security',
    }),
    passed,
  )
  assert.strictEqual(answer(passed, 'password-q', 'a'), passed)
  assert.equal(enrollment(passed).attempts.length, 1)
  assert.equal(
    passed.notifications.filter((item) => item.courseId === 'security').length,
    1,
  )
  assert.equal(
    passed.notifications.find((item) => item.id === 'manager-notice').read,
    false,
  )
})
