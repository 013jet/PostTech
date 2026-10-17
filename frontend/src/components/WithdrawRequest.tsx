import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export function WithdrawRequest({
  requestId,
  onWithdraw,
}: {
  requestId: string
  onWithdraw: () => Promise<string | null>
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useLayoutEffect(() => {
    if (confirming) heading.current?.focus()
    else if (wasConfirming.current) trigger.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  return (
    <section
      className={`withdraw-request ${confirming ? 'withdraw-confirmation' : ''}`}
      aria-labelledby={titleId}
    >
      <div>
        <h3 id={titleId} ref={heading} tabIndex={-1}>
          {confirming ? `Отозвать заявку ${requestId}?` : 'Планы изменились?'}
        </h3>
        <p>
          {confirming
            ? 'Заявка перестанет ожидать согласования. В истории появится запись об отзыве, а руководитель получит уведомление. Для другого периода потребуется новая заявка.'
            : 'До решения руководителя вы можете отозвать заявку на отпуск.'}
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="withdraw-actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="withdraw-secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(false)
                setError('')
              }}
            >
              Оставить заявку
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={async () => {
                if (sending.current) return
                sending.current = true; setBusy(true)
                try { setError(await onWithdraw() || '') }
                catch { setError('Не удалось отозвать заявку. Повторите попытку.') }
                finally { sending.current = false; setBusy(false) }
              }}
            >
              <Icon name="close" size={17} />
              {busy ? 'Отзываем…' : 'Подтвердить отзыв'}
            </button>
          </>
        ) : (
          <button
            ref={trigger}
            type="button"
            className="withdraw-secondary"
            onClick={() => setConfirming(true)}
          >
            Отозвать заявку
          </button>
        )}
      </div>
    </section>
  )
}
