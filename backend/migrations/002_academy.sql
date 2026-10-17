CREATE TABLE courses (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE TABLE course_enrollments (
  employee_id text NOT NULL REFERENCES employees(id),
  course_id text NOT NULL REFERENCES courses(id),
  completed_lessons jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(completed_lessons) = 'array'),
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object'),
  quiz_view text NOT NULL DEFAULT 'questions' CHECK (quiz_view IN ('questions', 'result')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  completed_at timestamptz,
  PRIMARY KEY (employee_id, course_id)
);
CREATE TABLE quiz_attempts (
  id uuid PRIMARY KEY,
  submission_key uuid NOT NULL UNIQUE,
  submitted_revision integer NOT NULL,
  employee_id text NOT NULL,
  course_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  answers jsonb NOT NULL,
  review jsonb NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  correct integer NOT NULL CHECK (correct >= 0),
  total integer NOT NULL CHECK (total > 0 AND correct <= total),
  passed boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (employee_id, course_id) REFERENCES course_enrollments(employee_id, course_id),
  UNIQUE (employee_id, course_id, attempt_number)
);
ALTER TABLE notifications ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN course_id text REFERENCES courses(id);
ALTER TABLE notifications ADD COLUMN event_key text UNIQUE;
ALTER TABLE notifications ADD CONSTRAINT notification_one_target CHECK (num_nonnulls(request_id, course_id) = 1);
