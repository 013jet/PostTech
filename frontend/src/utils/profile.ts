import type { DemoSession, ProfileContacts } from '../types/index.ts'
import type { WorkflowState } from './workflow.ts'

export type ContactErrors = Partial<Record<keyof ProfileContacts, string>>
export type ContactValidation =
  | { valid: true; contacts: ProfileContacts }
  | { valid: false; errors: ContactErrors }
export type ProfileAction = {
  type: 'profile-contacts-save'
  session: DemoSession
  employeeId: string
  contacts: ProfileContacts
}

export function validateContacts(values: ProfileContacts): ContactValidation {
  const errors: ContactErrors = {}
  const email = typeof values.email === 'string' ? values.email.trim() : ''
  const phone = typeof values.phone === 'string' ? values.phone.trim() : ''
  const [local, domain, extra] = email.split('@')
  const validLocal =
    /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local ?? '') &&
    !local.startsWith('.') &&
    !local.endsWith('.') &&
    !local.includes('..')
  const validDomain =
    domain
      ?.split('.')
      .every((label) =>
        /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
      ) &&
    /^[a-zA-Z]{2,63}$/.test(domain?.split('.').at(-1) ?? '') &&
    domain.includes('.')
  if (!email) errors.email = 'Укажите личный email.'
  else if (
    email.length > 254 ||
    local.length > 64 ||
    extra !== undefined ||
    !validLocal ||
    !validDomain
  )
    errors.email = 'Введите email в формате name@example.com.'

  const digits = phone.replace(/\D/g, '')
  if (!phone) errors.phone = 'Укажите номер телефона.'
  else if (
    phone.length > 40 ||
    !/^\+?[\d\s()-]+$/.test(phone) ||
    digits.length !== 11 ||
    !/^[78]/.test(digits) ||
    (phone.startsWith('+') && digits[0] !== '7')
  )
    errors.phone = 'Введите 11 цифр: +7 (700) 000-00-01 или 8 (700) 000-00-01.'

  if (Object.keys(errors).length) return { valid: false, errors }
  return {
    valid: true,
    contacts: {
      email: `${local}@${domain.toLowerCase()}`,
      phone: `+7${digits.slice(1)}`,
    },
  }
}

export function formatPhone(phone: string) {
  return /^\+7\d{10}$/.test(phone)
    ? `+7 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8, 10)}-${phone.slice(10, 12)}`
    : phone
}

export function reduceProfile(
  state: WorkflowState,
  action: ProfileAction,
): WorkflowState {
  if (
    action.employeeId !== action.session.userId ||
    !state.employees.some((person) => person.id === action.session.userId) ||
    !state.profiles.some((profile) => profile.employeeId === action.employeeId)
  )
    return state
  const result = validateContacts(action.contacts)
  if (!result.valid) return state
  return {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.employeeId === action.employeeId
        ? { ...profile, contacts: result.contacts }
        : profile,
    ),
  }
}
