ALTER TABLE disclosure_sources ADD COLUMN parse_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE disclosure_sources ADD COLUMN parse_last_attempt_at TEXT;
ALTER TABLE disclosure_sources ADD COLUMN parse_last_error TEXT;
ALTER TABLE disclosure_sources ADD COLUMN parse_deferred_until TEXT;
ALTER TABLE disclosure_sources ADD COLUMN parsed_at TEXT;

UPDATE disclosure_sources
SET parsed_at = COALESCE(updated_at, fetched_at)
WHERE r2_key IS NOT NULL
  AND parsed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_disclosure_sources_parse_due
  ON disclosure_sources(r2_key, parsed_at, parse_deferred_until, parse_attempt_count);
