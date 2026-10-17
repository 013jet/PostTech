import { readFileSync } from 'node:fs'

// Node-only regression fixture. Private quiz keys live outside the frontend root.
export const courseCatalog = JSON.parse(readFileSync(new URL('../../backend/seed-data/academy.json', import.meta.url), 'utf8'))
export const initialEnrollments = [
  { employeeId: 'employee-aidana', courseId: 'onboarding', completedLessonIds: ['company', 'values', 'teamwork'], answers: {}, attempts: [], quizView: 'questions' },
  { employeeId: 'employee-aidana', courseId: 'security', completedLessonIds: [], answers: {}, attempts: [], quizView: 'questions' },
]
