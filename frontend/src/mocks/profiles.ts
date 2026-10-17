import type { EmployeeProfile } from '../types'

// Fictional profiles; example domains and numbers are for local UI testing only.
export const initialProfiles: EmployeeProfile[] = [
  {
    employeeId: 'employee-aidana',
    birthDate: '1998-04-18',
    employeeNumber: 'JP-0238',
    employmentType: 'Полная занятость',
    schedule: '5/2 · 09:00–18:00',
    workEmail: 'aidana.serik@jana-post.example',
    language: 'Русский',
    contacts: { email: 'aidana.serik@example.com', phone: '+77000000001' },
  },
  {
    employeeId: 'manager-daniyar',
    birthDate: '1991-09-06',
    employeeNumber: 'JP-0085',
    employmentType: 'Полная занятость',
    schedule: '5/2 · 09:00–18:00',
    workEmail: 'daniyar.omarov@jana-post.example',
    language: 'Русский',
    contacts: { email: 'daniyar.omarov@example.com', phone: '+77000000002' },
  },
]
