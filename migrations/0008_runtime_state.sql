CREATE TABLE IF NOT EXISTS runtime_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_query TEXT NOT NULL,
  normalized_line TEXT NOT NULL UNIQUE,
  street_line TEXT,
  unit TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  geocoder TEXT NOT NULL,
  geocoder_confidence REAL NOT NULL DEFAULT 0,
  geocode_quality TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_geocode_cache (
  normalized_query TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  confidence REAL NOT NULL,
  quality TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address_id INTEGER NOT NULL,
  original_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  language TEXT NOT NULL,
  radius_m INTEGER NOT NULL,
  time_window_days INTEGER NOT NULL,
  include_planned INTEGER NOT NULL DEFAULT 1,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runtime_address_outage_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address_id INTEGER NOT NULL,
  outage_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  geometry_id TEXT,
  match_type TEXT NOT NULL,
  distance_m REAL,
  confidence REAL NOT NULL,
  event_json TEXT NOT NULL,
  matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(address_id, outage_kind, event_key)
);

CREATE INDEX IF NOT EXISTS idx_runtime_query_history_address
  ON runtime_query_history(address_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_address_outage_matches_address
  ON runtime_address_outage_matches(address_id, matched_at DESC);
