CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status_started
  ON ingestion_runs(status, started_at);

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_assignment_polygon
  ON previous_outage_territory_bins(assignment_type, hydro_polygon_id);
