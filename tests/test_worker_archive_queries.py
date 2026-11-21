"""Exercise Worker SQL against SQLite with historical, duplicate and overlap rows."""

import re
import sqlite3
from pathlib import Path

WORKER = Path("src/worker.js").read_text()


def query_for(function):
    body = WORKER[WORKER.index(f"async function {function}(") :]
    return re.search(r"\x60(.*?)\x60", body, re.S).group(1)


def archive_db():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE previous_outage_territory_bins (
          assignment_type TEXT, territory_id TEXT, territory_name TEXT,
          hydro_polygon_id TEXT, event_count INTEGER, max_customers INTEGER,
          latest_start_time TEXT, last_seen_at TEXT, updated_at TEXT NOT NULL
        );
    """)
    migration = Path("migrations/0013_d1_row_read_indexes.sql").read_text()
    index = re.search(
        r"CREATE INDEX IF NOT EXISTS idx_previous_outage_territory_bins_latest_dedupe.*?;",
        migration,
        re.S,
    ).group()
    db.execute(index)
    return db


def test_archive_latest_preserves_duplicate_winner_and_uses_ordered_index():
    db = archive_db()
    rows = []
    for i in range(1, 31):
        stamp = f"2026-11-{i:02d} 10:00:00"
        rows.append(("primary", f"town-{i:02d}", "Town", f"p-{i}", 1, i, stamp, None, stamp))
    # Same territory/time chooses newest updated_at, then greatest polygon id.
    rows += [
        ("primary", "town-30", "Town", "z", 1, 500, "2026-11-30 10:00:00", None, "2026-12-01"),
        ("primary", "town-30", "Town", "zz", 1, 600, "2026-11-30 10:00:00", None, "2026-12-01"),
        ("overlap", "town-30", "Other", "zzz", 1, 900, "2026-11-30 10:00:00", None, "2026-12-02"),
        (
            "primary",
            "town-29",
            "Town",
            "fallback",
            1,
            400,
            None,
            "2026-11-30 10:00:00",
            "2026-12-01",
        ),
        ("primary", "old", "Old", "old", 1, 1, "2024-01-01", None, "2026-12-01"),
    ]
    db.executemany("INSERT INTO previous_outage_territory_bins VALUES (?,?,?,?,?,?,?,?,?)", rows)
    sql = query_for("municipalArchiveLatest")
    result = [dict(row) for row in db.execute(sql, ("2026-01-01",))]
    assert len(result) == 20
    assert [(row["territory_id"], row["max_customers"]) for row in result[:3]] == [
        ("town-29", 400),
        ("town-30", 600),
        ("town-29", 29),
    ]
    assert len({(row["territory_id"], row["sort_time"]) for row in result}) == 20
    plan = " ".join(
        row["detail"] for row in db.execute("EXPLAIN QUERY PLAN " + sql, ("2026-01-01",))
    )
    assert "TEMP B-TREE" not in plan


def test_archive_windows_preserve_boundaries_nulls_and_primary_only_counts():
    db = archive_db()
    db.executemany(
        "INSERT INTO previous_outage_territory_bins VALUES (?,?,?,?,?,?,?,?,?)",
        [
            ("primary", "a", "A", "a", 3, 10, "2026-11-20", None, "2026-11-21"),
            ("primary", "b", "B", "b", None, None, None, "2026-11-14", "2026-11-21"),
            ("primary", "c", "C", "c", 2, 50, None, None, "2026-10-22"),
            ("primary", "d", "D", "d", 4, 70, "2025-11-21", None, "2026-11-21"),
            ("primary", "e", "E", "e", 99, 999, "2025-11-20", None, "2026-11-21"),
            ("overlap", "a", "A", "a", 3, 10, "2026-11-20", None, "2026-11-21"),
        ],
    )
    cutoffs = (
        "2026-11-20",
        "2026-11-20",
        "2026-11-14",
        "2026-11-14",
        "2026-10-22",
        "2026-10-22",
        "2025-11-21",
    )
    row = dict(db.execute(query_for("municipalArchiveWindows"), cutoffs).fetchone())
    assert [row[f"outages_{window}"] for window in ["24h", "7d", "30d", "1y"]] == [3, 4, 6, 10]
    assert [row[f"customers_{window}"] for window in ["24h", "7d", "30d", "1y"]] == [
        10,
        10,
        60,
        130,
    ]
