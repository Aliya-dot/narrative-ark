CREATE TABLE IF NOT EXISTS backup_events (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_backup_events_created
  ON backup_events (created_at_ms DESC);
