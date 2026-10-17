import { useState } from 'react'
import type { Employee, EmployeeRequest } from '../types'
import { availableVacationDays } from '../utils/requests'
import { formatDate } from '../mocks/dashboard'

export function EmployeesPage({ employees, requests }: { employees: Employee[]; requests: EmployeeRequest[] }) {
  const [search, setSearch] = useState('')
  const people = employees.filter((person) => `${person.name} ${person.department} ${person.position}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return <section className="panel hr-directory" aria-label="Сотрудники компании">
    <label className="hr-search">Найти сотрудника
      <input type="search" placeholder="Имя, должность или подразделение" value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
    <p role="status">Показано сотрудников: {people.length} из {employees.length}</p>
    <p className="read-only-note">Кадровый обзор компании. Личные контакты, даты рождения и результаты обучения других сотрудников недоступны. Изменение кадровых данных пока не подключено.</p>
    <ul className="hr-employee-list">{people.map((person) => <li key={person.id}>
      <div className="request-applicant"><span className="avatar avatar-small">{person.initials}</span><div><strong>{person.name}</strong><span>{person.position}</span></div></div>
      <dl className="request-applicant-fields">
        <div><dt>Подразделение</dt><dd>{person.department}</dd></div>
        <div><dt>Руководитель</dt><dd>{person.manager}</dd></div>
        <div><dt>Дата приёма</dt><dd>{person.hiredAt ? formatDate(person.hiredAt) : 'Не указана'}</dd></div>
        <div><dt>Остаток отпуска</dt><dd>{availableVacationDays(person, requests)} календ. дн.</dd></div>
      </dl>
    </li>)}</ul>
    {!people.length && <p>Сотрудники не найдены. Измените поисковый запрос.</p>}
  </section>
}
