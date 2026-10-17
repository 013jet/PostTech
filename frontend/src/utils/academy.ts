import type {
  CourseDefinition,
  CourseEnrollment,
  DemoSession,
  QuizAttempt,
} from '../types/index.ts'
import type { WorkflowState } from './workflow.ts'

export type AcademyAction =
  | {
      type: 'lesson-complete'
      session: DemoSession
      courseId: string
      lessonId: string
    }
  | {
      type: 'quiz-answer'
      session: DemoSession
      courseId: string
      questionId: string
      optionId: string
    }
  | {
      type: 'quiz-submit'
      session: DemoSession
      courseId: string
      attemptId: string
      submittedAt: string
    }
  | { type: 'quiz-retry'; session: DemoSession; courseId: string }

export function completedLessons(
  course: Pick<CourseDefinition, 'lessons'>,
  enrollment: CourseEnrollment,
) {
  return course.lessons.filter((lesson) =>
    enrollment.completedLessonIds.includes(lesson.id),
  ).length
}
export function allLessonsCompleted(
  course: Pick<CourseDefinition, 'lessons'>,
  enrollment: CourseEnrollment,
) {
  return (
    course.lessons.length > 0 &&
    completedLessons(course, enrollment) === course.lessons.length
  )
}
export function courseProgress(
  course: Pick<CourseDefinition, 'lessons'>,
  enrollment: CourseEnrollment,
) {
  const passed =
    Boolean(enrollment.completedAt) &&
    allLessonsCompleted(course, enrollment) &&
    enrollment.attempts.some((attempt) => attempt.passed)
  return Math.round(
    ((completedLessons(course, enrollment) + (passed ? 1 : 0)) /
      (course.lessons.length + 1)) *
      100,
  )
}
export function gradeQuiz(
  course: CourseDefinition,
  answers: Record<string, string>,
) {
  const total = course.quiz.questions.length
  const correct = course.quiz.questions.filter(
    (question) => answers[question.id] === question.correctOptionId,
  ).length
  const score = total ? Math.round((correct / total) * 100) : 0
  return {
    total,
    correct,
    score,
    passed: total > 0 && score >= course.quiz.passingScore,
  }
}

export function reduceAcademy(
  state: WorkflowState,
  action: AcademyAction,
): WorkflowState {
  const course = state.courses.find((item) => item.id === action.courseId)
  const enrollment = state.enrollments.find(
    (item) =>
      item.courseId === action.courseId &&
      item.employeeId === action.session.userId,
  )
  if (
    action.session.role !== 'employee' ||
    !course ||
    !enrollment ||
    enrollment.completedAt
  )
    return state
  const update = (next: CourseEnrollment) => ({
    ...state,
    enrollments: state.enrollments.map((item) =>
      item === enrollment ? next : item,
    ),
  })

  if (action.type === 'lesson-complete') {
    if (
      !course.lessons.some((lesson) => lesson.id === action.lessonId) ||
      enrollment.completedLessonIds.includes(action.lessonId)
    )
      return state
    return update({
      ...enrollment,
      completedLessonIds: [...enrollment.completedLessonIds, action.lessonId],
    })
  }
  if (!allLessonsCompleted(course, enrollment)) return state
  if (action.type === 'quiz-answer') {
    const question = course.quiz.questions.find(
      (item) => item.id === action.questionId,
    )
    if (
      enrollment.quizView !== 'questions' ||
      !question?.options.some((option) => option.id === action.optionId) ||
      enrollment.answers[action.questionId] === action.optionId
    )
      return state
    return update({
      ...enrollment,
      answers: { ...enrollment.answers, [action.questionId]: action.optionId },
    })
  }
  if (action.type === 'quiz-retry') {
    const last = enrollment.attempts.at(-1)
    if (enrollment.quizView !== 'result' || !last || last.passed) return state
    return update({ ...enrollment, answers: {}, quizView: 'questions' })
  }
  if (
    enrollment.quizView !== 'questions' ||
    !course.quiz.questions.length ||
    enrollment.attempts.some((attempt) => attempt.id === action.attemptId) ||
    !Number.isFinite(Date.parse(action.submittedAt)) ||
    !course.quiz.questions.every((question) =>
      question.options.some(
        (option) => option.id === enrollment.answers[question.id],
      ),
    )
  )
    return state
  const grade = gradeQuiz(course, enrollment.answers)
  const attempt: QuizAttempt = {
    id: action.attemptId,
    answers: { ...enrollment.answers },
    submittedAt: action.submittedAt,
    ...grade,
  }
  const updated = update({
    ...enrollment,
    attempts: [...enrollment.attempts, attempt],
    quizView: 'result',
    ...(grade.passed ? { completedAt: action.submittedAt } : {}),
  })
  if (!grade.passed) return updated
  const notificationId = `course-completed-${enrollment.employeeId}-${course.id}`
  return {
    ...updated,
    notifications: state.notifications.some(
      (item) => item.id === notificationId,
    )
      ? state.notifications
      : [
          {
            id: notificationId,
            recipientId: enrollment.employeeId,
            courseId: course.id,
            title: 'Курс завершён',
            description: `${course.title}. Результат: ${grade.score}% (${grade.correct} из ${grade.total}).`,
            time: 'Только что',
            read: false,
          },
          ...state.notifications,
        ],
  }
}
