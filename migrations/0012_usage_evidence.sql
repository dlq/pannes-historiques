CREATE TABLE IF NOT EXISTS usage_daily_aggregates (
  usage_date TEXT NOT NULL,
  feature TEXT NOT NULL CHECK (
    feature IN ('current', 'planned', 'archive', 'context', 'address', 'comparison')
  ),
  action TEXT NOT NULL CHECK (action IN ('open', 'detail', 'answer', 'add')),
  human_interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (human_interaction_count >= 0),
  non_human_count INTEGER NOT NULL DEFAULT 0 CHECK (non_human_count >= 0),
  collection_status TEXT NOT NULL DEFAULT 'active' CHECK (
    collection_status IN ('active', 'partial', 'paused')
  ),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, feature, action),
  CHECK (
    (feature IN ('current', 'planned', 'archive', 'context') AND action IN ('open', 'detail'))
    OR (feature = 'address' AND action = 'answer')
    OR (feature = 'comparison' AND action = 'add')
  )
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_usage_daily_aggregates_date
ON usage_daily_aggregates(usage_date DESC);

CREATE TABLE IF NOT EXISTS usage_collection_days (
  usage_date TEXT PRIMARY KEY,
  collection_status TEXT NOT NULL CHECK (
    collection_status IN ('active', 'partial', 'paused')
  ),
  updated_at TEXT NOT NULL
) WITHOUT ROWID;
