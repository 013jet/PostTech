import test from 'node:test'
import assert from 'node:assert/strict'
import { validateContacts, formatPhone } from './profile.ts'
import { workflowReducer } from './workflow.ts'
import { initialProfiles } from '../mocks/profiles.ts'
import { answerQuestion } from './assistant.ts'

const employee = { role: 'employee', userId: 'employee-aidana' }
const manager = { role: 'manager', userId: 'manager-daniyar' }
const contacts = {
  email: '  Aidana.New@EXAMPLE.COM  ',
  phone: '8 (701) 123-45-67',
}
function fixture() {
  return {
    employees: [{ id: employee.userId }, { id: manager.userId }],
    profiles: structuredClone(initialProfiles),
    requests: [],
    courses: [],
    enrollments: [],
    notifications: [],
  }
}
function save(session = employee, overrides = {}) {
  return {
    type: 'profile-contacts-save',
    session,
    employeeId: session.userId,
    contacts,
    ...overrides,
  }
}

test('email is trimmed, domain normalized, and common phone formats normalize to +7', () => {
  for (const phone of [
    '+7 (701) 123-45-67',
    '8 (701) 123-45-67',
    '77011234567',
    '+77011234567',
  ]) {
    assert.deepEqual(validateContacts({ ...contacts, phone }), {
      valid: true,
      contacts: { email: 'Aidana.New@example.com', phone: '+77011234567' },
    })
  }
  assert.equal(formatPhone('+77011234567'), '+7 (701) 123-45-67')
})

test('missing fields and malformed email addresses have field-specific errors', () => {
  const empty = validateContacts({ email: '  ', phone: '' })
  assert.equal(empty.valid, false)
  assert.ok(empty.errors.email)
  assert.ok(empty.errors.phone)
  for (const email of [
    'no-at-sign',
    'a@',
    '@example.com',
    '.a@example.com',
    'a..b@example.com',
    'a@localhost',
    'a@-example.com',
    'a@example..com',
    'a@exa mple.com',
    'a@example.com@other.com',
    'a'.repeat(65) + '@example.com',
    'a@' + 'b'.repeat(64) + '.com',
    'a@' + 'b.'.repeat(130) + 'com',
  ]) {
    const result = validateContacts({ ...contacts, email })
    assert.equal(result.valid, false, email)
    assert.ok(result.errors.email)
    assert.equal(result.errors.phone, undefined)
  }
})

test('phones reject foreign prefixes, wrong length, multiple pluses, letters and extensions', () => {
  for (const phone of [
    '123',
    '+1 (201) 555-01-01',
    '+87011234567',
    '+7abc7011234567',
    '++77011234567',
    '+770112345678',
    '7011234567',
    '+77011234567 доб. 5',
    '7'.repeat(41),
  ]) {
    const result = validateContacts({ email: 'test@example.com', phone })
    assert.equal(result.valid, false, phone)
    assert.ok(result.errors.phone)
    assert.equal(result.errors.email, undefined)
  }
})

test('saving contacts updates only the owner and keeps personal and HR fields intact', () => {
  const state = fixture()
  const before = structuredClone(state)
  const next = workflowReducer(
    state,
    save(employee, {
      contacts: {
        ...contacts,
        employeeId: manager.userId,
        birthDate: '2000-01-01',
        employeeNumber: 'FORGED',
        workEmail: 'fake@example.com',
        position: 'CEO',
      },
    }),
  )
  assert.deepEqual(next.profiles[0], {
    ...before.profiles[0],
    contacts: { email: 'Aidana.New@example.com', phone: '+77011234567' },
  })
  assert.deepEqual(next.profiles[1], before.profiles[1])
  assert.deepEqual(next.employees, before.employees)
  assert.deepEqual(state, before)
  assert.deepEqual(Object.keys(next.profiles[0].contacts).sort(), [
    'email',
    'phone',
  ])
})

test('invalid contacts, another person, absent profile and unknown user cannot be saved', () => {
  const state = fixture()
  for (const action of [
    save(employee, { employeeId: manager.userId }),
    save(manager, { employeeId: employee.userId }),
    save(employee, { contacts: { email: 'invalid', phone: contacts.phone } }),
    save(employee, { contacts: { email: 'test@example.com', phone: '123' } }),
    save({ role: 'employee', userId: 'unknown' }),
  ])
    assert.strictEqual(workflowReducer(state, action), state)
  const absent = { ...state, profiles: [] }
  assert.strictEqual(workflowReducer(absent, save()), absent)
})

test('contact edits survive navigation actions and remain separate between demo identities', () => {
  const state = workflowReducer(fixture(), save())
  const next = workflowReducer(
    state,
    save(manager, {
      contacts: { email: 'manager.new@example.com', phone: '+77011234568' },
    }),
  )
  const afterRead = workflowReducer(next, { type: 'read', session: employee })
  assert.equal(afterRead.profiles[0].contacts.email, 'Aidana.New@example.com')
  assert.equal(afterRead.profiles[1].contacts.email, 'manager.new@example.com')
})

test('assistant explains contact editing, while requests for HR phone numbers remain unsupported', () => {
  assert.deepEqual(
    answerQuestion('Как изменить телефон в профиле?').sourceIds,
    ['profile'],
  )
  assert.deepEqual(answerQuestion('Как изменить личный email?').sourceIds, [
    'profile',
  ])
  assert.equal(answerQuestion('Какой телефон HR?').kind, 'refusal')
})
