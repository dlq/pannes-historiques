CREATE INDEX IF NOT EXISTS idx_resolved_events_nearby
ON resolved_events(outage_kind, centroid_lat, centroid_lon, start_time DESC);
