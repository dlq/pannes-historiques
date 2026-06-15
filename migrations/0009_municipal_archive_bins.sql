CREATE TABLE IF NOT EXISTS admin_territories (
  territory_id TEXT PRIMARY KEY,
  source_layer TEXT NOT NULL,
  source_object_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT,
  designation TEXT,
  designation_code TEXT,
  mrc_code TEXT,
  mrc_name TEXT,
  region_code TEXT,
  region_name TEXT,
  source_version TEXT,
  area_km2 REAL,
  centroid_lon REAL,
  centroid_lat REAL,
  bbox_min_lon REAL,
  bbox_min_lat REAL,
  bbox_max_lon REAL,
  bbox_max_lat REAL,
  geometry_geojson TEXT NOT NULL,
  display_geometry_geojson TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_territories_bbox
  ON admin_territories(bbox_min_lon, bbox_max_lon, bbox_min_lat, bbox_max_lat);

CREATE INDEX IF NOT EXISTS idx_admin_territories_region
  ON admin_territories(region_code, mrc_code, code);

CREATE TABLE IF NOT EXISTS previous_outage_territory_bins (
  id TEXT PRIMARY KEY,
  hydro_polygon_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_version TEXT NOT NULL,
  polygon_id TEXT NOT NULL,
  territory_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('primary', 'overlap')),
  territory_code TEXT NOT NULL,
  territory_name TEXT NOT NULL,
  designation TEXT,
  mrc_code TEXT,
  mrc_name TEXT,
  region_code TEXT,
  region_name TEXT,
  centroid_lon REAL,
  centroid_lat REAL,
  first_seen_at TEXT,
  last_seen_at TEXT,
  event_count INTEGER NOT NULL DEFAULT 1,
  max_customers INTEGER,
  latest_start_time TEXT,
  latest_end_time TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (territory_id) REFERENCES admin_territories(territory_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_unique
  ON previous_outage_territory_bins(hydro_polygon_id, territory_id, assignment_type);

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_territory
  ON previous_outage_territory_bins(assignment_type, territory_id, latest_start_time DESC);

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_polygon
  ON previous_outage_territory_bins(hydro_polygon_id);

CREATE TABLE IF NOT EXISTS municipal_archive_build_state (
  state_key TEXT PRIMARY KEY,
  state_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
