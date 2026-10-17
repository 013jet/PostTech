import type pg from 'pg'
import { pathToFileURL } from 'node:url'
import { createPool, databaseUrl, transaction } from './db.js'
import { hashPassword } from './security.js'
import { seedAcademy } from './academy.js'

export const localPassword = 'JanaLocal2026!'
export async function seed(pool: pg.Pool) {
  // Local fixtures only. Never overwrites users, passwords or application records.
  const people = [
    { id: 'manager-daniyar', managerId: null, role: 'manager', name: 'Данияр Омаров', firstName: 'Данияр', initials: 'ДО', position: 'Руководитель операционного отдела', vacationDays: 24, email: 'manager@janamen.local' },
    { id: 'employee-aidana', managerId: 'manager-daniyar', role: 'employee', name: 'Айдана Серик', firstName: 'Айдана', initials: 'АС', position: 'Специалист по логистике', vacationDays: 18, email: 'employee@janamen.local' },
    { id: 'employee-timur', managerId: 'manager-daniyar', role: 'employee', name: 'Тимур Алиев', firstName: 'Тимур', initials: 'ТА', position: 'Координатор доставки', vacationDays: 14, email: 'timur@janamen.local' },
    { id: 'employee-outside', managerId: null, role: 'employee', name: 'Руслан Ахметов', firstName: 'Руслан', initials: 'РА', position: 'Специалист отдела продаж', vacationDays: 18, email: 'outside@janamen.local' },
    { id: 'hr-madina', managerId: null, role: 'hr', name: 'Мадина Нурлан', firstName: 'Мадина', initials: 'МН', position: 'HR-администратор', vacationDays: 24, email: 'hr@janamen.local' },
  ]
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(771255)')
    for (const [index, person] of people.entries()) {
      const { role, email, ...fields } = person
      const data = { ...fields, managerId: person.managerId || '', company: 'Jana Post', department: role === 'hr' ? 'Отдел персонала' : person.id === 'employee-outside' ? 'Отдел продаж' : 'Операционный отдел', manager: person.managerId ? 'Данияр Омаров' : 'Не назначен', hiredAt: '2025-03-10', location: 'Алматы, Казахстан' }
      const profile = { employeeId: person.id, birthDate: '1998-04-18', employeeNumber: `LOCAL-${index + 1}`, employmentType: 'Полная занятость', schedule: '5/2 · 09:00–18:00', workEmail: email, language: 'Русский', contacts: { email, phone: `+7700000000${index + 1}` } }
      await client.query('INSERT INTO employees(id, manager_id, role, opening_days, data, profile) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [person.id, person.managerId, role, person.vacationDays, data, profile])
      if (!(await client.query('SELECT 1 FROM users WHERE id = $1', [person.id])).rowCount)
        await client.query('INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)', [person.id, email, await hashPassword(localPassword)])
    }
    await seedAcademy(client)
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool(await databaseUrl())
  try { await seed(pool); console.log('Локальные аккаунты созданы; существующие данные сохранены.') } finally { await pool.end() }
}
