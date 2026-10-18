import { formatCalendarDays } from '../utils/requests'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type {
  DemoRole,
  Employee,
  EmployeeProfile,
  ProfileContacts,
} from '../types'
import type { ContactErrors } from '../utils/profile'
import { formatPhone, validateContacts } from '../utils/profile'
import { formatDate } from '../mocks/dashboard'
import { Icon } from '../components/Icon'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function ProfilePage({
  employee,
  profile,
  role,
  onSave,
}: {
  employee: Employee
  profile: EmployeeProfile
  role: DemoRole
  onSave: (contacts: ProfileContacts) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileContacts>({
    email: profile.contacts.email,
    phone: formatPhone(profile.contacts.phone),
  })
  const [errors, setErrors] = useState<ContactErrors>({})
  const [touched, setTouched] = useState<
    Partial<Record<keyof ProfileContacts, boolean>>
  >({})
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const [validationFocus, setValidationFocus] = useState<{
    field: keyof ProfileContacts
  } | null>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const phoneInput = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const contactCard = useRef<HTMLElement>(null)
  const editorOpened = useRef(false)
  const fieldId = useId()
  const dirty =
    draft.email !== profile.contacts.email ||
    draft.phone !== formatPhone(profile.contacts.phone)

  useLayoutEffect(() => {
    if (editing) emailInput.current?.focus()
    else if (editorOpened.current) {
      editButton.current?.focus({ preventScroll: true })
      contactCard.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
  }, [editing])

  useLayoutEffect(() => {
    if (!validationFocus) return
    const input =
      validationFocus.field === 'email'
        ? emailInput.current
        : phoneInput.current
    input?.focus({ preventScroll: true })
    input?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [validationFocus])

  function getErrors(values: ProfileContacts) {
    const result = validateContacts(values)
    return result.valid ? {} : result.errors
  }
  function change(field: keyof ProfileContacts, value: string) {
    const next = { ...draft, [field]: value }
    setDraft(next)
    setSaveError('')
    if (touched[field])
      setErrors((current) => ({ ...current, [field]: getErrors(next)[field] }))
  }
  function edit() {
    setDraft({
      email: profile.contacts.email,
      phone: formatPhone(profile.contacts.phone),
    })
    setErrors({})
    setTouched({})
    setSaveError('')
    setSaved(false)
    setValidationFocus(null)
    editorOpened.current = true
    setEditing(true)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || sending.current) return
    const result = validateContacts(draft)
    setTouched({ email: true, phone: true })
    if (!result.valid) {
      setErrors(result.errors)
      setValidationFocus({ field: result.errors.email ? 'email' : 'phone' })
      return
    }
    sending.current = true; setBusy(true)
    let message: string | null
    try { message = await onSave(result.contacts) }
    catch { message = 'Не удалось сохранить контакты. Повторите попытку.' }
    finally { sending.current = false; setBusy(false) }
    if (message) {
      setSaveError(message)
      return
    }
    setEditing(false)
    setSaved(true)
  }

  return (
    <div className="profile-page">
      <section className="profile-overview" aria-label="Карточка сотрудника">
        <div className="profile-overview-person">
          <span className="avatar profile-page-avatar">
            {employee.initials}
          </span>
          <div>
            <span className="eyebrow">JANA POST · КОМАНДА</span>
            <h2>{employee.name}</h2>
            <p>{employee.position}</p>
            <span className="profile-page-location">
              <Icon name="pin" size={14} />
              {employee.location}
            </span>
          </div>
        </div>
        <div className="profile-overview-meta">
          <span className="profile-role-tag">
            {role === 'hr' ? 'HR-администратор' : role === 'manager' ? 'Руководитель' : 'Сотрудник'}
          </span>
          <span>
            Табельный номер <strong>{profile.employeeNumber}</strong>
          </span>
          <small>В команде с {employee.hiredAt ? formatDate(employee.hiredAt) : '—'}</small>
        </div>
      </section>
      <div className="profile-detail-grid">
        <section
          className="panel profile-data-card"
          aria-labelledby={`${fieldId}-personal`}
        >
          <div className="profile-card-heading">
            <span className="profile-section-icon">
              <Icon name="user" size={19} />
            </span>
            <div>
              <h2 id={`${fieldId}-personal`}>Личные данные</h2>
              <p>Основная информация о вас</p>
            </div>
            <span className="profile-read-label">
              <Icon name="shield" size={12} />
              Просмотр
            </span>
          </div>
          <dl className="profile-detail-fields">
            <Detail label="ФИО">{employee.name}</Detail>
            <Detail label="Дата рождения">
              {formatDate(profile.birthDate)}
            </Detail>
            <Detail label="Город работы">{employee.location}</Detail>
            <Detail label="Язык общения">{profile.language}</Detail>
          </dl>
          <p className="profile-data-note">
            Чтобы исправить личные данные, обратитесь в HR через рабочий канал.
          </p>
        </section>
        <section
          ref={contactCard}
          className={`panel profile-data-card profile-contact-card ${editing ? 'is-editing' : ''}`}
          aria-labelledby={`${fieldId}-contacts`}
        >
          <div className="profile-card-heading">
            <span className="profile-section-icon peach">
              <Icon name="phone" size={19} />
            </span>
            <div>
              <h2 id={`${fieldId}-contacts`}>Контакты</h2>
              <p>Личный email и телефон</p>
            </div>
            {!editing && (
              <button
                className="profile-edit-button"
                ref={editButton}
                onClick={edit}
                aria-label="Редактировать контакты"
              >
                <Icon name="edit" size={14} />
                Изменить
              </button>
            )}
          </div>
          {saved && (
            <p className="profile-save-success" role="status">
              <Icon name="check" size={16} />
              Контакты обновлены.
            </p>
          )}
          {editing ? (
            <form
              className="profile-contact-form"
              onSubmit={submit}
              noValidate
              aria-label="Редактирование контактов"
              aria-busy={busy}
            >
              <p className="profile-form-description">
                Оба поля обязательны. Изменения применятся после сохранения.
              </p>
              <div className="profile-input-field">
                <label htmlFor={`${fieldId}-email`}>
                  Личный email <span>*</span>
                </label>
                <input
                  id={`${fieldId}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  disabled={busy}
                  ref={emailInput}
                  value={draft.email}
                  required
                  maxLength={254}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={`${fieldId}-email-hint${errors.email ? ` ${fieldId}-email-error` : ''}`}
                  onChange={(event) => change('email', event.target.value)}
                />
                <small id={`${fieldId}-email-hint`}>
                  Например, name@example.com
                </small>
                {errors.email && (
                  <p
                    className="profile-field-error"
                    id={`${fieldId}-email-error`}
                  >
                    {errors.email}
                  </p>
                )}
              </div>
              <div className="profile-input-field">
                <label htmlFor={`${fieldId}-phone`}>
                  Телефон <span>*</span>
                </label>
                <input
                  id={`${fieldId}-phone`}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  disabled={busy}
                  ref={phoneInput}
                  value={draft.phone}
                  required
                  maxLength={40}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={`${fieldId}-phone-hint${errors.phone ? ` ${fieldId}-phone-error` : ''}`}
                  onChange={(event) => change('phone', event.target.value)}
                />
                <small id={`${fieldId}-phone-hint`}>
                  +7 (700) 000-00-01 · также можно начать с 8
                </small>
                {errors.phone && (
                  <p
                    className="profile-field-error"
                    id={`${fieldId}-phone-error`}
                  >
                    {errors.phone}
                  </p>
                )}
              </div>
              {saveError && (
                <p className="profile-field-error" role="alert">
                  {saveError}
                </p>
              )}
              <div className="profile-form-actions">
                <button
                  type="button"
                  className="profile-cancel-button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false)
                    setDraft({
                      email: profile.contacts.email,
                      phone: formatPhone(profile.contacts.phone),
                    })
                  }}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!dirty || busy}
                >
                  <Icon name="check" size={16} />
                  {busy ? 'Сохраняем…' : 'Сохранить контакты'}
                </button>
              </div>
              <p className="profile-form-demo">
                Контакты сохраняются в вашем профиле на сервере.
              </p>
            </form>
          ) : (
            <dl className="profile-contact-values">
              <Detail label="Личный email">
                <Icon name="mail" size={16} />
                {profile.contacts.email}
              </Detail>
              <Detail label="Телефон">
                <Icon name="phone" size={16} />
                {formatPhone(profile.contacts.phone)}
              </Detail>
            </dl>
          )}
        </section>
        <section
          className="panel profile-data-card profile-employment-card"
          aria-labelledby={`${fieldId}-employment`}
        >
          <div className="profile-card-heading">
            <span className="profile-section-icon">
              <Icon name="file" size={19} />
            </span>
            <div>
              <h2 id={`${fieldId}-employment`}>Кадровые данные</h2>
              <p>Ваша роль и условия работы</p>
            </div>
            <span className="profile-read-label">
              <Icon name="shield" size={12} />
              Просмотр
            </span>
          </div>
          <dl className="profile-detail-fields">
            <Detail label="Компания">{employee.company}</Detail>
            <Detail label="Подразделение">{employee.department}</Detail>
            <Detail label="Должность">{employee.position}</Detail>
            <Detail label="Руководитель">{employee.manager}</Detail>
            <Detail label="Дата приёма">{employee.hiredAt ? formatDate(employee.hiredAt) : '—'}</Detail>
            <Detail label="Занятость">{profile.employmentType}</Detail>
            <Detail label="График работы">{profile.schedule}</Detail>
            <Detail label="Рабочий email">{profile.workEmail}</Detail>
            <Detail label="Остаток отпуска">
              {formatCalendarDays(employee.vacationDays)}
            </Detail>
          </dl>
          <p className="profile-data-note">
            <Icon name="shield" size={14} />
            Кадровые сведения доступны только для просмотра. Изменение этих
            данных в приложении пока не подключено.
          </p>
        </section>
      </div>
    </div>
  )
}
