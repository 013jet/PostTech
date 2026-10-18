import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  knowledgeArticles,
  knowledgeVersion,
  suggestedQuestions,
} from '../mocks/knowledge'
import { maxQuestionLength } from '../utils/assistant'
import type { ChatTurn } from '../utils/assistant'
import type { Page } from '../types'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function AssistantChat({
  turns,
  onSend,
  onReset,
  onClose,
  onNavigate,
}: {
  turns: ChatTurn[]
  onSend: (question: string) => void
  onReset: () => void
  onClose: () => void
  onNavigate: (page: Page) => void
}) {
  const [draft, setDraft] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const lastTurn = useRef<HTMLDivElement>(null)
  const focusResponse = useRef(false)
  const sourcePanel = useRef<HTMLElement>(null)
  const sourceHeading = useRef<HTMLHeadingElement>(null)
  const sourceTrigger = useRef<HTMLElement | null>(null)
  const hintId = useId()
  const source = knowledgeArticles.find((article) => article.id === sourceId)
  const tooLong = draft.length > maxQuestionLength

  useEffect(() => {
    const container = log.current
    const turn = lastTurn.current
    if (container && turn) container.scrollTo({
      top: container.scrollTop + turn.getBoundingClientRect().top - container.getBoundingClientRect().top - 16,
      behavior: 'instant',
    })
    else container?.scrollTo({ top: 0, behavior: 'instant' })
    if (focusResponse.current) {
      turn?.focus({ preventScroll: true })
      focusResponse.current = false
    }
  }, [turns.length])
  useLayoutEffect(() => {
    if (sourceId) {
      sourcePanel.current?.scrollTo({ top: 0, behavior: 'instant' })
      sourceHeading.current?.focus({ preventScroll: true })
    }
    else sourceTrigger.current?.focus({ preventScroll: true })
  }, [sourceId])

  function send(question: string, focusInput = true) {
    const value = question.trim()
    if (!value || value.length > maxQuestionLength) return
    focusResponse.current = !focusInput
    onSend(value)
    setDraft('')
    sourceTrigger.current = null
    setSourceId(null)
    if (focusInput) input.current?.focus({ preventScroll: true })
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(draft)
  }
  function closeSource() {
    setSourceId(null)
  }

  return (
    <Modal title="AI Jana" className="assistant-modal" onClose={onClose}>
      <div className="jana-chat-meta">
        <span className="jana-demo-badge">
          <span /> Тестовая база
        </span>
        <button
          className="jana-reset"
          disabled={!turns.length}
          onClick={() => {
            onReset()
            setDraft('')
            sourceTrigger.current = null
            setSourceId(null)
            input.current?.focus({ preventScroll: true })
          }}
        >
          Новый диалог
        </button>
      </div>
      <p className="jana-chat-disclaimer">
        Демо без AI-модели: ответы из {knowledgeArticles.length} статей о работе
        кабинета. Это не официальные HR-правила.
      </p>
      <div className={`jana-chat-layout ${source ? 'is-reading' : ''}`}>
        <div className="jana-chat-column">
          <div
            className="jana-chat-log"
            ref={log}
            role="log"
            aria-label="Переписка с AI Jana"
            aria-live="polite"
            aria-relevant="additions"
          >
            {!turns.length && (
              <div className="jana-welcome">
                <span className="assistant-symbol">
                  <Icon name="sparkle" size={26} />
                </span>
                <h3>Чем могу помочь?</h3>
                <p>
                  Найдём инструкцию по заявкам или обучению. Вместе с ответом
                  покажу источник, а если ответа нет — скажу об этом.
                </p>
                <div className="jana-suggestions">
                  {suggestedQuestions.map((question) => (
                    <button key={question} onClick={() => send(question, false)}>
                      {question}
                      <Icon name="arrow" size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, index) => (
              <div
                className="jana-turn"
                tabIndex={-1}
                key={turn.id}
                ref={index === turns.length - 1 ? lastTurn : undefined}
              >
                <div className="jana-user-message">
                  <span className="jana-speaker">Вы</span>
                  <p>{turn.question}</p>
                </div>
                <div className={`jana-answer ${turn.answer.kind}`}>
                  <span className="jana-speaker">
                    <Icon name="sparkle" size={15} /> AI Jana
                  </span>
                  {turn.answer.kind !== 'answer' && (
                    <span className="jana-answer-label">
                      {turn.answer.kind === 'refusal'
                        ? 'Нет ответа в базе'
                        : 'Нужно уточнение'}
                    </span>
                  )}
                  <p>{turn.answer.text}</p>
                  {turn.answer.sourceIds.length > 0 && (
                    <div className="jana-citations">
                      <span>Источник ответа</span>
                      {turn.answer.sourceIds.map((id) => {
                        const article = knowledgeArticles.find(
                          (item) => item.id === id,
                        )!
                        return (
                          <a
                            key={id}
                            href={`#kb-${id}`}
                            onClick={(event) => {
                              event.preventDefault()
                              sourceTrigger.current = event.currentTarget
                              setSourceId(id)
                            }}
                          >
                            <Icon name="book" size={15} />
                            {article.title}
                            <Icon name="arrow" size={14} />
                          </a>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="jana-composer" onSubmit={submit}>
            <label htmlFor={`${hintId}-question`}>Ваш вопрос</label>
            <div className={`jana-composer-field ${tooLong ? 'is-invalid' : ''}`}>
              <textarea
                ref={input}
                id={`${hintId}-question`}
                placeholder="Например: как оформить отпуск?"
                rows={2}
                maxLength={maxQuestionLength}
                value={draft}
                aria-invalid={tooLong}
                aria-describedby={`${hintId}${tooLong ? ` ${hintId}-error` : ''}`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    send(draft)
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Отправить вопрос"
                disabled={!draft.trim() || tooLong}
              >
                <Icon name="arrow" size={19} />
              </button>
            </div>
            <div className="jana-composer-hint" id={hintId}>
              <span>Enter — отправить · Shift + Enter — новая строка</span>
              <span>
                {draft.length}/{maxQuestionLength}
              </span>
            </div>
            {tooLong && <p id={`${hintId}-error`} className="form-error" role="alert">Сократите вопрос до {maxQuestionLength} символов.</p>}
            <p className="jana-session-note">
          Переписка хранится до обновления страницы или смены аккаунта.
            </p>
          </form>
        </div>
        <aside ref={sourcePanel} className="jana-knowledge" aria-label="Источники базы знаний">
          {source ? (
            <article id={`kb-${source.id}`} key={source.id}>
              <button className="jana-back" onClick={closeSource}>
                <Icon name="chevron" size={14} /> Вернуться к чату
              </button>
              <span className="jana-document-tag">ДЕМО-ИНСТРУКЦИЯ</span>
              <h3 ref={sourceHeading} tabIndex={-1}>
                {source.title}
              </h3>
              <p className="jana-document-meta">
                {source.category}
                <br />
                {source.section}
                <br />
                {knowledgeVersion}
              </p>
              <div className="jana-document-body">
                {source.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {source.page && (
                <button
                  className="jana-open-section"
                  onClick={() => onNavigate(source.page!)}
                >
                  Открыть{' '}
                  {source.page === 'requests'
                    ? '«Мои заявки»'
                    : source.page === 'learning'
                      ? 'Jana Academy'
                      : source.page === 'notifications'
                        ? '«Уведомления»'
                        : '«Мой профиль»'}
                  <Icon name="arrow" size={15} />
                </button>
              )}
              <p className="jana-document-note">
                Материал описывает вымышленный прототип. Для кадровых решений
                уточняйте правила в HR.
              </p>
            </article>
          ) : (
            <div className="jana-knowledge-index">
              <span className="jana-document-tag">ИСТОЧНИКИ</span>
              <h3>Всё можно проверить</h3>
              <p>
                Ответы берутся из этих демо-инструкций. Откройте статью, чтобы
                прочитать её полностью.
              </p>
              <nav aria-label="Статьи базы знаний">
                {knowledgeArticles.map((article, index) => (
                  <a
                    key={article.id}
                    href={`#kb-${article.id}`}
                    onClick={(event) => {
                      event.preventDefault()
                      sourceTrigger.current = event.currentTarget
                      setSourceId(article.id)
                    }}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {article.title}
                    <Icon name="chevron" size={13} />
                  </a>
                ))}
              </nav>
              <small>Обновлено {knowledgeVersion}</small>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  )
}
