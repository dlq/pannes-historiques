import json

import pytest

from app.config import Settings
from app.db import initialize, open_db
from app.hydro import HydroCollector, maybe_int, parse_centroid, parse_kml_polygons, safe_get


def test_maybe_int_handles_feed_nulls_and_numeric_strings():
    assert maybe_int(None) is None
    assert maybe_int("") is None
    assert maybe_int("null") is None
    assert maybe_int("42") == 42
    assert maybe_int("42.5") is None


def test_parse_centroid_accepts_feed_arrays_and_string_coordinates():
    assert parse_centroid([45.52, -73.6]) == (45.52, -73.6)
    assert parse_centroid("[45.52, -73.6]") == (45.52, -73.6)
    assert parse_centroid("") == (None, None)
    assert parse_centroid(None) == (None, None)


@pytest.mark.parametrize("raw", (["longitude", "latitude"], "[longitude, latitude]"))
def test_parse_centroid_rejects_malformed_coordinate_values(raw):
    assert parse_centroid(raw) == (None, None)


def test_safe_get_returns_none_for_missing_feed_columns():
    assert safe_get(["a", "b"], 1) == "b"
    assert safe_get(["a", "b"], 4) is None


def test_parse_kml_polygons_extracts_geometry_bbox_and_centroid():
    kml = """
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Document>
        <Placemark>
          <name>poly-1</name>
          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>
                  -73.62,45.50,0 -73.58,45.50,0 -73.58,45.54,0 -73.62,45.54,0 -73.62,45.50,0
                </coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
        </Placemark>
        <Placemark>
          <name>line-only</name>
          <LineString>
            <coordinates>-73.6,45.5,0 -73.5,45.6,0</coordinates>
          </LineString>
        </Placemark>
        <Placemark>
          <name>too-small</name>
          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>-73.6,45.5,0 -73.5,45.6,0</coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
        </Placemark>
      </Document>
    </kml>
    """

    features = parse_kml_polygons(kml)

    assert features == [
        {
            "polygon_id": "poly-1",
            "name": "poly-1",
            "centroid_lon": -73.604,
            "centroid_lat": 45.516,
            "bbox": [-73.62, 45.5, -73.58, 45.54],
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-73.62, 45.5],
                        [-73.58, 45.5],
                        [-73.58, 45.54],
                        [-73.62, 45.54],
                        [-73.62, 45.5],
                    ]
                ],
            },
            "raw_coordinates": "-73.62,45.50,0 -73.58,45.50,0 -73.58,45.54,0 -73.62,45.54,0 -73.62,45.50,0",
        }
    ]


def test_parse_kml_polygons_skips_malformed_coordinate_records():
    kml = """
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Placemark>
        <name>invalid</name>
        <Polygon><outerBoundaryIs><LinearRing>
          <coordinates>-73.6,45.5 invalid,coordinate -73.5,45.6</coordinates>
        </LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
    </kml>
    """

    assert parse_kml_polygons(kml) == []


@pytest.mark.parametrize(
    ("source_type", "payload", "record_table", "event_kind"),
    [
        (
            "bismarkers",
            {
                "pannes": [
                    [42, "2026-01-02 03:04:05", None, "P", [-73.6, 45.5], "N", "C", "D", "66023"]
                ]
            },
            "outage_records",
            "outage",
        ),
        (
            "aipmarkers",
            [
                [
                    None,
                    "notice-1",
                    "2026-01-02 03:04:05",
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    "18",
                    None,
                    None,
                    "66023",
                    "A",
                    [-73.6, 45.5],
                ]
            ],
            "planned_interruptions",
            "planned",
        ),
    ],
)
def test_ingest_markers_stores_feed_records_and_resolved_events(
    tmp_path, source_type, payload, record_table, event_kind
):
    collector = HydroCollector(Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db"))
    initialize(collector.settings.db_path)
    payload_bytes = json.dumps(payload).encode()
    snapshot = collector._store_snapshot(
        source_type=source_type,
        version="fixture",
        fetched_at="2026-01-02T03:04:05+00:00",
        payload=payload_bytes,
        content_type="application/json",
        extension="json",
    )
    collector._register_snapshot(snapshot)

    collector._ingest_markers(snapshot, payload_bytes)

    with open_db(collector.settings.db_path) as connection:
        record = connection.execute(f"SELECT * FROM {record_table}").fetchone()
        event = connection.execute("SELECT * FROM resolved_events").fetchone()
    assert record is not None
    assert event is not None
    assert event["outage_kind"] == event_kind
    assert event["source_versions"] == "fixture"


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (b'"20260710103008"', "20260710103008"),
        (b'{"version": "20260710103008"}', "20260710103008"),
        (b'{"bis": 20260710103008}', "20260710103008"),
    ],
)
def test_parse_version_accepts_hydro_payload_shapes(payload, expected):
    assert HydroCollector._parse_version(payload) == expected


def test_parse_version_rejects_unexpected_payload_shape():
    with pytest.raises(RuntimeError, match="unexpected version payload"):
        HydroCollector._parse_version(b"[]")

    with pytest.raises(RuntimeError, match="unexpected version payload"):
        HydroCollector._parse_version(b"{}")


def test_collection_orchestration_keeps_successful_source_when_the_other_fails(
    tmp_path, monkeypatch
):
    collector = HydroCollector(Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db"))

    def collect_source(source):
        if source == "bis":
            return {"snapshots": ["bis-snapshot"], "errors": []}
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr(collector, "collect_source", collect_source)

    assert collector.collect_all() == {
        "snapshots": ["bis-snapshot"],
        "errors": [{"source": "aip", "error": "collection failed"}],
    }


def test_changed_collection_summaries_keep_versions_snapshots_and_errors(tmp_path, monkeypatch):
    collector = HydroCollector(Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db"))
    monkeypatch.setattr(
        collector,
        "collect_source_if_changed",
        lambda source: {
            "version": f"{source}-version",
            "changed": source == "bis",
            "snapshots": [source],
            "errors": [] if source == "bis" else [{"source": source, "error": "collection failed"}],
        },
    )

    assert collector.collect_changed() == {
        "sources": [
            {"source": "bis", "version": "bis-version", "changed": True},
            {"source": "aip", "version": "aip-version", "changed": False},
        ],
        "snapshots": ["bis", "aip"],
        "errors": [{"source": "aip", "error": "collection failed"}],
    }


def test_collect_source_if_changed_against_skips_known_version(tmp_path, monkeypatch):
    collector = HydroCollector(Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db"))
    monkeypatch.setattr(
        "app.hydro.fetch_bytes",
        lambda _url: (b'{"version": "v-known"}', 200, "application/json"),
    )
    monkeypatch.setattr(
        collector,
        "_fetch_payload_files",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("unchanged versions must not fetch payload files")
        ),
    )

    result = collector.collect_source_if_changed_against("bis", "v-known")

    assert result == {
        "source": "bis",
        "version": "v-known",
        "changed": False,
        "snapshots": [],
        "errors": [],
    }


def test_collect_source_if_changed_against_fetches_new_version(tmp_path, monkeypatch):
    collector = HydroCollector(Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db"))
    version_payload = b'{"version": "v-new"}'
    monkeypatch.setattr(
        "app.hydro.fetch_bytes",
        lambda _url: (version_payload, 200, "application/json"),
    )
    calls = []

    def fake_fetch_payload_files(source, version, **kwargs):
        calls.append((source, version, kwargs))
        return ["snapshot"]

    monkeypatch.setattr(collector, "_fetch_payload_files", fake_fetch_payload_files)

    result = collector.collect_source_if_changed_against("aip", "v-old")

    assert result["changed"] is True
    assert result["version"] == "v-new"
    assert result["snapshots"] == ["snapshot"]
    assert result["errors"] == []
    assert calls == [
        (
            "aip",
            "v-new",
            {
                "version_payload": version_payload,
                "version_content_type": "application/json",
            },
        )
    ]


def test_collect_source_if_changed_against_reports_version_fetch_failure(tmp_path, monkeypatch):
    collector = HydroCollector(Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db"))
    monkeypatch.setattr(
        "app.hydro.fetch_bytes",
        lambda _url: (b"upstream unavailable", 503, "text/plain"),
    )

    result = collector.collect_source_if_changed_against("bis", None)

    assert result["changed"] is False
    assert result["snapshots"] == []
    assert result["errors"] == [{"source": "bis", "error": "collection failed"}]


def test_durable_fetch_registers_snapshots_for_worker_lookup(tmp_path, monkeypatch):
    """The durable path must record raw_snapshots rows.

    The Worker fetches these payloads back out of the container by
    (source_type, source_version) via /internal/raw-snapshot. If the durable
    collection path stores the file without registering the row, that lookup
    404s and every scheduled ingestion fails -- which is exactly what broke
    production ingestion for five days.
    """
    from app.config import Settings
    from app.db import initialize, open_db
    from app.hydro import HydroCollector

    settings = Settings(raw_dir=tmp_path / "raw", db_path=tmp_path / "app.db")
    initialize(settings.db_path)
    collector = HydroCollector(settings)

    def fake_fetch_bytes(url):
        if url.endswith("version.json"):
            return b'{"version":"V1"}', 200, "application/json"
        return b"payload-bytes", 200, "application/json"

    monkeypatch.setattr("app.hydro.fetch_bytes", fake_fetch_bytes)
    monkeypatch.setattr(HydroCollector, "_parse_version", lambda self, payload: "V1")

    result = collector.collect_changed_against({"bis": None, "aip": None})
    assert not result["errors"]

    with open_db(settings.db_path) as connection:
        rows = connection.execute(
            "SELECT source_type, source_version FROM raw_snapshots ORDER BY source_type"
        ).fetchall()
    registered = {(r["source_type"], r["source_version"]) for r in rows}
    assert registered, "durable collection registered no raw_snapshots rows"

    # Every snapshot returned to the Worker must be resolvable by the same
    # (source_type, source_version) lookup the Worker uses.
    from app.services import AppService

    service = AppService(settings)
    for snapshot in result["snapshots"]:
        assert (snapshot.source_type, snapshot.version) in registered
        assert (
            service.raw_snapshot_payload_path(snapshot.source_type, snapshot.version) is not None
        ), f"Worker lookup would 404 for {snapshot.source_type}"
