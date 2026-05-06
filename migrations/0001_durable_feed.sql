CREATE TABLE IF NOT EXISTS feed_versions (
  source TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hydro_snapshots (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_version TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  r2_key TEXT,
  content_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  http_status INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS current_outage_records (
  id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  record_index INTEGER NOT NULL,
  customers_affected INTEGER,
  outage_start_time TEXT,
  estimated_restore_time TEXT,
  interruption_type TEXT,
  status TEXT,
  cause_group_code TEXT,
  cause_detail_code TEXT,
  municipality_code TEXT,
  centroid_lon REAL,
  centroid_lat REAL,
  raw_record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_version, record_index)
);

CREATE TABLE IF NOT EXISTS current_planned_interruptions (
  id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  record_index INTEGER NOT NULL,
  notice_id TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  postponed_start TEXT,
  postponed_end TEXT,
  rescheduled_start TEXT,
  rescheduled_end TEXT,
  customers_affected INTEGER,
  municipality_code TEXT,
  status TEXT,
  centroid_lon REAL,
  centroid_lat REAL,
  raw_record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_version, record_index)
);

CREATE TABLE IF NOT EXISTS resolved_events (
  event_key TEXT PRIMARY KEY,
  outage_kind TEXT NOT NULL,
  first_seen_at TEXT,
  last_seen_at TEXT,
  start_time TEXT,
  end_time TEXT,
  municipality_code TEXT,
  centroid_lon REAL,
  centroid_lat REAL,
  customers_min INTEGER,
  customers_max INTEGER,
  record_count INTEGER NOT NULL DEFAULT 0,
  interruption_type TEXT,
  status TEXT,
  source_versions TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hydro_snapshots_source ON hydro_snapshots(source_type, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_current_outage_records_version ON current_outage_records(source_version);
CREATE INDEX IF NOT EXISTS idx_current_planned_interruptions_version ON current_planned_interruptions(source_version);
CREATE INDEX IF NOT EXISTS idx_resolved_events_kind_time ON resolved_events(outage_kind, last_seen_at DESC);
