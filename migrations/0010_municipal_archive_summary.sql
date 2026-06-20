CREATE TABLE IF NOT EXISTS municipal_archive_summaries (
  summary_key TEXT PRIMARY KEY,
  summary_json TEXT NOT NULL,
  source_cursor TEXT,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
