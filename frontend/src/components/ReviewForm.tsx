import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReviewDecision } from '../types'
import { Icon } from './Icon'
import { formatCalendarDays } from '../utils/requests'

export function ReviewForm({
  onReview,
  approvalBlockReason = null,
  availableDays,
  requestedDays,
}: {
  onReview: (decision: ReviewDecision, comment: string) => Promise<string | null>
  approvalBlockReason?: string | null
  availableDays: number
  requestedDays: number
}) {
  const [decision, setDecision] = useState<ReviewDecision | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const fieldId = useId()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    if (!decision) {
      setError('Выберите решение по отпуску.')
      return
    }
    if (decision === 'approved' && approvalBlockReason) return
    if (!comment.trim()) {
      setError('Добавьте комментарий к решению.')
      return
    }
    if (comment.trim().length > 500) {
      setError('Комментарий должен быть не длиннее 500 символов.')
      return
    }
    sending.current = true
    setBusy(true)
    try { setError(await onReview(decision, comment.trim()) || '') }
    catch { setError('Не удалось сохранить решение. Повторите попытку.') }
    finally { sending.current = false; setBusy(false) }
  }
  return (
    <form
      className="review-form"
      onSubmit={submit}
      noValidate
      aria-labelledby={`${fieldId}-title`}
    >
      <div className="review-form-heading">
        <span className="item-icon green">
          <Icon name="shield" />
        </span>
        <div>
          <h3 id={`${fieldId}-title`}>Ваше решение</h3>
          <p>Сотрудник получит уведомление с вашим комментарием.</p>
        </div>
      </div>
      <p className="review-balance">
        Доступно сотруднику:{' '}
        <strong>{formatCalendarDays(availableDays)}</strong>. По заявке:{' '}
        {formatCalendarDays(requestedDays)}.
      </p>
      {approvalBlockReason && (
        <p className="review-conflict" id={`${fieldId}-conflict`} role="alert">
          {approvalBlockReason}
        </p>
      )}
      <fieldset
        className="decision-options"
        disabled={busy}
        aria-describedby={
          approvalBlockReason ? `${fieldId}-conflict` : undefined
        }
      >
        <legend className="sr-only">Решение по отпуску</legend>
        <label
          className={`${decision === 'approved' ? 'decision-selected' : ''} ${approvalBlockReason ? 'decision-unavailable' : ''}`}
        >
          <input
            type="radio"
            name={`${fieldId}-decision`}
            checked={decision === 'approved'}
            disabled={Boolean(approvalBlockReason)}
            aria-describedby={
              approvalBlockReason ? `${fieldId}-conflict` : undefined
            }
            onChange={() => {
              setDecision('approved')
              setError('')
            }}
          />
          <Icon name="check" size={17} />
          Одобрить
        </label>
        <label
          className={`decision-reject ${decision === 'rejected' ? 'decision-selected' : ''}`}
        >
          <input
            type="radio"
            name={`${fieldId}-decision`}
            checked={decision === 'rejected'}
            onChange={() => {
              setDecision('rejected')
              setError('')
            }}
          />
          <Icon name="close" size={17} />
          Отклонить
        </label>
      </fieldset>
      <label className="review-comment-label" htmlFor={fieldId}>
        Комментарий к решению <span>обязательно</span>
      </label>
      <textarea
        disabled={busy}
        id={fieldId}
        className="review-comment"
        value={comment}
        onChange={(event) => {
          setComment(event.target.value)
          setError('')
        }}
        aria-required="true"
        aria-invalid={Boolean(error && !comment.trim())}
        aria-describedby={`${fieldId}-help${error ? ` ${fieldId}-error` : ''}`}
        maxLength={500}
        rows={3}
        placeholder="Объясните решение и дальнейшие шаги"
      />
      <div className="review-form-meta">
        <p id={`${fieldId}-help`}>
          Комментарий будет виден сотруднику и сохранится в истории.
        </p>
        <span>{comment.length}/500</span>
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="review-submit-row">
        <span>Решение можно принять один раз.</span>
        <button
          type="submit"
          disabled={busy || (Boolean(approvalBlockReason) && decision !== 'rejected')}
          className={`primary-button ${decision === 'rejected' ? 'danger-button' : ''}`}
        >
          <Icon name={decision === 'rejected' ? 'close' : 'check'} size={17} />
          {busy ? 'Сохраняем…' : decision === 'rejected'
            ? 'Отклонить отпуск'
            : decision === 'approved'
              ? 'Одобрить отпуск'
              : 'Сохранить решение'}
        </button>
      </div>
    </form>
  )
}
