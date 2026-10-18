import { useId, useRef, useState } from 'react'
import type { Employee, EmployeeRequest } from '../types'
import { availableVacationDays } from '../utils/requests'
import { formatDate } from '../mocks/dashboard'
import { Icon } from '../components/Icon'

export function EmployeesPage({ employees, requests }: { employees: Employee[]; requests: EmployeeRequest[] }) {
  const [search, setSearch] = useState('')
  const searchId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  function clearSearch() {
    setSearch('')
    searchRef.current?.focus()
  }
  const people = employees.filter((person) => `${person.name} ${person.department} ${person.position}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return <section className="panel hr-directory" aria-label="Сотрудники компании">
    <div className="hr-search">
      <label htmlFor={searchId}>Найти сотрудника</label>
      <div className="request-search-field">
        <Icon name="search" size={19} />
        <input id={searchId} ref={searchRef} type="search" aria-describedby={`${searchId}-hint`} placeholder="Например, Айдана" value={search} onChange={(event) => setSearch(event.target.value)} />
        {search && <button type="button" className="icon-button" aria-label="Очистить поиск сотрудников" onClick={clearSearch}><Icon name="close" size={17} /></button>}
      </div>
      <p id={`${searchId}-hint`} className="hr-search-hint">По имени, должности или подразделению</p>
    </div>
    <p className="hr-results" role="status" aria-live="polite" aria-atomic="true">Показано сотрудников: <strong>{people.length}</strong> из {employees.length}</p>
    <p className="hr-directory-note">Кадровые сведения доступны только для просмотра.</p>
    <ul className="hr-employee-list">{people.map((person) => <li key={person.id}>
      <div className="request-applicant"><span className="avatar avatar-small">{person.initials}</span><div><h2>{person.name}</h2><span>{person.position}</span></div></div>
      <dl className="request-applicant-fields">
        <div><dt>Подразделение</dt><dd>{person.department}</dd></div>
        <div><dt>Руководитель</dt><dd>{person.manager}</dd></div>
        <div><dt>Дата приёма</dt><dd>{person.hiredAt ? formatDate(person.hiredAt) : 'Не указана'}</dd></div>
        <div><dt>Остаток отпуска</dt><dd>{availableVacationDays(person, requests)} календ. дн.</dd></div>
      </dl>
    </li>)}</ul>
    {!people.length && <div className="hr-empty">
      <h2>Сотрудники не найдены</h2>
      <p>Попробуйте другое имя, должность или подразделение.</p>
      <button type="button" className="secondary-button" onClick={clearSearch}>Сбросить поиск</button>
    </div>}
  </section>
}
