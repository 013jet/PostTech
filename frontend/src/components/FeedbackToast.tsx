import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export function FeedbackToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!message || paused) return
    const timer = window.setTimeout(onDismiss, 7000)
    return () => window.clearTimeout(timer)
  }, [message, paused, onDismiss])
  if (!message) return null
  return (
    <div className="feedback-toast" role="status" aria-live="polite" aria-atomic="true"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}>
      <span className="feedback-toast-icon"><Icon name="bell" size={20} /></span>
      <p>{message}</p>
      <button className="icon-button" type="button" aria-label="Скрыть сообщение" onClick={onDismiss}><Icon name="close" size={18} /></button>
    </div>
  )
}
