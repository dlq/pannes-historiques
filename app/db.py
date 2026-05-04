from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_query TEXT NOT NULL,
    normalized_line TEXT NOT NULL UNIQUE,
    street_line TEXT,
    unit TEXT,
    city TEXT,
    province TEXT,
    postal_code TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    geocoder TEXT NOT NULL,
    geocoder_confidence REAL NOT NULL DEFAULT 0,
    geocode_quality TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geocode_cache (
    normalized_query TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    confidence REAL NOT NULL,
    quality TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    city TEXT,
    province TEXT,
    postal_code TEXT,
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS query_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_id INTEGER NOT NULL REFERENCES addresses(id),
    original_query TEXT NOT NULL,
    normalized_query TEXT NOT NULL,
    language TEXT NOT NULL,
    radius_m INTEGER NOT NULL,
    time_window_days INTEGER NOT NULL,
    include_planned INTEGER NOT NULL DEFAULT 1,
    cache_hit INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_version TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    payload_path TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    http_status INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outage_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES raw_snapshots(id),
    source_version TEXT NOT NULL,
    record_index INTEGER NOT NULL,
    customers_affected INTEGER,
    outage_start_time TEXT,
    estimated_restore_time TEXT,
    interruption_type TEXT,
    status TEXT,
    cause_group_code TEXT,
    cause_detail_code TEXT,
    municipality_code TEXT,
    centroid_lon REAL,
    centroid_lat REAL,
    raw_record_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_id, record_index)
);

CREATE TABLE IF NOT EXISTS outage_geometries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES raw_snapshots(id),
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
    raw_kml TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_id, polygon_id)
);

CREATE TABLE IF NOT EXISTS planned_interruptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES raw_snapshots(id),
    source_version TEXT NOT NULL,
    record_index INTEGER NOT NULL,
    notice_id TEXT,
    scheduled_start TEXT,
    scheduled_end TEXT,
    actual_start TEXT,
    actual_end TEXT,
    postponed_start TEXT,
    postponed_end TEXT,
    rescheduled_start TEXT,
    rescheduled_end TEXT,
    customers_affected INTEGER,
    municipality_code TEXT,
    status TEXT,
    centroid_lon REAL,
    centroid_lat REAL,
    raw_record_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_id, record_index)
);

CREATE TABLE IF NOT EXISTS address_outage_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_id INTEGER NOT NULL REFERENCES addresses(id),
    outage_kind TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    event_key TEXT,
    geometry_id INTEGER,
    match_type TEXT NOT NULL,
    distance_m REAL,
    confidence REAL NOT NULL,
    matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address_id, outage_kind, record_id)
);

CREATE TABLE IF NOT EXISTS resolved_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outage_kind TEXT NOT NULL,
    event_key TEXT NOT NULL UNIQUE,
    first_seen_at TEXT,
    last_seen_at TEXT,
    start_time TEXT,
    end_time TEXT,
    municipality_code TEXT,
    centroid_lon REAL,
    centroid_lat REAL,
    customers_min INTEGER,
    customers_max INTEGER,
    record_count INTEGER NOT NULL DEFAULT 0,
    interruption_type TEXT,
    status TEXT,
    source_versions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disclosure_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dai_number TEXT NOT NULL,
    title TEXT NOT NULL,
    source_url TEXT,
    attachment_url TEXT NOT NULL UNIQUE,
    format TEXT NOT NULL,
    published_date TEXT,
    transmitted_date TEXT,
    geography_label TEXT NOT NULL,
    geography_type TEXT NOT NULL,
    extraction_method TEXT NOT NULL,
    precision_label TEXT NOT NULL,
    notes TEXT,
    payload_path TEXT,
    sha256 TEXT,
    fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disclosure_outage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES disclosure_sources(id),
    source_row_id TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_seconds INTEGER,
    duration_hours REAL,
    customers_affected INTEGER,
    interruption_type TEXT,
    cause TEXT,
    equipment TEXT,
    cause_group TEXT,
    category TEXT,
    geography_label TEXT NOT NULL,
    geography_type TEXT NOT NULL,
    centroid_lon REAL,
    centroid_lat REAL,
    precision_label TEXT NOT NULL,
    raw_row_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, source_row_id)
);

CREATE TABLE IF NOT EXISTS disclosure_annual_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES disclosure_sources(id),
    year INTEGER,
    period_label TEXT,
    geography_label TEXT NOT NULL,
    geography_type TEXT NOT NULL,
    outage_count INTEGER,
    average_duration_minutes REAL,
    continuity_index_minutes REAL,
    long_outage_count INTEGER,
    notes TEXT,
    raw_row_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, year, period_label, geography_label)
);

CREATE TABLE IF NOT EXISTS disclosure_geometries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES disclosure_sources(id),
    geography_label TEXT NOT NULL,
    geography_type TEXT NOT NULL,
    geometry_source TEXT NOT NULL,
    geometry_geojson TEXT NOT NULL,
    centroid_lon REAL,
    centroid_lat REAL,
    bbox_min_lon REAL,
    bbox_min_lat REAL,
    bbox_max_lon REAL,
    bbox_max_lat REAL,
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, geography_label, geometry_source)
);

CREATE INDEX IF NOT EXISTS idx_query_history_address ON query_history(address_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outage_records_centroid ON outage_records(centroid_lat, centroid_lon);
CREATE INDEX IF NOT EXISTS idx_planned_interruptions_centroid ON planned_interruptions(centroid_lat, centroid_lon);
CREATE INDEX IF NOT EXISTS idx_raw_snapshots_source ON raw_snapshots(source_type, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_events_time ON disclosure_outage_events(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_events_geo ON disclosure_outage_events(geography_label, geography_type);
CREATE INDEX IF NOT EXISTS idx_disclosure_geometries_source ON disclosure_geometries(source_id);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize(db_path: Path) -> None:
    connection = connect(db_path)
    try:
        connection.executescript(SCHEMA)
        migrate(connection)
        connection.commit()
    finally:
        connection.close()


def migrate(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(address_outage_matches)").fetchall()
    }
    if "event_key" not in columns:
        connection.execute("ALTER TABLE address_outage_matches ADD COLUMN event_key TEXT")
    connection.execute(
        """
        UPDATE address_outage_matches
        SET event_key = (
            SELECT COALESCE(r.municipality_code, '') || '|' ||
                   COALESCE(r.outage_start_time, '') || '|' ||
                   CAST(round(COALESCE(r.centroid_lat, 0.0), 3) AS TEXT) || '|' ||
                   CAST(round(COALESCE(r.centroid_lon, 0.0), 3) AS TEXT) || '|' ||
                   COALESCE(r.interruption_type, '')
            FROM outage_records r
            WHERE r.id = address_outage_matches.record_id
        )
        WHERE outage_kind = 'outage'
          AND event_key IS NULL
        """
    )
    connection.execute(
        """
        UPDATE address_outage_matches
        SET event_key = (
            SELECT COALESCE(r.municipality_code, '') || '|' ||
                   COALESCE(r.outage_start_time, '') || '|' ||
                   CAST(round(COALESCE(r.centroid_lat, 0.0), 3) AS TEXT) || '|' ||
                   CAST(round(COALESCE(r.centroid_lon, 0.0), 3) AS TEXT) || '|' ||
                   COALESCE(r.interruption_type, '')
            FROM outage_records r
            WHERE r.id = address_outage_matches.record_id
        )
        WHERE outage_kind = 'outage'
          AND event_key != (
            SELECT COALESCE(r.municipality_code, '') || '|' ||
                   COALESCE(r.outage_start_time, '') || '|' ||
                   CAST(round(COALESCE(r.centroid_lat, 0.0), 3) AS TEXT) || '|' ||
                   CAST(round(COALESCE(r.centroid_lon, 0.0), 3) AS TEXT) || '|' ||
                   COALESCE(r.interruption_type, '')
            FROM outage_records r
            WHERE r.id = address_outage_matches.record_id
          )
        """
    )
    connection.execute(
        """
        DELETE FROM address_outage_matches
        WHERE outage_kind = 'outage'
          AND event_key IS NOT NULL
          AND id NOT IN (
            SELECT id
            FROM (
                SELECT m.id,
                       ROW_NUMBER() OVER (
                           PARTITION BY m.address_id, m.outage_kind, m.event_key
                           ORDER BY COALESCE(r.outage_start_time, m.matched_at) DESC,
                                    m.matched_at DESC,
                                    m.id DESC
                       ) AS rank
                FROM address_outage_matches m
                LEFT JOIN outage_records r ON r.id = m.record_id
                WHERE m.outage_kind = 'outage'
                  AND m.event_key IS NOT NULL
            )
            WHERE rank = 1
          )
        """
    )
    connection.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_address_outage_event
        ON address_outage_matches(address_id, outage_kind, event_key)
        WHERE event_key IS NOT NULL
        """
    )


@contextmanager
def open_db(db_path: Path):
    connection = connect(db_path)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()
