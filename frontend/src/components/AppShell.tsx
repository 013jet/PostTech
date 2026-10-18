import type { DemoRole, Employee, Page } from '../types'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export const pageLabels: Record<Page, string> = {
  home: 'Главная',
  requests: 'Мои заявки',
  learning: 'Jana Academy',
  profile: 'Мой профиль',
  notifications: 'Уведомления',
  employees: 'Сотрудники',
}
export const roleLabels: Record<DemoRole, string> = { employee: 'Сотрудник', manager: 'Руководитель', hr: 'HR-администратор' }
export const requestPageLabel = (role: DemoRole) => role === 'hr' ? 'Обзор заявок' : role === 'manager' ? 'Заявки команды' : 'Мои заявки'
const navigation: { page: Page; icon: IconName }[] = [
  { page: 'home', icon: 'home' },
  { page: 'requests', icon: 'file' },
  { page: 'employees', icon: 'user' },
  { page: 'learning', icon: 'book' },
  { page: 'profile', icon: 'user' },
  { page: 'notifications', icon: 'bell' },
]

export function Sidebar({
  activePage,
  onNavigate,
  onAssistant,
  employee,
  pendingCount,
  unreadCount,
  role,
}: {
  activePage: Page
  onNavigate: (page: Page) => void
  onAssistant: () => void
  employee: Employee
  pendingCount: number
  unreadCount: number
  role: DemoRole
}) {
  return (
    <div className="sidebar-content">
      <a
        className="brand"
        href="#main"
        onClick={() => onNavigate(role === 'employee' ? 'home' : 'requests')}
        aria-label="JanaМен — на главную"
      >
        <span className="brand-mark">J</span>
        <span className="brand-name">
          jana<span>мен</span>
          <small>ПРОСТРАНСТВО СОТРУДНИКА</small>
        </span>
      </a>
      <div className="workspace-label">
        {role === 'hr' ? 'HR-АДМИНИСТРИРОВАНИЕ' : role === 'manager' ? 'УПРАВЛЕНИЕ КОМАНДОЙ' : 'МОЙ КАБИНЕТ'}
      </div>
      <nav className="main-nav" aria-label="Основная навигация">
        {navigation
          .filter(
            (item) =>
              (role === 'employee' && item.page !== 'employees') ||
              (role === 'hr' && item.page === 'employees') ||
              item.page === 'requests' ||
              item.page === 'profile' ||
              item.page === 'notifications',
          )
          .map(({ page, icon }) => (
            <button
              key={page}
              className={`nav-item ${activePage === page ? 'active' : ''}`}
              aria-current={activePage === page ? 'page' : undefined}
              onClick={() => onNavigate(page)}
            >
              <Icon name={icon} />
              <span>
                {page === 'requests'
                  ? requestPageLabel(role)
                  : pageLabels[page]}
              </span>
              {page === 'notifications' && unreadCount > 0 && (
                <span
                  className="nav-count"
                  aria-label={`${unreadCount} непрочитанных`}
                >
                  {unreadCount}
                </span>
              )}
              {page === 'requests' && pendingCount > 0 && (
                <span
                  className="nav-count"
                  aria-label={`${pendingCount} на согласовании`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
      </nav>
      <div className="sidebar-bottom">
        {role === 'employee' ? (
          <div className="sidebar-help">
            <span className="help-symbol">
              <Icon name="sparkle" size={23} />
            </span>
            <h3>HR рядом</h3>
            <p>
              Поможем найти ответ
              <br />
              на рабочий вопрос.
            </p>
            <button onClick={onAssistant}>
              Спросить AI Jana <Icon name="arrow" size={16} />
            </button>
          </div>
        ) : (
          <div className="sidebar-help manager-sidebar-help">
            <span className="help-symbol">
              <Icon name="shield" size={23} />
            </span>
            <h3>{role === 'hr' ? 'Кадровый обзор' : 'Ваша команда'}</h3>
            <p>{role === 'hr' ? 'Просматривайте сотрудников компании и историю заявок. Решения по отпуску принимает прямой руководитель.' : 'Рассматривайте отпуска и оставляйте комментарии к решениям.'}</p>
            <span className="manager-demo-label">{role === 'hr' ? 'Кабинет HR' : 'Кабинет руководителя'}</span>
          </div>
        )}
        <div className="sidebar-company">
          <span className="company-mark">J</span>
          <div>
            <strong>Jana Post</strong>
            <span>Вместе к результату</span>
          </div>
          <span className="online-dot" aria-label="Локальный кабинет" />
        </div>
      </div>
      <span className="sr-only">Профиль: {employee.name}</span>
    </div>
  )
}

export function Header({
  page,
  employee,
  unreadCount,
  onMenu,
  onNotifications,
  onProfile,
  role,
  onLogout,
}: {
  page: Page
  employee: Employee
  unreadCount: number
  onMenu: () => void
  onNotifications: () => void
  onProfile: () => void
  role: DemoRole
  onLogout: () => Promise<void>
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button mobile-menu"
          aria-label="Открыть меню"
          aria-haspopup="dialog"
          onClick={onMenu}
        >
          <Icon name="menu" />
        </button>
        <span className="breadcrumb-parent">
          {role === 'hr' ? 'Кабинет HR' : role === 'manager' ? 'Моя команда' : 'Личный кабинет'}
        </span>
        <Icon name="chevron" size={14} />
        <span className="breadcrumb-current">
          {page === 'requests'
            ? requestPageLabel(role)
            : pageLabels[page]}
        </span>
      </div>
      <div className="topbar-actions">
        <button className="logout-button" onClick={() => void onLogout()}>Выйти</button>
        <button
          className="icon-button notification-button"
          aria-label={`Уведомления, непрочитанных: ${unreadCount}`}
          aria-current={page === 'notifications' ? 'page' : undefined}
          onClick={onNotifications}
        >
          <Icon name="bell" size={21} />
          {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
        <span className="topbar-divider" />
        <button
          className="account-button"
          onClick={onProfile}
          aria-label="Открыть мой профиль"
        >
          <span className="avatar avatar-small">{employee.initials}</span>
          <span className="account-name">
            <strong>{employee.name}</strong>
            <small>{roleLabels[role]}</small>
          </span>
        </button>
      </div>
    </header>
  )
}
