import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Workspace from './App'
import { api, ApiError } from './api/client'
import type { ServerSnapshot } from './api/client'
import './styles/auth.css'

export default function ConnectedApp() {
  const [data, setData] = useState<ServerSnapshot | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const version = useRef(0)
  const mounted = useRef(true)
  const blocked = useRef(false)
  const refresh = useCallback(async () => {
    const current = ++version.current
    setRefreshing(true)
    try {
      const next = await api<ServerSnapshot>('/workspace')
      if (mounted.current && current === version.current) {
        setData(next); setError(''); blocked.current = false
      }
      return true
    } catch (caught) {
      if (mounted.current && current === version.current) {
        if (caught instanceof ApiError && caught.status === 401) { setData(null); setError('') }
        else { setError((caught as Error).message); blocked.current = true }
      }
      return false
    } finally {
      if (mounted.current && current === version.current) { setChecking(false); setRefreshing(false) }
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => { mounted.current = false; ++version.current }
  }, [refresh])
  useEffect(() => {
    if (!data) return
    const focus = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(focus, 15000)
    window.addEventListener('focus', focus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [Boolean(data), refresh])
  async function mutate<T>(path: string, method: string, body: unknown, key?: string): Promise<T> {
    if (blocked.current) throw new Error('Сначала обновите данные с сервера.')
    let result: T
    try { result = await api<T>(path, method, body, key) } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 409)) await refresh()
      if (caught instanceof ApiError && (caught.status === 0 || caught.status >= 500)) setError(caught.message)
      throw caught
    }
    await refresh()
    return result
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST', {})
      ++version.current; setData(null); setError(''); setRefreshing(false); blocked.current = false
    } catch (caught) { setError((caught as Error).message) }
  }
  if (checking) return <main className="auth-page"><p role="status">Открываем кабинет…</p></main>
  if (!data) return <Login error={error} refreshing={refreshing} refresh={refresh} />
  return <Workspace key={data.session.userId} remote={{ data, error, refreshing, refresh, mutate, logout }} />
}

function Login({ error: connectionError, refreshing, refresh }: { error: string; refreshing: boolean; refresh: () => Promise<boolean> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const guard = useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true; setBusy(true); setError('')
    try { await api('/auth/login', 'POST', { email, password }); setPassword(''); await refresh() }
    catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'INVALID_CREDENTIALS'
        ? 'Неверный email или пароль. Проверьте раскладку клавиатуры и лишние пробелы.'
        : (caught as Error).message)
    }
    finally { guard.current = false; setBusy(false) }
  }
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <a className="brand auth-brand" href="#login"><span className="brand-mark">J</span><span className="brand-name">jana<span>мен</span><small>ПРОСТРАНСТВО СОТРУДНИКА</small></span></a>
        <span className="eyebrow">РАБОТАЕМ ВМЕСТЕ</span>
        <h1>Ваш рабочий день.<br />Всё под рукой.</h1>
        <p>Заявки, решения и важные события — в вашем личном кабинете.</p>
        <span className="auth-decoration" aria-hidden="true">✳</span>
      </section>
      <section className="auth-card" aria-labelledby="login" >
        <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</span>
        <h2 id="login">Вход в кабинет</h2>
        <p>Войдите под своей учётной записью.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" autoComplete="username" disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} maxLength={254} required /></label>
          <div className="auth-password-group">
            <label htmlFor="login-password">Пароль</label>
            <span className="auth-password-field">
              <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} maxLength={128} aria-describedby={password !== password.trim() ? 'password-spaces-hint' : undefined} required />
              <button type="button" className="auth-password-toggle" disabled={busy} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? 'Скрыть' : 'Показать'}</button>
            </span>
          </div>
          {password !== password.trim() && <p id="password-spaces-hint" className="auth-input-hint" role="status">В начале или конце пароля есть пробел. Проверьте его перед входом.</p>}
          {(error || connectionError) && <p className="form-error" role="alert">{error || connectionError}</p>}
          <button type="submit" className="primary-button full-width" disabled={busy || refreshing}>{busy ? 'Входим…' : 'Войти'}</button>
          {connectionError && <button type="button" className="withdraw-secondary" disabled={refreshing} onClick={() => void refresh()}>Проверить подключение</button>}
        </form>
        {import.meta.env.DEV && (
          <section className="auth-test-accounts" aria-labelledby="test-accounts-title">
            <h3 id="test-accounts-title">Тестовые аккаунты</h3>
            <p>Выберите аккаунт — email и пароль заполнятся. Затем нажмите «Войти».</p>
            <div className="auth-test-account-list">
              {[
                { email: 'employee@janamen.local', label: 'Сотрудник — Айдана' },
                { email: 'manager@janamen.local', label: 'Руководитель — Данияр' },
                { email: 'hr@janamen.local', label: 'HR — Мадина' },
              ].map((account) => (
                <button key={account.email} type="button" disabled={busy || refreshing} onClick={() => { setEmail(account.email); setPassword('JanaLocal2026!'); setShowPassword(false); setError('') }}>{account.label}</button>
              ))}
            </div>
          </section>
        )}
        <p className="auth-note">Демонстрационный стенд · используются вымышленные сотрудники.</p>
      </section>
    </main>
  )
}
