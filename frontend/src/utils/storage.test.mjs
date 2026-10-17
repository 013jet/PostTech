import test from 'node:test'
import assert from 'node:assert/strict'
import {
  demoStorageKey,
  encodeDemoState,
  decodeDemoState,
  loadDemoState,
  saveDemoState,
  resetDemoState,
  nextDemoRequestId,
} from './storage.ts'
import { workflowReducer } from './workflow.ts'
import { courseCatalog, initialEnrollments } from '../../test/academy-fixture.mjs'
import { initialProfiles } from '../mocks/profiles.ts'
import {
  approvedVacationConflicts,
  availableVacationDays,
  submissionHistory,
} from './requests.ts'
import { courseProgress } from './academy.ts'

const employee = { role: 'employee', userId: 'employee-aidana' }
const manager = { role: 'manager', userId: 'manager-daniyar' }
const now = '2026-10-16T12:00:00+05:00'
function request(id = 'JP-1048') {
  return {
    id,
    employeeId: employee.userId,
    type: 'vacation',
    title: 'Ежегодный отпуск',
    description: '5 календарных дней',
    createdAt: '2026-10-16',
    status: 'pending',
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    days: 5,
    comment: '',
    history: submissionHistory(id, now, now, 'Айдана'),
  }
}
function fixture() {
  return {
    employees: [
      {
        id: employee.userId,
        name: 'Айдана',
        managerId: manager.userId,
        vacationDays: 18,
      },
      { id: manager.userId, name: 'Данияр', managerId: 'director' },
    ],
    profiles: structuredClone(initialProfiles),
    courses: structuredClone(courseCatalog),
    enrollments: structuredClone(initialEnrollments),
    requests: [request()],
    notifications: [
      {
        id: 'course-assigned',
        recipientId: employee.userId,
        courseId: 'onboarding',
        title: 'Назначен курс',
        description: '',
        time: 'Сегодня',
        read: false,
      },
    ],
  }
}
function storage() {
  const values = new Map()
  let writes = 0
  return {
    values,
    access: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes++
        values.set(key, value)
      },
    }),
    get writes() {
      return writes
    },
  }
}
function materialState(state) {
  return state.courses
    .find((item) => item.id === 'onboarding')
    .lessons.reduce(
      (current, lesson) =>
        workflowReducer(current, {
          type: 'lesson-complete',
          session: employee,
          courseId: 'onboarding',
          lessonId: lesson.id,
        }),
      state,
    )
}

test('deducted days and the reduced balance survive reload without charging the same approval again', () => {
  const seed = fixture()
  const action = {
    type: 'review',
    session: manager,
    requestId: 'JP-1048',
    decision: 'approved',
    comment: 'Согласовано со списанием дней',
    occurredAt: now,
    eventId: 'balance-approval',
  }
  const approved = workflowReducer(seed, action)
  const owner = seed.employees[0]
  assert.equal(availableVacationDays(owner, approved.requests), 13)
  const memory = storage()
  assert.equal(saveDemoState(approved, null, memory.access).ok, true)
  const loaded = loadDemoState(seed, memory.access)
  assert.equal(loaded.blocked, false)
  assert.deepEqual(loaded.state, approved)
  assert.equal(loaded.state.requests[0].deductedVacationDays, 5)
  assert.equal(availableVacationDays(owner, loaded.state.requests), 13)
  assert.strictEqual(workflowReducer(loaded.state, action), loaded.state)
  const excessive = {
    ...request('JP-1060'),
    startDate: '2027-01-01',
    endDate: '2027-01-14',
    days: 14,
  }
  assert.strictEqual(
    workflowReducer(loaded.state, {
      type: 'create',
      session: employee,
      request: excessive,
    }),
    loaded.state,
  )
  const completed = {
    ...loaded.state,
    requests: loaded.state.requests.map((item) => ({
      ...item,
      status: 'completed',
    })),
  }
  assert.equal(saveDemoState(completed, loaded.raw, memory.access).ok, true)
  assert.equal(
    availableVacationDays(
      owner,
      loadDemoState(seed, memory.access).state.requests,
    ),
    13,
  )
  assert.equal(resetDemoState(seed, memory.access).ok, true)
  assert.equal(
    availableVacationDays(
      owner,
      loadDemoState(seed, memory.access).state.requests,
    ),
    18,
  )
})

test('legacy version-one saves preserve the opening balance and existing approvals', () => {
  const seed = fixture()
  const legacy = { ...seed, requests: [{ ...request(), status: 'approved' }] }
  const raw = encodeDemoState(legacy)
  const loaded = decodeDemoState(raw, seed)
  assert.equal(loaded.ok, true)
  assert.deepEqual(loaded.state, legacy)
  assert.equal(
    availableVacationDays(seed.employees[0], loaded.state.requests),
    18,
  )
  const newRequest = {
    ...request('JP-1060'),
    startDate: '2026-12-01',
    endDate: '2026-12-05',
  }
  const pending = workflowReducer(loaded.state, {
    type: 'create',
    session: employee,
    request: newRequest,
  })
  const approved = workflowReducer(pending, {
    type: 'review',
    session: manager,
    requestId: newRequest.id,
    decision: 'approved',
    comment: 'Новый отпуск',
    occurredAt: now,
    eventId: 'new-balance-approval',
  })
  assert.equal(availableVacationDays(seed.employees[0], approved.requests), 13)
  assert.deepEqual(
    approved.requests.find((item) => item.id === 'JP-1048'),
    legacy.requests[0],
  )
})

test('stored deductions must match vacation duration and belong to an approved or completed vacation', () => {
  const seed = fixture()
  for (const deductedVacationDays of [null, 0, -1, 2, 5.5, '5', 6]) {
    const state = {
      ...seed,
      requests: [{ ...request(), status: 'approved', deductedVacationDays }],
    }
    assert.equal(decodeDemoState(encodeDemoState(state), seed).ok, false)
  }
  for (const status of ['pending', 'rejected', 'cancelled']) {
    const state = {
      ...seed,
      requests: [{ ...request(), status, deductedVacationDays: 5 }],
    }
    assert.equal(decodeDemoState(encodeDemoState(state), seed).ok, false)
  }
  const advance = {
    ...seed,
    requests: [
      {
        ...request(),
        type: 'advance',
        amount: 30000,
        status: 'approved',
        deductedVacationDays: 5,
      },
    ],
  }
  assert.equal(decodeDemoState(encodeDemoState(advance), seed).ok, false)
})

test('first approval and blocked overlapping review survive reload without an extra notification or history event', () => {
  const seed = fixture()
  let state = { ...seed, requests: [{ ...request(), status: 'cancelled' }] }
  const original = structuredClone(state.requests[0])
  for (const id of ['JP-1060', 'JP-1061']) {
    state = workflowReducer(state, {
      type: 'create',
      session: employee,
      request: {
        ...request(id),
        ...(id === 'JP-1061' ? { sourceRequestId: 'JP-1048' } : {}),
      },
    })
  }
  const pending = structuredClone(
    state.requests.find((item) => item.id === 'JP-1061'),
  )
  const approved = workflowReducer(state, {
    type: 'review',
    session: manager,
    requestId: 'JP-1060',
    decision: 'approved',
    comment: 'Первый отпуск согласован',
    occurredAt: now,
    eventId: 'first-approval',
  })
  assert.equal(
    approved.requests.find((item) => item.id === 'JP-1060').status,
    'approved',
  )
  const memory = storage()
  assert.equal(saveDemoState(approved, null, memory.access).ok, true)
  const loaded = loadDemoState(seed, memory.access)
  assert.equal(loaded.blocked, false)
  assert.deepEqual(loaded.state, approved)
  const writes = memory.writes
  const blocked = workflowReducer(loaded.state, {
    type: 'review',
    session: manager,
    requestId: 'JP-1061',
    decision: 'approved',
    comment: 'Второй отпуск',
    occurredAt: now,
    eventId: 'second-approval',
  })
  assert.strictEqual(blocked, loaded.state)
  assert.deepEqual(
    blocked.requests.find((item) => item.id === 'JP-1061'),
    pending,
  )
  assert.deepEqual(
    blocked.requests.find((item) => item.id === 'JP-1048'),
    original,
  )
  assert.equal(
    blocked.notifications.filter((item) => item.title === 'Отпуск одобрен')
      .length,
    1,
  )
  assert.equal(saveDemoState(blocked, loaded.raw, memory.access).ok, true)
  assert.equal(memory.writes, writes)
  assert.deepEqual(loadDemoState(seed, memory.access).state, approved)
  const rejected = workflowReducer(blocked, {
    type: 'review',
    session: manager,
    requestId: 'JP-1061',
    decision: 'rejected',
    comment: 'Уже есть согласованный период',
    occurredAt: now,
    eventId: 'conflict-rejection',
  })
  assert.equal(
    rejected.requests.find((item) => item.id === 'JP-1061').status,
    'rejected',
  )
  assert.equal(saveDemoState(rejected, loaded.raw, memory.access).ok, true)
  assert.deepEqual(loadDemoState(seed, memory.access).state, rejected)
})

test('restored approvals block conflicting ordinary and repeated submissions without changing saved data', () => {
  const seed = fixture()
  let state = workflowReducer(seed, {
    type: 'review',
    session: manager,
    requestId: 'JP-1048',
    decision: 'approved',
    comment: 'Согласовано',
    occurredAt: now,
    eventId: 'overlap-approval',
  })
  const source = { ...request('JP-1060'), status: 'cancelled' }
  state = { ...state, requests: [...state.requests, source] }
  const memory = storage()
  assert.equal(saveDemoState(state, null, memory.access).ok, true)
  const restored = loadDemoState(seed, memory.access)
  assert.equal(restored.blocked, false)
  assert.deepEqual(restored.state, state)
  assert.deepEqual(
    approvedVacationConflicts(
      '2026-11-06',
      '2026-11-07',
      employee.userId,
      restored.state.requests,
    ).map((item) => item.id),
    ['JP-1048'],
  )
  const beforeWrites = memory.writes
  for (const sourceId of [undefined, source.id]) {
    const candidate = {
      ...request('JP-1061'),
      startDate: '2026-11-06',
      endDate: '2026-11-07',
      days: 2,
      ...(sourceId ? { sourceRequestId: sourceId } : {}),
    }
    const blocked = workflowReducer(restored.state, {
      type: 'create',
      session: employee,
      request: candidate,
    })
    assert.strictEqual(blocked, restored.state)
    assert.equal(nextDemoRequestId(blocked.requests), 'JP-1061')
    assert.equal(saveDemoState(blocked, restored.raw, memory.access).ok, true)
    assert.equal(memory.writes, beforeWrites)
  }
  const allowed = {
    ...request('JP-1061'),
    sourceRequestId: source.id,
    startDate: '2026-11-07',
    endDate: '2026-11-11',
  }
  const updated = workflowReducer(restored.state, {
    type: 'create',
    session: employee,
    request: allowed,
  })
  assert.equal(updated.requests[0].id, 'JP-1061')
  assert.equal(saveDemoState(updated, restored.raw, memory.access).ok, true)
  assert.deepEqual(loadDemoState(seed, memory.access).state, updated)
})

test('resubmitted vacations retain new dates, source, separate history and manager notice across reloads', () => {
  for (const status of ['rejected', 'cancelled']) {
    const seed = fixture()
    seed.requests[0].status = status
    const source = structuredClone(seed.requests[0])
    const repeated = {
      ...request('JP-1060'),
      sourceRequestId: source.id,
      startDate: '2026-12-14',
      endDate: '2026-12-18',
      comment: 'Другие даты',
      history: submissionHistory('JP-1060', now, now, 'Айдана'),
    }
    const action = { type: 'create', session: employee, request: repeated }
    const state = workflowReducer(seed, action)
    const memory = storage()
    assert.equal(saveDemoState(state, null, memory.access).ok, true)
    const loaded = loadDemoState(seed, memory.access)
    assert.equal(loaded.blocked, false)
    assert.deepEqual(loaded.state, state)
    assert.deepEqual(
      loaded.state.requests.find((item) => item.id === source.id),
      source,
    )
    assert.equal(loaded.state.requests[0].sourceRequestId, source.id)
    assert.equal(nextDemoRequestId(loaded.state.requests), 'JP-1061')
    const managerNotice = loaded.state.notifications.find(
      (item) => item.recipientId === manager.userId,
    )
    assert.equal(managerNotice.requestId, repeated.id)
    assert.equal(managerNotice.read, false)
    assert.strictEqual(workflowReducer(loaded.state, action), loaded.state)
    const read = workflowReducer(loaded.state, {
      type: 'read',
      session: manager,
      notificationId: managerNotice.id,
    })
    const reviewed = workflowReducer(read, {
      type: 'review',
      session: manager,
      requestId: repeated.id,
      decision: 'approved',
      comment: 'Новые даты согласованы',
      occurredAt: now,
      eventId: 'resubmit-decision',
    })
    assert.equal(saveDemoState(reviewed, loaded.raw, memory.access).ok, true)
    const restored = loadDemoState(seed, memory.access)
    assert.deepEqual(restored.state, reviewed)
    assert.deepEqual(
      restored.state.requests.find((item) => item.id === source.id),
      source,
    )
  }
})

test('stored source references must point to a terminal vacation of the same owner without cycles', () => {
  const seed = fixture()
  seed.requests[0].status = 'rejected'
  for (const sourceRequestId of ['missing', 'JP-1060', 42]) {
    const state = {
      ...seed,
      requests: [...seed.requests, { ...request('JP-1060'), sourceRequestId }],
    }
    assert.equal(decodeDemoState(encodeDemoState(state), seed).ok, false)
  }
  const cyclic = {
    ...seed,
    requests: [
      { ...request('JP-1048'), status: 'rejected', sourceRequestId: 'JP-1060' },
      {
        ...request('JP-1060'),
        status: 'cancelled',
        sourceRequestId: 'JP-1048',
      },
    ],
  }
  assert.equal(decodeDemoState(encodeDemoState(cyclic), seed).ok, false)
  const pendingSource = {
    ...seed,
    requests: [
      request(),
      { ...request('JP-1060'), sourceRequestId: 'JP-1048' },
    ],
  }
  assert.equal(decodeDemoState(encodeDemoState(pendingSource), seed).ok, false)
})

test('withdrawn vacation, history, manager notice and its read state survive reloads', () => {
  const seed = fixture()
  const action = {
    type: 'withdraw',
    session: employee,
    requestId: 'JP-1048',
    occurredAt: now,
    eventId: 'withdraw-persisted',
  }
  const withdrawn = workflowReducer(seed, action)
  const memory = storage()
  const saved = saveDemoState(withdrawn, null, memory.access)
  assert.equal(saved.ok, true)
  const loaded = loadDemoState(seed, memory.access)
  assert.equal(loaded.blocked, false)
  assert.deepEqual(loaded.state, withdrawn)
  assert.equal(loaded.state.requests[0].status, 'cancelled')
  assert.equal(loaded.state.requests[0].history.at(-1).id, action.eventId)
  const notification = loaded.state.notifications[0]
  assert.equal(notification.recipientId, manager.userId)
  assert.equal(notification.requestId, action.requestId)
  assert.equal(notification.read, false)
  assert.strictEqual(workflowReducer(loaded.state, action), loaded.state)
  assert.strictEqual(
    workflowReducer(loaded.state, {
      type: 'review',
      session: manager,
      requestId: action.requestId,
      decision: 'approved',
      comment: 'Согласовано',
      occurredAt: now,
      eventId: 'too-late',
    }),
    loaded.state,
  )
  const read = workflowReducer(loaded.state, {
    type: 'read',
    session: manager,
    notificationId: notification.id,
  })
  assert.equal(saveDemoState(read, loaded.raw, memory.access).ok, true)
  const reloaded = loadDemoState(seed, memory.access)
  assert.deepEqual(reloaded.state, read)
  assert.equal(reloaded.state.notifications[0].read, true)
  assert.equal(
    reloaded.state.requests[0].history.length,
    seed.requests[0].history.length + 1,
  )
  assert.equal(
    reloaded.state.notifications.length,
    seed.notifications.length + 1,
  )
  assert.deepEqual(reloaded.state.enrollments, seed.enrollments)
  assert.deepEqual(reloaded.state.profiles, seed.profiles)
})
function quiz(state, correct) {
  const course = state.courses.find((item) => item.id === 'onboarding')
  return course.quiz.questions.reduce(
    (current, question) =>
      workflowReducer(current, {
        type: 'quiz-answer',
        session: employee,
        courseId: course.id,
        questionId: question.id,
        optionId: correct
          ? question.correctOptionId
          : question.options.find(
              (option) => option.id !== question.correctOptionId,
            ).id,
      }),
    state,
  )
}

test('refresh round-trip retains new requests, decisions, history, contacts, reads and completed learning', () => {
  const seed = fixture()
  let state = workflowReducer(seed, {
    type: 'create',
    session: employee,
    request: request(nextDemoRequestId(seed.requests)),
  })
  state = workflowReducer(state, {
    type: 'review',
    session: manager,
    requestId: 'JP-1060',
    decision: 'approved',
    comment: 'Согласовано',
    occurredAt: now,
    eventId: 'review-1',
  })
  state = workflowReducer(state, {
    type: 'profile-contacts-save',
    session: employee,
    employeeId: employee.userId,
    contacts: { email: 'saved@example.com', phone: '8 (701) 123-45-67' },
  })
  state = quiz(materialState(state), true)
  state = workflowReducer(state, {
    type: 'quiz-submit',
    session: employee,
    courseId: 'onboarding',
    attemptId: 'attempt-1',
    submittedAt: now,
  })
  state = workflowReducer(state, {
    type: 'read',
    session: employee,
    notificationId: 'course-assigned',
  })
  const memory = storage()
  const saved = saveDemoState(state, null, memory.access)
  assert.equal(saved.ok, true)
  const loaded = loadDemoState(seed, memory.access)
  assert.equal(loaded.blocked, false)
  assert.deepEqual(loaded.state, state)
  assert.equal(nextDemoRequestId(loaded.state.requests), 'JP-1061')
  const course = loaded.state.courses.find((item) => item.id === 'onboarding')
  const enrollment = loaded.state.enrollments.find(
    (item) => item.courseId === course.id,
  )
  assert.equal(courseProgress(course, enrollment), 100)
  const reSubmit = workflowReducer(loaded.state, {
    type: 'quiz-submit',
    session: employee,
    courseId: course.id,
    attemptId: 'attempt-2',
    submittedAt: now,
  })
  assert.strictEqual(reSubmit, loaded.state)
  assert.equal(
    loaded.state.notifications.filter((item) =>
      item.id.startsWith('course-completed'),
    ).length,
    1,
  )
})

test('rejection requires a reason and preserves the employee notification and read state across reloads', () => {
  const seed = fixture()
  const review = {
    type: 'review',
    session: manager,
    requestId: 'JP-1048',
    decision: 'rejected',
    occurredAt: now,
    eventId: 'rejection-persisted',
  }
  for (const comment of ['', '   ']) {
    assert.strictEqual(workflowReducer(seed, { ...review, comment }), seed)
  }
  const reason = 'В выбранные даты нужна смена. Предложите другой период.'
  const rejected = workflowReducer(seed, { ...review, comment: reason })
  const memory = storage()
  assert.equal(saveDemoState(rejected, null, memory.access).ok, true)
  const loaded = loadDemoState(seed, memory.access)
  assert.equal(loaded.blocked, false)
  const vacation = loaded.state.requests.find(
    (item) => item.id === review.requestId,
  )
  assert.equal(vacation.status, 'rejected')
  assert.equal(vacation.history.length, seed.requests[0].history.length + 1)
  assert.equal(vacation.history.at(-1).description, reason)
  const notifications = loaded.state.notifications.filter(
    (item) => item.requestId === review.requestId,
  )
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].recipientId, employee.userId)
  assert.equal(notifications[0].read, false)
  assert.ok(notifications[0].description.includes(reason))
  const read = workflowReducer(loaded.state, {
    type: 'read',
    session: employee,
    notificationId: notifications[0].id,
  })
  assert.equal(saveDemoState(read, loaded.raw, memory.access).ok, true)
  const reloaded = loadDemoState(seed, memory.access).state
  assert.equal(
    reloaded.notifications.find((item) => item.id === notifications[0].id).read,
    true,
  )
  assert.strictEqual(
    workflowReducer(reloaded, {
      ...review,
      eventId: 'repeat',
      decision: 'approved',
      comment: 'Повторное решение',
    }),
    reloaded,
  )
})

test('partial quiz answers and failed attempts with retry are restored without granting completion', () => {
  const seed = fixture()
  let state = materialState(seed)
  const course = state.courses.find((item) => item.id === 'onboarding')
  state = workflowReducer(state, {
    type: 'quiz-answer',
    session: employee,
    courseId: course.id,
    questionId: course.quiz.questions[0].id,
    optionId: course.quiz.questions[0].correctOptionId,
  })
  assert.deepEqual(decodeDemoState(encodeDemoState(state), seed).state, state)
  state = quiz(state, false)
  state = workflowReducer(state, {
    type: 'quiz-submit',
    session: employee,
    courseId: course.id,
    attemptId: 'failed-1',
    submittedAt: now,
  })
  assert.deepEqual(decodeDemoState(encodeDemoState(state), seed).state, state)
  state = workflowReducer(state, {
    type: 'quiz-retry',
    session: employee,
    courseId: course.id,
  })
  assert.deepEqual(decodeDemoState(encodeDemoState(state), seed).state, state)
  assert.equal(state.enrollments[0].completedAt, undefined)
})

test('only contacts are restored from profiles; identities, HR data and course materials stay in code', () => {
  const seed = fixture()
  const raw = JSON.parse(encodeDemoState(seed))
  assert.equal(raw.data.employees, undefined)
  assert.equal(raw.data.courses, undefined)
  raw.data.employees = [{ id: 'forged', name: 'FORGED' }]
  raw.data.courses = []
  raw.data.contacts[0].birthDate = '1900-01-01'
  raw.data.contacts[0].employeeNumber = 'FORGED'
  raw.data.contacts[0].email = 'new@example.com'
  const loaded = decodeDemoState(JSON.stringify(raw), seed)
  assert.equal(loaded.ok, true)
  assert.strictEqual(loaded.state.employees, seed.employees)
  assert.strictEqual(loaded.state.courses, seed.courses)
  assert.equal(loaded.state.profiles[0].birthDate, seed.profiles[0].birthDate)
  assert.equal(
    loaded.state.profiles[0].employeeNumber,
    seed.profiles[0].employeeNumber,
  )
  assert.equal(loaded.state.profiles[0].contacts.email, 'new@example.com')
})

test('corrupt or incompatible saves fall back without overwriting the original storage entry', () => {
  const seed = fixture()
  for (const raw of [
    '{broken',
    'null',
    '[]',
    JSON.stringify({ version: 999, data: {} }),
    'x'.repeat(2_000_001),
  ]) {
    const memory = storage()
    memory.values.set(demoStorageKey, raw)
    const result = loadDemoState(seed, memory.access)
    assert.equal(result.blocked, true)
    assert.strictEqual(result.state, seed)
    assert.equal(memory.values.get(demoStorageKey), raw)
    assert.equal(memory.writes, 0)
  }
})

test('malformed domain data, dates, IDs, assignments, grades and contacts are rejected', () => {
  const seed = fixture()
  for (const mutate of [
    (data) => {
      data.requests = {}
    },
    (data) => {
      data.requests = []
    },
    (data) => {
      data.requests.push(data.requests[0])
    },
    (data) => {
      data.requests[0].createdAt = '2026-02-30'
    },
    (data) => {
      data.requests[0].days = 999
    },
    (data) => {
      data.requests[0].history[0].occurredAt = 'invalid'
    },
    (data) => {
      data.notifications[0].read = 'yes'
    },
    (data) => {
      data.notifications[0].recipientId = 'unknown'
    },
    (data) => {
      data.enrollments[0].completedLessonIds.push('unknown')
    },
    (data) => {
      data.enrollments[0].answers = { unknown: 'unknown' }
    },
    (data) => {
      data.enrollments[0].completedAt = now
    },
    (data) => {
      data.enrollments[0].quizView = 'result'
    },
    (data) => {
      data.enrollments[0].employeeId = manager.userId
    },
    (data) => {
      data.contacts[0].phone = '123'
    },
    (data) => {
      data.contacts[0].email = 'invalid'
    },
    (data) => {
      data.contacts[1] = data.contacts[0]
    },
  ]) {
    const saved = JSON.parse(encodeDemoState(seed))
    mutate(saved.data)
    assert.equal(
      decodeDemoState(JSON.stringify(saved), seed).ok,
      false,
      mutate.toString(),
    )
  }
  let completed = quiz(materialState(seed), true)
  completed = workflowReducer(completed, {
    type: 'quiz-submit',
    session: employee,
    courseId: 'onboarding',
    attemptId: 'done',
    submittedAt: now,
  })
  const raw = JSON.parse(encodeDemoState(completed))
  raw.data.enrollments[0].attempts[0].score = 1
  assert.equal(decodeDemoState(JSON.stringify(raw), seed).ok, false)
})

test('storage denial and write failure do not crash or destroy the previous save', () => {
  const seed = fixture()
  const inaccessible = () => {
    throw new Error('SecurityError')
  }
  assert.equal(loadDemoState(seed, inaccessible).status, 'unavailable')
  assert.equal(saveDemoState(seed, null, inaccessible).ok, false)
  const old = encodeDemoState(seed)
  const full = () => ({
    getItem: () => old,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  })
  assert.equal(
    saveDemoState({ ...seed, notifications: [] }, old, full).ok,
    false,
  )
  assert.equal(resetDemoState(seed, full).ok, false)
})

test('unchanged state skips writes; stale tabs cannot overwrite a newer snapshot', () => {
  const seed = fixture()
  const memory = storage()
  const saved = saveDemoState(seed, null, memory.access)
  assert.equal(saved.ok, true)
  assert.equal(saveDemoState(seed, saved.raw, memory.access).ok, true)
  assert.equal(memory.writes, 1)
  const newer = encodeDemoState({ ...seed, notifications: [] })
  memory.values.set(demoStorageKey, newer)
  assert.deepEqual(saveDemoState(seed, saved.raw, memory.access), {
    ok: false,
    issue: 'conflict',
  })
  assert.equal(memory.values.get(demoStorageKey), newer)
})

test('explicit reset restores this app only, including after a malformed save', () => {
  const seed = fixture()
  const memory = storage()
  memory.values.set('another-app', 'keep')
  memory.values.set(demoStorageKey, '{broken')
  assert.equal(resetDemoState(seed, memory.access).ok, true)
  assert.deepEqual(loadDemoState(seed, memory.access).state, seed)
  assert.equal(memory.values.get('another-app'), 'keep')
})
