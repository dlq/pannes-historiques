DELETE FROM current_outage_records
WHERE source_version <> (
  SELECT MAX(source_version) FROM current_outage_records
);

DELETE FROM current_planned_interruptions
WHERE source_version <> (
  SELECT MAX(source_version) FROM current_planned_interruptions
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_job_started_id
  ON ingestion_runs(job_name, started_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_id
  ON ingestion_runs(started_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_job_status_id
  ON ingestion_runs(job_name, status, id DESC);

CREATE INDEX IF NOT EXISTS idx_hydro_snapshots_fetched_at
  ON hydro_snapshots(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_hydro_polygon_geometries_archive_cursor
  ON hydro_polygon_geometries(source_type, source_version, CAST(polygon_id AS INTEGER));

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_source_cursor
  ON previous_outage_territory_bins(source_type, source_version DESC, CAST(polygon_id AS INTEGER) DESC);

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_primary_time
  ON previous_outage_territory_bins(
    assignment_type,
    COALESCE(latest_start_time, last_seen_at, updated_at, '')
  );

CREATE TABLE IF NOT EXISTS runtime_summaries (
  summary_key TEXT PRIMARY KEY,
  summary_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_resolved_events_outage_sort_time
  ON resolved_events(
    outage_kind,
    COALESCE(start_time, last_seen_at, updated_at, '') DESC
  );

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_largest
  ON previous_outage_territory_bins(
    assignment_type,
    COALESCE(max_customers, 0) DESC,
    COALESCE(latest_start_time, last_seen_at, updated_at, '') DESC
  );

CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_latest_dedupe
  ON previous_outage_territory_bins(
    assignment_type,
    COALESCE(latest_start_time, last_seen_at, updated_at, '') DESC,
    territory_id,
    updated_at DESC,
    hydro_polygon_id DESC
  );

CREATE INDEX IF NOT EXISTS idx_disclosure_sources_archive_due_priority
  ON disclosure_sources(
    CASE WHEN r2_key IS NULL THEN 0 ELSE 1 END,
    archival_attempt_count,
    COALESCE(fetched_at, ''),
    dai_number
  );

CREATE INDEX IF NOT EXISTS idx_disclosure_sources_parse_due_priority
  ON disclosure_sources(
    parse_attempt_count,
    COALESCE(parsed_at, ''),
    dai_number
  )
  WHERE r2_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_disclosure_events_sort_time
  ON disclosure_outage_events(COALESCE(start_time, updated_at) DESC);

CREATE INDEX IF NOT EXISTS idx_disclosure_metrics_region_order
  ON disclosure_annual_metrics(
    geography_type,
    geography_label,
    COALESCE(year, 0) DESC,
    source_key
  );

CREATE INDEX IF NOT EXISTS idx_disclosure_geometries_source_label
  ON disclosure_geometries(source_key, geography_label);

CREATE INDEX IF NOT EXISTS idx_runtime_geocode_cache_updated_at
  ON runtime_geocode_cache(updated_at);
