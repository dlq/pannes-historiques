CREATE TABLE IF NOT EXISTS disclosure_sources (
  source_key TEXT PRIMARY KEY,
  local_id INTEGER,
  dai_number TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  attachment_url TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  published_date TEXT,
  transmitted_date TEXT,
  geography_label TEXT NOT NULL,
  geography_type TEXT NOT NULL,
  extraction_method TEXT NOT NULL,
  precision_label TEXT NOT NULL,
  notes TEXT,
  sha256 TEXT,
  fetched_at TEXT,
  r2_key TEXT,
  content_type TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disclosure_outage_events (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  duration_seconds INTEGER,
  duration_hours REAL,
  customers_affected INTEGER,
  interruption_type TEXT,
  cause TEXT,
  equipment TEXT,
  cause_group TEXT,
  category TEXT,
  geography_label TEXT NOT NULL,
  geography_type TEXT NOT NULL,
  centroid_lon REAL,
  centroid_lat REAL,
  precision_label TEXT NOT NULL,
  raw_row_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_key, source_row_id)
);

CREATE TABLE IF NOT EXISTS disclosure_annual_metrics (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  year INTEGER,
  period_label TEXT,
  geography_label TEXT NOT NULL,
  geography_type TEXT NOT NULL,
  outage_count INTEGER,
  average_duration_minutes REAL,
  continuity_index_minutes REAL,
  long_outage_count INTEGER,
  notes TEXT,
  raw_row_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_key, year, period_label, geography_label)
);

CREATE TABLE IF NOT EXISTS disclosure_geometries (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  geography_label TEXT NOT NULL,
  geography_type TEXT NOT NULL,
  geometry_source TEXT NOT NULL,
  centroid_lon REAL,
  centroid_lat REAL,
  bbox_min_lon REAL,
  bbox_min_lat REAL,
  bbox_max_lon REAL,
  bbox_max_lat REAL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_key, geography_label, geometry_source)
);

CREATE INDEX IF NOT EXISTS idx_disclosure_events_source ON disclosure_outage_events(source_key);
CREATE INDEX IF NOT EXISTS idx_disclosure_events_time ON disclosure_outage_events(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_events_geo ON disclosure_outage_events(geography_label, geography_type);
CREATE INDEX IF NOT EXISTS idx_disclosure_metrics_source ON disclosure_annual_metrics(source_key);
CREATE INDEX IF NOT EXISTS idx_disclosure_geometries_source ON disclosure_geometries(source_key);
