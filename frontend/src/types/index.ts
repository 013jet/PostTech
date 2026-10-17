export type Page =
  'home' | 'requests' | 'learning' | 'profile' | 'notifications' | 'employees'
export type NotificationFilter = 'all' | 'unread'
export type RequestStatus =
  'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled'
export type RequestFilter = 'all' | RequestStatus
export type DemoRole = 'employee' | 'manager' | 'hr'
export type ReviewDecision = 'approved' | 'rejected'
export interface DemoSession {
  role: DemoRole
  userId: string
}

export interface Employee {
  id: string
  managerId: string
  firstName: string
  name: string
  initials: string
  position: string
  department: string
  company: string
  manager: string
  hiredAt?: string
  location: string
  vacationDays: number
}

export interface ProfileContacts {
  email: string
  phone: string
}

export interface EmployeeProfile {
  employeeId: string
  birthDate: string
  employeeNumber: string
  employmentType: string
  schedule: string
  workEmail: string
  language: string
  contacts: ProfileContacts
}

export interface RequestHistoryEvent {
  id: string
  title: string
  actor: string
  role: string
  occurredAt: string
  description?: string
  status?: RequestStatus
}

interface RequestBase {
  employeeId: string
  id: string
  title: string
  description: string
  createdAt: string
  status: RequestStatus
  comment: string
  history: RequestHistoryEvent[]
}

export interface VacationRequest extends RequestBase {
  type: 'vacation'
  sourceRequestId?: string
  deductedVacationDays?: number
  startDate: string
  endDate: string
  days: number
}

export interface AdvanceRequest extends RequestBase {
  type: 'advance'
  amount: number
}

export type EmployeeRequest = VacationRequest | AdvanceRequest

export interface CourseLesson {
  id: string
  title: string
  duration: string
  paragraphs: string[]
  takeaways: string[]
  practice: string
}

export interface QuizQuestion {
  id: string
  text: string
  options: { id: string; text: string }[]
  correctOptionId: string
  explanation: string
}

export interface CourseDefinition {
  id: string
  title: string
  category: string
  duration: string
  color: 'green' | 'peach'
  description: string
  lessons: CourseLesson[]
  quiz: { passingScore: number; duration: string; questions: QuizQuestion[] }
}

export type PublicQuizQuestion = Omit<QuizQuestion, 'correctOptionId' | 'explanation'>
export type PublicCourseDefinition = Omit<CourseDefinition, 'quiz'> & {
  quiz: { passingScore: number; duration: string; questions: PublicQuizQuestion[] }
}
export interface QuizReviewItem extends QuizQuestion { correct: boolean }

export interface QuizAttempt {
  id: string
  answers: Record<string, string>
  score: number
  correct: number
  total: number
  passed: boolean
  submittedAt: string
  review?: QuizReviewItem[]
}

export interface CourseEnrollment {
  employeeId: string
  courseId: string
  completedLessonIds: string[]
  answers: Record<string, string>
  attempts: QuizAttempt[]
  quizView: 'questions' | 'result'
  completedAt?: string
}

export interface Course extends PublicCourseDefinition {
  progress: number
  completedLessons: number
  result?: QuizAttempt
}

export interface EmployeeNotification {
  recipientId: string
  requestId?: string
  courseId?: string
  id: string
  title: string
  description: string
  time: string
  read: boolean
}
