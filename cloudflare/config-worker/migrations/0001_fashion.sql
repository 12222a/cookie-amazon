CREATE TABLE IF NOT EXISTS fashion_references (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '女士裙装',
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_fashion_references_active_usage
  ON fashion_references(status, used_count, last_used_at, uploaded_at);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  prompt TEXT,
  error_message TEXT,
  provider_job_id TEXT,
  retry_of_job_id TEXT REFERENCES generation_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_requested_at
  ON generation_jobs(requested_at DESC);

CREATE TABLE IF NOT EXISTS generation_job_references (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  reference_id TEXT NOT NULL REFERENCES fashion_references(id),
  selection_mode TEXT NOT NULL,
  UNIQUE(job_id, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_job_references_job ON generation_job_references(job_id);

CREATE TABLE IF NOT EXISTS design_candidates (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  selected_by TEXT,
  selected_at TEXT,
  rejected_by TEXT,
  rejected_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_design_candidates_status_created
  ON design_candidates(status, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_favorites (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES design_candidates(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(candidate_id, actor)
);

CREATE INDEX IF NOT EXISTS idx_candidate_favorites_candidate
  ON candidate_favorites(candidate_id, active);

CREATE TABLE IF NOT EXISTS candidate_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES design_candidates(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  status TEXT NOT NULL,
  rating INTEGER,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  reviewer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidate_reviews_candidate
  ON candidate_reviews(candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_comments (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES design_candidates(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  parent_id TEXT REFERENCES candidate_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_comments_candidate
  ON candidate_comments(candidate_id, created_at);