CREATE TABLE IF NOT EXISTS hydro_polygon_geometries (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_version TEXT NOT NULL,
  polygon_id TEXT NOT NULL,
  name TEXT,
  centroid_lon REAL,
  centroid_lat REAL,
  bbox_min_lon REAL,
  bbox_min_lat REAL,
  bbox_max_lon REAL,
  bbox_max_lat REAL,
  geometry_geojson TEXT NOT NULL,
  raw_coordinates TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_version, polygon_id)
);

CREATE INDEX IF NOT EXISTS idx_hydro_polygon_geometries_source
  ON hydro_polygon_geometries(source_type, source_version);

CREATE INDEX IF NOT EXISTS idx_hydro_polygon_geometries_bbox
  ON hydro_polygon_geometries(source_type, bbox_min_lon, bbox_max_lon, bbox_min_lat, bbox_max_lat);
