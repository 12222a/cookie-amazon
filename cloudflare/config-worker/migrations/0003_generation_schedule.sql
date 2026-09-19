CREATE TABLE IF NOT EXISTS generation_schedule (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  batch_count INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO generation_schedule
  (id, enabled, interval_minutes, batch_count, next_run_at, updated_by, updated_at)
VALUES ('default', 0, 1440, 1, NULL, '系统', datetime('now'));