CREATE TABLE employees (
  id text PRIMARY KEY,
  manager_id text REFERENCES employees(id),
  role text NOT NULL CHECK (role IN ('employee', 'manager')),
  opening_days integer NOT NULL CHECK (opening_days >= 0),
  data jsonb NOT NULL,
  profile jsonb NOT NULL
);
CREATE TABLE users (
  id text PRIMARY KEY REFERENCES employees(id),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE SEQUENCE request_number START 1001;
CREATE TABLE requests (
  id text PRIMARY KEY DEFAULT ('JP-' || nextval('request_number')),
  employee_id text NOT NULL REFERENCES employees(id),
  source_request_id text REFERENCES requests(id),
  submission_key uuid NOT NULL UNIQUE,
  submission_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  days integer NOT NULL CHECK (days > 0 AND days = end_date - start_date + 1),
  comment text NOT NULL CHECK (length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_owner ON requests(employee_id, created_at DESC);
CREATE INDEX requests_approved_period ON requests(employee_id, start_date, end_date) WHERE status = 'approved';
CREATE TABLE request_history (
  id uuid PRIMARY KEY,
  request_id text NOT NULL REFERENCES requests(id),
  actor_id text NOT NULL REFERENCES employees(id),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_history_request ON request_history(request_id, occurred_at);
CREATE TABLE vacation_debits (
  request_id text PRIMARY KEY REFERENCES requests(id),
  employee_id text NOT NULL REFERENCES employees(id),
  days integer NOT NULL CHECK (days > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vacation_debits_owner ON vacation_debits(employee_id);
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES employees(id),
  request_id text NOT NULL REFERENCES requests(id),
  title text NOT NULL,
  description text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recipient ON notifications(recipient_id, created_at DESC);
