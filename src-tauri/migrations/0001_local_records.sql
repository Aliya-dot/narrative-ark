CREATE TABLE IF NOT EXISTS local_records (
  table_name TEXT NOT NULL,
  id TEXT NOT NULL,
  parent_id TEXT,
  indexed_at TEXT,
  sort_number INTEGER,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (table_name, id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_local_records_parent
  ON local_records (table_name, parent_id);
CREATE INDEX IF NOT EXISTS idx_local_records_time
  ON local_records (table_name, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_records_number
  ON local_records (table_name, sort_number);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
) WITHOUT ROWID;
