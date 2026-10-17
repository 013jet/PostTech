import type { Course } from '../types'
import { CoursesPanel } from '../components/DashboardSections'

export function AcademyPage({
  courses,
  onOpen,
}: {
  courses: Course[]
  onOpen: (courseId: string) => void
}) {
  const finished = courses.filter((course) => course.progress === 100).length
  const average = courses.length
    ? Math.round(
        courses.reduce((sum, course) => sum + course.progress, 0) /
          courses.length,
      )
    : 0
  return (
    <>
      <section className="academy-summary" aria-label="Прогресс обучения">
        <div>
          <span>Назначено курсов</span>
          <strong>{courses.length}</strong>
          <small>Ваш план обучения</small>
        </div>
        <div>
          <span>Курсов завершено</span>
          <strong>
            {finished}
            <small>/{courses.length}</small>
          </strong>
          <small>Материалы и тест пройдены</small>
        </div>
        <div>
          <span>Общий прогресс</span>
          <strong>
            {average}
            <small>%</small>
          </strong>
          <small>Среднее по назначенным курсам</small>
        </div>
      </section>
      {courses.length > 0 ? (
        <CoursesPanel
          courses={courses}
          onOpen={(course) => onOpen(course.id)}
        />
      ) : (
        <section className="panel academy-empty">
          <h2>Пока нет назначенных курсов</h2>
          <p>Здесь появятся материалы и задания вашего плана обучения.</p>
        </section>
      )}
    </>
  )
}
