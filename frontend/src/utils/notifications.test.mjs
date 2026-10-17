import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationFeed, notificationTarget } from './notifications.ts'
import { workflowReducer } from './workflow.ts'

const employee = { role: 'employee', userId: 'aidana' }
const manager = { role: 'manager', userId: 'daniyar' }
function notification(id, recipientId, overrides = {}) {
  return {
    id,
    recipientId,
    title: 'Тестовое событие',
    description: '',
    time: 'Сегодня',
    read: false,
    ...overrides,
  }
}
function fixture() {
  return {
    employees: [
      { id: 'aidana', managerId: 'daniyar' },
      { id: 'timur', managerId: 'daniyar' },
      { id: 'outsider', managerId: 'other-manager' },
      { id: 'daniyar', managerId: 'director' },
    ],
    requests: [
      { id: 'own', employeeId: 'aidana' },
      { id: 'team', employeeId: 'timur' },
      { id: 'outside', employeeId: 'outsider' },
      { id: 'self', employeeId: 'daniyar' },
    ],
    courses: [{ id: 'assigned' }, { id: 'not-assigned' }],
    enrollments: [{ employeeId: 'aidana', courseId: 'assigned' }],
    notifications: [
      notification('course', 'aidana', { courseId: 'assigned' }),
      notification('request', 'aidana', { requestId: 'own' }),
      notification('read', 'aidana', { read: true }),
      notification('team', 'daniyar', { requestId: 'team' }),
      notification('outside', 'outsider'),
    ],
  }
}

test('feed shows only the current recipient and preserves newest-first event order', () => {
  const state = fixture()
  const before = structuredClone(state.notifications)
  assert.deepEqual(
    notificationFeed(state.notifications, employee).map((item) => item.id),
    ['course', 'request', 'read'],
  )
  assert.deepEqual(
    notificationFeed(state.notifications, employee, 'unread').map(
      (item) => item.id,
    ),
    ['course', 'request'],
  )
  assert.deepEqual(
    notificationFeed(state.notifications, manager, 'unread').map(
      (item) => item.id,
    ),
    ['team'],
  )
  assert.deepEqual(notificationFeed([], employee), [])
  assert.deepEqual(
    notificationFeed(state.notifications, {
      role: 'employee',
      userId: 'nobody',
    }),
    [],
  )
  assert.deepEqual(state.notifications, before)
})

test('individual read immediately updates the unread feed and keeps other notifications intact', () => {
  const state = fixture()
  const updated = workflowReducer(state, {
    type: 'read',
    session: employee,
    notificationId: 'course',
  })
  assert.deepEqual(
    notificationFeed(updated.notifications, employee, 'unread').map(
      (item) => item.id,
    ),
    ['request'],
  )
  assert.equal(notificationFeed(updated.notifications, employee).length, 3)
  assert.equal(
    updated.notifications.find((item) => item.id === 'team').read,
    false,
  )
  assert.equal(state.notifications[0].read, false)
  assert.deepEqual(
    workflowReducer(updated, {
      type: 'read',
      session: employee,
      notificationId: 'course',
    }).notifications,
    updated.notifications,
  )
})

test('read all empties only this recipient unread feed; events added later stay unread', () => {
  const state = fixture()
  const read = workflowReducer(state, { type: 'read', session: employee })
  assert.deepEqual(notificationFeed(read.notifications, employee, 'unread'), [])
  assert.equal(
    notificationFeed(read.notifications, manager, 'unread').length,
    1,
  )
  const next = workflowReducer(read, {
    type: 'notify',
    notification: notification('new', 'aidana'),
  })
  assert.deepEqual(
    notificationFeed(next.notifications, employee, 'unread').map(
      (item) => item.id,
    ),
    ['new'],
  )
  assert.equal(notificationFeed(next.notifications, employee).length, 4)
})

test('notification links require ownership, an existing target and request or course access', () => {
  const state = fixture()
  assert.deepEqual(
    notificationTarget(state.notifications[0], employee, state),
    { type: 'course', id: 'assigned' },
  )
  assert.deepEqual(
    notificationTarget(state.notifications[1], employee, state),
    { type: 'request', id: 'own' },
  )
  assert.deepEqual(notificationTarget(state.notifications[3], manager, state), {
    type: 'request',
    id: 'team',
  })
  assert.equal(notificationTarget(state.notifications[0], manager, state), null)
  for (const target of [
    {},
    { requestId: 'missing' },
    { requestId: 'team' },
    { requestId: 'outside' },
    { courseId: 'missing' },
    { courseId: 'not-assigned' },
    { requestId: 'own', courseId: 'assigned' },
  ])
    assert.equal(
      notificationTarget(
        notification('invalid', employee.userId, target),
        employee,
        state,
      ),
      null,
      JSON.stringify(target),
    )
  assert.equal(
    notificationTarget(
      notification('invalid', manager.userId, { requestId: 'outside' }),
      manager,
      state,
    ),
    null,
  )
  assert.equal(
    notificationTarget(
      notification('invalid', manager.userId, { requestId: 'self' }),
      manager,
      state,
    ),
    null,
  )
  assert.equal(
    notificationTarget(
      notification('invalid', manager.userId, { courseId: 'assigned' }),
      manager,
      state,
    ),
    null,
  )
})

test('links become unavailable when a linked request or enrollment disappears', () => {
  const state = fixture()
  assert.equal(
    notificationTarget(state.notifications[1], employee, {
      ...state,
      requests: [],
    }),
    null,
  )
  assert.equal(
    notificationTarget(state.notifications[0], employee, {
      ...state,
      enrollments: [],
    }),
    null,
  )
  assert.equal(
    notificationTarget(state.notifications[0], employee, {
      ...state,
      courses: [],
    }),
    null,
  )
})
