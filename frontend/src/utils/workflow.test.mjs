import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canViewRequest,
  canReviewRequest,
  canWithdrawRequest,
  canResubmitRequest,
  workflowReducer,
} from './workflow.ts'
import {
  approvedVacationConflicts,
  availableVacationDays,
  formatCalendarDays,
  calendarDays,
  vacationConflictMessage,
  vacationBalanceMessage,
  validateVacationDates,
} from './requests.ts'

const employeeSession = { role: 'employee', userId: 'aidana' }
const managerSession = { role: 'manager', userId: 'daniyar' }

test('HR reads only company requests and cannot perform employee or manager actions', () => {
  const session = { role: 'hr', userId: 'hr' }
  const people = [{ id: 'hr', company: 'Jana Post' }, { id: 'aidana', company: 'Jana Post' }, { id: 'outside', company: 'Other' }]
  const ownCompanyRequest = request('JP-HR', 'aidana')
  assert.equal(canViewRequest(session, ownCompanyRequest, people), true)
  assert.equal(canViewRequest(session, request('JP-OUT', 'outside'), people), false)
  assert.equal(canViewRequest(session, ownCompanyRequest, people.filter((person) => person.id !== 'hr')), false)
  assert.equal(canReviewRequest(session, ownCompanyRequest, people), false)
  assert.equal(canWithdrawRequest(session, ownCompanyRequest, people), false)
  assert.equal(canResubmitRequest(session, { ...ownCompanyRequest, status: 'rejected' }, people), false)
})
function request(id, employeeId, overrides = {}) {
  return {
    id,
    employeeId,
    type: 'vacation',
    title: 'Отпуск',
    description: '5 дней',
    createdAt: '2026-10-15',
    status: 'pending',
    comment: '',
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    days: 5,
    history: [
      {
        id: `${id}-submitted`,
        title: 'Отправлена',
        actor: 'Айдана',
        role: 'Сотрудник',
        occurredAt: '2026-10-15T09:00:00+05:00',
        status: 'pending',
      },
    ],
    ...overrides,
  }
}
function fixture() {
  return {
    courses: [],
    enrollments: [],
    employees: [
      { id: 'aidana', name: 'Айдана', managerId: 'daniyar', vacationDays: 18 },
      { id: 'timur', name: 'Тимур', managerId: 'daniyar', vacationDays: 14 },
      {
        id: 'daniyar',
        name: 'Данияр',
        managerId: 'director',
        vacationDays: 24,
      },
      {
        id: 'outsider',
        name: 'Руслан',
        managerId: 'other-manager',
        vacationDays: 18,
      },
    ],
    requests: [
      request('own', 'aidana'),
      request('teammate', 'timur'),
      request('outside', 'outsider'),
      request('self', 'daniyar'),
      request('advance', 'timur', { type: 'advance', amount: 30000 }),
      request('already', 'aidana', {
        status: 'approved',
        startDate: '2026-12-21',
        endDate: '2026-12-25',
      }),
    ],
    notifications: [
      {
        id: 'n-employee',
        recipientId: 'aidana',
        title: 'Ранее',
        description: '',
        time: '',
        read: false,
      },
      {
        id: 'n-manager',
        recipientId: 'daniyar',
        title: 'Ранее',
        description: '',
        time: '',
        read: false,
      },
      {
        id: 'n-outside',
        recipientId: 'outsider',
        title: 'Ранее',
        description: '',
        time: '',
        read: false,
      },
    ],
  }
}
function review(overrides = {}) {
  return {
    type: 'review',
    session: managerSession,
    requestId: 'own',
    decision: 'approved',
    comment: '  Задачи переданы, даты согласованы.  ',
    occurredAt: '2026-10-16T11:00:00+05:00',
    eventId: 'decision-1',
    ...overrides,
  }
}

function withdraw(overrides = {}) {
  return {
    type: 'withdraw',
    session: employeeSession,
    requestId: 'own',
    occurredAt: '2026-10-16T11:00:00+05:00',
    eventId: 'withdraw-1',
    ...overrides,
  }
}

test('balance labels use correct day forms including zero and small remaining balances', () => {
  for (const [days, text] of [
    [0, '0 календарных дней'],
    [1, '1 календарный день'],
    [2, '2 календарных дня'],
    [4, '4 календарных дня'],
    [5, '5 календарных дней'],
    [11, '11 календарных дней'],
    [14, '14 календарных дней'],
    [21, '21 календарный день'],
  ])
    assert.equal(formatCalendarDays(days), text)
})

test('opening balances keep legacy approvals and consume only new approved or completed vacations of the owner', () => {
  const state = fixture()
  const owner = state.employees[0]
  state.requests.push(
    request('old-completed', owner.id, { status: 'completed' }),
  )
  assert.equal(availableVacationDays(owner, state.requests), 18)
  state.requests.push(
    request('charged', owner.id, {
      status: 'approved',
      deductedVacationDays: 5,
    }),
  )
  assert.equal(availableVacationDays(owner, state.requests), 13)
  state.requests.find((item) => item.id === 'charged').status = 'completed'
  assert.equal(availableVacationDays(owner, state.requests), 13)
  state.requests.push(
    request('foreign-charged', 'timur', {
      status: 'approved',
      deductedVacationDays: 5,
    }),
  )
  assert.equal(availableVacationDays(owner, state.requests), 13)
  assert.equal(availableVacationDays(state.employees[1], state.requests), 9)
  assert.equal(
    availableVacationDays({ ...owner, vacationDays: 2 }, state.requests),
    0,
  )
})

test('approval deducts days exactly once; rejection, withdrawal and pending requests do not reserve them', () => {
  const state = fixture()
  const owner = state.employees[0]
  const approved = workflowReducer(state, review())
  assert.equal(approved.requests[0].deductedVacationDays, 5)
  assert.equal(availableVacationDays(owner, approved.requests), 13)
  assert.equal(availableVacationDays(owner, state.requests), 18)
  assert.strictEqual(workflowReducer(approved, review()), approved)
  assert.equal(
    availableVacationDays(
      owner,
      workflowReducer(state, review({ decision: 'rejected' })).requests,
    ),
    18,
  )
  assert.equal(
    availableVacationDays(owner, workflowReducer(state, withdraw()).requests),
    18,
  )
  const teammateApproved = workflowReducer(
    approved,
    review({ requestId: 'teammate', eventId: 'team-decision' }),
  )
  assert.equal(availableVacationDays(owner, teammateApproved.requests), 13)
  assert.equal(
    availableVacationDays(state.employees[1], teammateApproved.requests),
    9,
  )
})

test('ordinary and repeated submissions use the updated balance and permit exactly the available days', () => {
  for (const sourceStatus of [null, 'rejected', 'cancelled']) {
    let state = fixture()
    state = workflowReducer(state, review())
    if (sourceStatus)
      state.requests.push(request('source', 'aidana', { status: sourceStatus }))
    const fields = sourceStatus ? { sourceRequestId: 'source' } : {}
    const excessive = request('new-number', 'aidana', {
      ...fields,
      startDate: '2027-01-01',
      endDate: '2027-01-14',
      days: 14,
    })
    assert.strictEqual(
      workflowReducer(state, {
        type: 'create',
        session: employeeSession,
        request: excessive,
      }),
      state,
    )
    const exact = { ...excessive, endDate: '2027-01-13', days: 13 }
    const result = workflowReducer(state, {
      type: 'create',
      session: employeeSession,
      request: exact,
    })
    assert.equal(result.requests[0].id, exact.id)
    assert.equal(availableVacationDays(state.employees[0], result.requests), 13)
    assert.equal(result.requests[0].deductedVacationDays, undefined)
    assert.equal(result.notifications.length, state.notifications.length + 2)
    assert.strictEqual(
      workflowReducer(state, {
        type: 'create',
        session: employeeSession,
        request: { ...exact, deductedVacationDays: 13 },
      }),
      state,
    )
  }
})

test('approval rechecks the latest balance across non-overlapping pending requests and blocks overspending', () => {
  const state = fixture()
  state.employees[0].vacationDays = 6
  state.requests.push(
    request('second', 'aidana', {
      startDate: '2026-11-09',
      endDate: '2026-11-13',
    }),
  )
  const pending = structuredClone(
    state.requests.find((item) => item.id === 'second'),
  )
  const first = workflowReducer(state, review())
  assert.equal(availableVacationDays(state.employees[0], first.requests), 1)
  const blocked = workflowReducer(
    first,
    review({ requestId: 'second', eventId: 'too-many-days' }),
  )
  assert.strictEqual(blocked, first)
  assert.deepEqual(
    blocked.requests.find((item) => item.id === 'second'),
    pending,
  )
  const rejected = workflowReducer(
    blocked,
    review({
      requestId: 'second',
      decision: 'rejected',
      eventId: 'reject-too-many-days',
    }),
  )
  assert.equal(
    rejected.requests.find((item) => item.id === 'second').status,
    'rejected',
  )
  assert.equal(availableVacationDays(state.employees[0], rejected.requests), 1)
})

test('the exact balance can be approved; zero days blocks new submissions and further approvals', () => {
  const state = fixture()
  state.employees[0].vacationDays = 5
  state.requests.push(
    request('second', 'aidana', {
      startDate: '2026-11-09',
      endDate: '2026-11-13',
    }),
  )
  const approved = workflowReducer(state, review())
  assert.equal(availableVacationDays(state.employees[0], approved.requests), 0)
  assert.strictEqual(
    workflowReducer(
      approved,
      review({ requestId: 'second', eventId: 'after-zero' }),
    ),
    approved,
  )
  assert.strictEqual(
    workflowReducer(approved, {
      type: 'create',
      session: employeeSession,
      request: request('one-day', 'aidana', {
        startDate: '2027-01-01',
        endDate: '2027-01-01',
        days: 1,
      }),
    }),
    approved,
  )
  assert.match(vacationBalanceMessage(0, 0), /Доступных дней отпуска нет/)
  assert.match(
    vacationBalanceMessage(5, 1, 'approval'),
    /запрошено 5, доступно 1/,
  )
  assert.equal(
    validateVacationDates('2027-01-01', '2027-01-13', 13, '2026-10-16'),
    null,
  )
  assert.ok(validateVacationDates('2027-01-01', '2027-01-14', 13, '2026-10-16'))
})

test('approved vacation overlap includes shared boundary days and all containment cases', () => {
  const approved = request('approved', 'aidana', { status: 'approved' })
  for (const [start, end] of [
    ['2026-11-02', '2026-11-06'],
    ['2026-11-03', '2026-11-04'],
    ['2026-11-01', '2026-11-07'],
    ['2026-11-01', '2026-11-02'],
    ['2026-11-06', '2026-11-07'],
    ['2026-11-02', '2026-11-02'],
    ['2026-11-06', '2026-11-06'],
  ])
    assert.deepEqual(
      approvedVacationConflicts(start, end, 'aidana', [approved]).map(
        (item) => item.id,
      ),
      ['approved'],
      `${start} — ${end}`,
    )
  for (const [start, end] of [
    ['2026-10-29', '2026-11-01'],
    ['2026-11-07', '2026-11-12'],
    ['', '2026-11-06'],
    ['2026-11-02', ''],
    ['2026-11-07', '2026-11-02'],
    ['2026-02-30', '2026-11-06'],
  ])
    assert.deepEqual(
      approvedVacationConflicts(start, end, 'aidana', [approved]),
      [],
    )
  const leap = request('leap', 'aidana', {
    status: 'approved',
    startDate: '2028-02-29',
    endDate: '2028-02-29',
    days: 1,
  })
  assert.equal(
    approvedVacationConflicts('2028-02-29', '2028-03-01', 'aidana', [leap])
      .length,
    1,
  )
})

test('overlap considers only the owner approved vacations and lists all conflicts in date order', () => {
  const records = [
    request('later', 'aidana', {
      status: 'approved',
      startDate: '2026-11-05',
      endDate: '2026-11-06',
    }),
    request('earlier', 'aidana', { status: 'approved' }),
    request('foreign', 'timur', { status: 'approved' }),
    request('advance', 'aidana', {
      type: 'advance',
      status: 'approved',
      amount: 30000,
    }),
    ...['pending', 'rejected', 'cancelled', 'completed'].map((status) =>
      request(status, 'aidana', { status }),
    ),
  ]
  const original = structuredClone(records)
  const conflicts = approvedVacationConflicts(
    '2026-11-01',
    '2026-11-08',
    'aidana',
    records,
  )
  assert.deepEqual(
    conflicts.map((item) => item.id),
    ['earlier', 'later'],
  )
  const message = vacationConflictMessage(conflicts)
  assert.match(message, /earlier \(2 ноября 2026 г\. — 6 ноября 2026 г\.\)/)
  assert.match(message, /later/)
  assert.match(message, /Выберите другой период/)
  assert.doesNotMatch(message, /foreign|advance|pending/)
  assert.equal(vacationConflictMessage([]), null)
  assert.deepEqual(records, original)
})

test('both ordinary and resubmitted vacations are blocked without side effects when overlapping approval', () => {
  for (const sourceStatus of [null, 'rejected', 'cancelled']) {
    const state = fixture()
    Object.assign(
      state.requests.find((item) => item.id === 'already'),
      { startDate: '2026-11-02', endDate: '2026-11-06' },
    )
    if (sourceStatus) state.requests[0].status = sourceStatus
    const before = structuredClone(state)
    for (const [startDate, endDate] of [
      ['2026-11-02', '2026-11-06'],
      ['2026-11-01', '2026-11-02'],
      ['2026-11-06', '2026-11-07'],
      ['2026-11-03', '2026-11-03'],
    ]) {
      const candidate = request('new-number', 'aidana', {
        startDate,
        endDate,
        days: calendarDays(startDate, endDate),
        ...(sourceStatus ? { sourceRequestId: 'own' } : {}),
      })
      assert.strictEqual(
        workflowReducer(state, {
          type: 'create',
          session: employeeSession,
          request: candidate,
        }),
        state,
      )
    }
    assert.deepEqual(state, before)
    const adjacent = request('new-number', 'aidana', {
      startDate: '2026-11-07',
      endDate: '2026-11-11',
      ...(sourceStatus ? { sourceRequestId: 'own' } : {}),
    })
    const result = workflowReducer(state, {
      type: 'create',
      session: employeeSession,
      request: adjacent,
    })
    assert.equal(result.requests.length, state.requests.length + 1)
    assert.equal(result.notifications.length, state.notifications.length + 2)
  }
})

test('pending and declined vacations, approved advances and other employee vacations do not block submission', () => {
  const state = fixture()
  state.requests = state.requests.filter((item) => item.id !== 'already')
  state.requests.push(
    request('foreign-approved', 'timur', { status: 'approved' }),
    request('own-advance', 'aidana', {
      type: 'advance',
      amount: 30000,
      status: 'approved',
    }),
  )
  for (const status of ['rejected', 'cancelled', 'completed'])
    state.requests.push(request(status, 'aidana', { status }))
  const result = workflowReducer(state, {
    type: 'create',
    session: employeeSession,
    request: request('new-number', 'aidana'),
  })
  assert.equal(result.requests[0].id, 'new-number')
})

test('resubmission is available only for the owner of a rejected or withdrawn vacation', () => {
  const state = fixture()
  for (const status of ['rejected', 'cancelled']) {
    const source = request('source', 'aidana', { status })
    assert.equal(
      canResubmitRequest(employeeSession, source, state.employees),
      true,
    )
    assert.equal(
      canResubmitRequest(managerSession, source, state.employees),
      false,
    )
    assert.equal(
      canResubmitRequest(
        employeeSession,
        { ...source, employeeId: 'timur' },
        state.employees,
      ),
      false,
    )
    assert.equal(
      canResubmitRequest(
        employeeSession,
        { ...source, type: 'advance' },
        state.employees,
      ),
      false,
    )
  }
  for (const status of ['pending', 'approved', 'completed'])
    assert.equal(
      canResubmitRequest(
        employeeSession,
        request('source', 'aidana', { status }),
        state.employees,
      ),
      false,
    )
})

test('resubmission creates a separate pending request and scoped notifications while retaining the original', () => {
  for (const status of ['rejected', 'cancelled']) {
    const before = fixture()
    before.requests[0].status = status
    const original = structuredClone(before.requests[0])
    const newRequest = request('new-number', 'aidana', {
      sourceRequestId: 'own',
      startDate: '2026-12-14',
      endDate: '2026-12-18',
      comment: 'Исправлены даты',
    })
    const action = {
      type: 'create',
      session: employeeSession,
      request: newRequest,
    }
    const result = workflowReducer(before, action)
    assert.equal(result.requests.length, before.requests.length + 1)
    assert.equal(result.requests[0].id, 'new-number')
    assert.equal(result.requests[0].sourceRequestId, 'own')
    assert.equal(result.requests[0].status, 'pending')
    assert.equal(result.requests[0].startDate, '2026-12-14')
    assert.equal(result.requests[0].comment, 'Исправлены даты')
    assert.deepEqual(
      result.requests.find((item) => item.id === 'own'),
      original,
    )
    assert.deepEqual(
      result.notifications
        .slice(0, 2)
        .map((item) => [item.recipientId, item.requestId]),
      [
        ['aidana', 'new-number'],
        ['daniyar', 'new-number'],
      ],
    )
    assert.equal(result.notifications[1].read, false)
    assert.match(result.notifications[1].description, /own/)
    assert.equal(
      canReviewRequest(managerSession, result.requests[0], result.employees),
      true,
    )
    assert.strictEqual(workflowReducer(result, action), result)
  }
})

test('resubmission rejects invalid sources, altered ownership, invalid dates, duration and comment', () => {
  const before = fixture()
  before.requests[0].status = 'rejected'
  const newRequest = request('resubmit', 'aidana', { sourceRequestId: 'own' })
  const action = {
    type: 'create',
    session: employeeSession,
    request: newRequest,
  }
  for (const changes of [
    { sourceRequestId: 'missing' },
    { sourceRequestId: 'teammate' },
    { sourceRequestId: 'already' },
    { sourceRequestId: 'advance' },
    { employeeId: 'timur' },
    { id: 'own' },
    { status: 'approved' },
    { startDate: '' },
    { startDate: '2026-02-30' },
    { startDate: '2026-11-07' },
    { startDate: '2026-10-14', endDate: '2026-10-15', days: 2 },
    { endDate: '2026-12-30' },
    { days: 6 },
    { comment: 'x'.repeat(501) },
  ])
    assert.strictEqual(
      workflowReducer(before, {
        ...action,
        request: { ...newRequest, ...changes },
      }),
      before,
    )
  assert.strictEqual(
    workflowReducer(before, { ...action, session: managerSession }),
    before,
  )
  before.requests[0].status = 'pending'
  assert.strictEqual(workflowReducer(before, action), before)
})

test('vacation date validation rejects rollover, missing, past, reversed and excessive dates', () => {
  for (const [start, end] of [
    ['', '2026-11-06'],
    ['2026-11-02', ''],
    ['2026-02-30', '2026-03-02'],
    ['2026-10-15', '2026-10-16'],
    ['2026-11-06', '2026-11-02'],
    ['2026-11-02', '2026-11-20'],
  ])
    assert.ok(validateVacationDates(start, end, 18, '2026-10-16'))
  assert.equal(
    validateVacationDates('2026-11-02', '2026-11-02', 18, '2026-10-16'),
    null,
  )
  assert.equal(
    validateVacationDates('2026-11-02', '2026-11-19', 18, '2026-10-16'),
    null,
  )
})

test('only the applicant in employee mode can withdraw a pending vacation', () => {
  const state = fixture()
  const own = state.requests[0]
  assert.equal(canWithdrawRequest(employeeSession, own, state.employees), true)
  for (const status of ['approved', 'rejected', 'completed', 'cancelled']) {
    const changed = { ...state, requests: [{ ...own, status }] }
    assert.equal(
      canWithdrawRequest(employeeSession, changed.requests[0], state.employees),
      false,
    )
    assert.strictEqual(workflowReducer(changed, withdraw()), changed)
  }
  for (const action of [
    withdraw({ session: managerSession }),
    withdraw({ session: { role: 'employee', userId: 'missing' } }),
    withdraw({ requestId: 'teammate' }),
    withdraw({ requestId: 'outside' }),
    withdraw({ requestId: 'missing' }),
    withdraw({ occurredAt: 'invalid' }),
  ])
    assert.strictEqual(workflowReducer(state, action), state)
  const advance = {
    ...state,
    requests: [request('own', 'aidana', { type: 'advance', amount: 30000 })],
  }
  assert.strictEqual(workflowReducer(advance, withdraw()), advance)
  assert.equal(
    canWithdrawRequest(employeeSession, advance.requests[0], state.employees),
    false,
  )
})

test('withdrawal atomically records applicant history and one linked notice only for the manager', () => {
  const before = fixture()
  const original = structuredClone(before)
  const result = workflowReducer(before, withdraw())
  const updated = result.requests.find((item) => item.id === 'own')
  assert.equal(updated.status, 'cancelled')
  assert.deepEqual(updated.history.at(-1), {
    id: 'withdraw-1',
    title: 'Заявка отозвана',
    actor: 'Айдана',
    role: 'Сотрудник',
    occurredAt: '2026-10-16T11:00:00+05:00',
    description: 'Сотрудник отозвал отпуск до решения руководителя.',
    status: 'cancelled',
  })
  assert.equal(updated.history.length, before.requests[0].history.length + 1)
  assert.equal(result.notifications.length, before.notifications.length + 1)
  assert.equal(result.notifications[0].recipientId, 'daniyar')
  assert.equal(result.notifications[0].requestId, 'own')
  assert.equal(result.notifications[0].read, false)
  assert.match(result.notifications[0].description, /Айдана/)
  assert.deepEqual(result.requests.slice(1), before.requests.slice(1))
  assert.deepEqual(result.notifications.slice(1), before.notifications)
  assert.deepEqual(before, original)
  assert.equal(
    canReviewRequest(managerSession, updated, result.employees),
    false,
  )
})

test('withdrawal and review are terminal: repeated or competing actions cannot replace the first result', () => {
  const before = fixture()
  const withdrawn = workflowReducer(before, withdraw())
  assert.strictEqual(
    workflowReducer(withdrawn, withdraw({ eventId: 'duplicate' })),
    withdrawn,
  )
  assert.strictEqual(workflowReducer(withdrawn, review()), withdrawn)
  for (const decision of ['approved', 'rejected']) {
    const reviewed = workflowReducer(before, review({ decision }))
    assert.strictEqual(workflowReducer(reviewed, withdraw()), reviewed)
  }
})

test('employee sees only own records; manager sees direct reports, excluding self and other teams', () => {
  const state = fixture()
  assert.deepEqual(
    state.requests
      .filter((item) => canViewRequest(employeeSession, item, state.employees))
      .map((item) => item.id),
    ['own', 'already'],
  )
  assert.deepEqual(
    state.requests
      .filter((item) => canViewRequest(managerSession, item, state.employees))
      .map((item) => item.id),
    ['own', 'teammate', 'advance', 'already'],
  )
  assert.equal(
    canViewRequest(
      managerSession,
      request('unknown', 'missing'),
      state.employees,
    ),
    false,
  )
})

test('two pending vacations can approve only the first decision, in either order', () => {
  for (const [firstId, secondId] of [
    ['own', 'second'],
    ['second', 'own'],
  ]) {
    const before = fixture()
    before.requests.push(request('second', 'aidana'))
    const first = workflowReducer(before, review({ requestId: firstId }))
    assert.equal(
      first.requests.find((item) => item.id === firstId).status,
      'approved',
    )
    const pending = structuredClone(
      first.requests.find((item) => item.id === secondId),
    )
    const second = workflowReducer(
      first,
      review({ requestId: secondId, eventId: 'second-decision' }),
    )
    assert.strictEqual(second, first)
    assert.deepEqual(
      second.requests.find((item) => item.id === secondId),
      pending,
    )
    assert.equal(second.notifications.length, before.notifications.length + 1)
    assert.equal(second.notifications[0].requestId, firstId)
  }
})

test('approval blocks overlapping ordinary and repeated vacations, including shared end dates', () => {
  for (const sourceRequestId of [undefined, 'source']) {
    for (const [startDate, endDate] of [
      ['2026-11-02', '2026-11-06'],
      ['2026-11-03', '2026-11-04'],
      ['2026-11-01', '2026-11-07'],
      ['2026-11-01', '2026-11-02'],
      ['2026-11-06', '2026-11-07'],
    ]) {
      const state = fixture()
      state.requests.push(
        request('blocking', 'aidana', { status: 'approved' }),
        request('source', 'aidana', { status: 'cancelled' }),
      )
      Object.assign(state.requests[0], {
        startDate,
        endDate,
        days: calendarDays(startDate, endDate),
        ...(sourceRequestId ? { sourceRequestId } : {}),
      })
      const before = structuredClone(state)
      assert.strictEqual(workflowReducer(state, review()), state)
      assert.deepEqual(state, before)
      const conflictText = vacationConflictMessage(
        approvedVacationConflicts(startDate, endDate, 'aidana', state.requests),
        'approval',
      )
      assert.match(conflictText, /Нельзя одобрить отпуск/)
      assert.match(conflictText, /blocking/)
      assert.match(conflictText, /Можно отклонить заявку с комментарием/)
    }
  }
})

test('conflict blocks approval while rejection remains available with a required comment', () => {
  const state = fixture()
  state.requests.push(request('blocking', 'aidana', { status: 'approved' }))
  assert.strictEqual(workflowReducer(state, review()), state)
  assert.strictEqual(
    workflowReducer(state, review({ decision: 'rejected', comment: '   ' })),
    state,
  )
  const rejected = workflowReducer(
    state,
    review({
      decision: 'rejected',
      comment: 'Даты уже согласованы по другой заявке.',
    }),
  )
  assert.equal(rejected.requests[0].status, 'rejected')
  assert.equal(
    rejected.requests[0].history.at(-1).description,
    'Даты уже согласованы по другой заявке.',
  )
  assert.equal(rejected.notifications[0].recipientId, 'aidana')
  assert.equal(rejected.notifications.length, state.notifications.length + 1)
})

test('approval allows adjacent periods and the same dates for other employees; pending records do not block it', () => {
  for (const overrides of [
    { startDate: '2026-11-07', endDate: '2026-11-11' },
    { startDate: '2026-10-28', endDate: '2026-11-01' },
    { employeeId: 'timur' },
  ]) {
    const state = fixture()
    state.requests.push(request('blocking', 'aidana', { status: 'approved' }))
    Object.assign(state.requests[0], overrides)
    const result = workflowReducer(state, review())
    assert.equal(result.requests[0].status, 'approved')
  }
  const state = fixture()
  state.requests.push(request('other-pending', 'aidana'))
  assert.equal(workflowReducer(state, review()).requests[0].status, 'approved')
})

test('approval atomically records the decision and comment, and notifies only its applicant', () => {
  const before = fixture()
  const result = workflowReducer(before, review())
  const updated = result.requests.find((item) => item.id === 'own')
  assert.equal(updated.status, 'approved')
  assert.deepEqual(updated.history.at(-1), {
    id: 'decision-1',
    title: 'Отпуск одобрен',
    actor: 'Данияр',
    role: 'Руководитель',
    occurredAt: '2026-10-16T11:00:00+05:00',
    description: 'Задачи переданы, даты согласованы.',
    status: 'approved',
  })
  assert.equal(result.notifications[0].recipientId, 'aidana')
  assert.equal(result.notifications[0].requestId, 'own')
  assert.match(
    result.notifications[0].description,
    /Задачи переданы, даты согласованы\./,
  )
  assert.equal(result.notifications.length, before.notifications.length + 1)
  assert.equal(before.requests[0].status, 'pending')
  assert.equal(before.requests[0].history.length, 1)
  assert.strictEqual(result.requests[1], before.requests[1])
})

test('rejection preserves a reason in history and a notification addressed to the team member', () => {
  const result = workflowReducer(
    fixture(),
    review({
      requestId: 'teammate',
      decision: 'rejected',
      comment: 'Выберите другие даты.',
    }),
  )
  assert.equal(
    result.requests.find((item) => item.id === 'teammate').status,
    'rejected',
  )
  assert.equal(
    result.requests.find((item) => item.id === 'teammate').history.at(-1)
      .description,
    'Выберите другие даты.',
  )
  assert.equal(result.notifications[0].recipientId, 'timur')
  assert.match(result.notifications[0].description, /Выберите другие даты/)
})

test('repeat submissions cannot add a second decision or duplicate notification', () => {
  const decided = workflowReducer(fixture(), review())
  assert.strictEqual(
    workflowReducer(
      decided,
      review({ decision: 'rejected', eventId: 'decision-2' }),
    ),
    decided,
  )
})

test('review rejects invalid actors, scope, type, status, blank/long comments and invalid timestamps', () => {
  const state = fixture()
  for (const command of [
    { session: employeeSession },
    { session: { role: 'employee', userId: 'daniyar' } },
    { requestId: 'outside' },
    { requestId: 'self' },
    { requestId: 'advance' },
    { requestId: 'already' },
    { requestId: 'missing' },
    { comment: '   ' },
    { comment: 'a'.repeat(501) },
    { occurredAt: 'invalid' },
  ])
    assert.strictEqual(workflowReducer(state, review(command)), state)
  assert.equal(
    canReviewRequest(
      managerSession,
      state.requests.find((item) => item.id === 'advance'),
      state.employees,
    ),
    false,
  )
})

test('new employee request notifies its author and assigned manager, without duplicating on retry', () => {
  const state = fixture()
  const action = {
    type: 'create',
    session: employeeSession,
    request: request('new', 'aidana', {
      startDate: '2026-12-01',
      endDate: '2026-12-05',
    }),
  }
  const created = workflowReducer(state, action)
  assert.equal(created.requests[0].id, 'new')
  assert.deepEqual(
    created.notifications.slice(0, 2).map((item) => item.recipientId),
    ['aidana', 'daniyar'],
  )
  assert.strictEqual(workflowReducer(created, action), created)
  assert.strictEqual(
    workflowReducer(state, { ...action, request: request('forged', 'timur') }),
    state,
  )
  assert.strictEqual(
    workflowReducer(state, { ...action, session: managerSession }),
    state,
  )
})

test('marking notifications read affects only the signed-in demo identity', () => {
  const state = fixture()
  const result = workflowReducer(state, {
    type: 'read',
    session: managerSession,
  })
  assert.equal(
    result.notifications.find((item) => item.id === 'n-manager').read,
    true,
  )
  assert.equal(
    result.notifications.find((item) => item.id === 'n-employee').read,
    false,
  )
  assert.equal(
    result.notifications.find((item) => item.id === 'n-outside').read,
    false,
  )
  const single = workflowReducer(state, {
    type: 'read',
    session: employeeSession,
    notificationId: 'n-outside',
  })
  assert.equal(
    single.notifications.find((item) => item.id === 'n-outside').read,
    false,
  )
  assert.equal(
    state.notifications.find((item) => item.id === 'n-manager').read,
    false,
  )
})
