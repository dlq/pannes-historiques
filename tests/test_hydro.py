import pytest

from app.config import Settings
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
    assert result["errors"] == [
        {"source": "bis", "error": "version fetch failed for bis: HTTP 503"}
    ]
