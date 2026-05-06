ALTER TABLE disclosure_sources ADD COLUMN archival_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE disclosure_sources ADD COLUMN archival_last_attempt_at TEXT;
ALTER TABLE disclosure_sources ADD COLUMN archival_last_error TEXT;
ALTER TABLE disclosure_sources ADD COLUMN archival_deferred_until TEXT;

CREATE INDEX IF NOT EXISTS idx_disclosure_sources_archival_due
  ON disclosure_sources(r2_key, archival_deferred_until, archival_attempt_count, fetched_at);
