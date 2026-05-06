CREATE INDEX IF NOT EXISTS idx_current_outage_records_nearby
ON current_outage_records(source_version, centroid_lat, centroid_lon);

CREATE INDEX IF NOT EXISTS idx_current_planned_interruptions_nearby
ON current_planned_interruptions(source_version, centroid_lat, centroid_lon);
