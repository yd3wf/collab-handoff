CREATE TABLE assistance_requests (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'acknowledged', 'answered', 'decision_needed', 'resolved')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX assistance_requests_project_status_created_idx ON assistance_requests(project_id, status, created_at DESC);

CREATE TABLE assistance_request_events (
  id uuid PRIMARY KEY,
  assistance_request_id uuid NOT NULL REFERENCES assistance_requests(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('created', 'reply', 'resolved')),
  payload jsonb NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX assistance_request_events_request_created_idx ON assistance_request_events(assistance_request_id, created_at);
