CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  project_key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'backend', 'frontend', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE personal_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE repositories (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('github')),
  owner text NOT NULL,
  repository text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, provider, owner, repository)
);

CREATE TABLE contract_versions (
  id uuid PRIMARY KEY,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  git_revision text NOT NULL,
  file_path text NOT NULL,
  content_sha256 text NOT NULL,
  content_type text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository_id, git_revision, file_path)
);

CREATE TABLE handoffs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_version_id uuid NOT NULL REFERENCES contract_versions(id),
  subject text NOT NULL,
  summary text NOT NULL,
  compatibility text NOT NULL CHECK (compatibility IN ('additive', 'compatible', 'breaking', 'unknown')),
  status text NOT NULL CHECK (status IN ('open', 'acknowledged', 'changes_requested', 'decision_needed', 'cannot_verify', 'resolved')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX handoffs_project_status_created_idx ON handoffs(project_id, status, created_at DESC);

CREATE TABLE handoff_events (
  id uuid PRIMARY KEY,
  handoff_id uuid NOT NULL REFERENCES handoffs(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('created', 'reply', 'resolved')),
  payload jsonb NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX handoff_events_handoff_created_idx ON handoff_events(handoff_id, created_at);
