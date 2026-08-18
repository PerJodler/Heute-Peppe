CREATE TABLE IF NOT EXISTS backups (
  sync_id TEXT PRIMARY KEY,
  auth_token TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
