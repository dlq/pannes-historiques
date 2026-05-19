from app.addressing import NormalizedAddress
from app.services import (
    clearly_outside_quebec_query,
    point_in_polygon,
    within_quebec_bounds,
)


def test_point_in_polygon_detects_inside_and_outside_points():
    polygon = [[-73.61, 45.51], [-73.59, 45.51], [-73.59, 45.53], [-73.61, 45.53]]

    assert point_in_polygon(-73.60, 45.52, polygon) is True
    assert point_in_polygon(-73.70, 45.52, polygon) is False


def test_within_quebec_bounds_handles_simple_cases():
    assert within_quebec_bounds(45.5019, -73.5674) is True
    assert within_quebec_bounds(43.7, -79.4) is False


def test_clearly_outside_quebec_query_flags_ottawa_ontario():
    normalized = NormalizedAddress(
        original="111 Wellington St, Ottawa, ON",
        normalized_line="111 wellington st, ottawa, ON",
        street_line="111 wellington st",
        city="ottawa",
        province="ON",
        postal_code="K1A0A9",
        unit="",
    )

    assert clearly_outside_quebec_query(normalized) is True


def test_clearly_outside_quebec_query_does_not_flag_montreal():
    normalized = NormalizedAddress(
        original="5220 Rue Jeanne-Mance, Montreal, QC",
        normalized_line="5220 rue jeanne-mance, montreal, QC",
        street_line="5220 rue jeanne-mance",
        city="montreal",
        province="QC",
        postal_code="H2V4G7",
        unit="",
    )

    assert clearly_outside_quebec_query(normalized) is False


def test_search_returns_outside_quebec_without_geocoding(service_factory, monkeypatch):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    geocode_calls: list[object] = []
    monkeypatch.setattr(
        service.geocoder,
        "geocode",
        lambda normalized: geocode_calls.append(normalized),
    )

    result = service.search(
        query="111 Wellington St, Ottawa, ON",
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
    )

    assert result.error == "outside_quebec"
    assert result.geocode is None
    assert geocode_calls == []


def test_search_returns_geocode_failed_when_provider_returns_none(service_factory, monkeypatch):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    monkeypatch.setattr(service.geocoder, "geocode", lambda normalized: None)

    result = service.search(
        query="5220 Rue Jeanne-Mance, Montreal, QC",
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
    )

    assert result.error == "geocode_failed"
    assert result.geocode is None
    assert result.outage_matches == []


def test_search_rejects_geocoded_location_outside_quebec(service_factory, monkeypatch):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    monkeypatch.setattr(
        service.geocoder,
        "geocode",
        lambda normalized: {
            "provider": "fake",
            "confidence": 0.9,
            "quality": "address",
            "latitude": 43.6532,
            "longitude": -79.3832,
            "city": "Toronto",
            "province": "Ontario",
            "postal_code": "M5H2N2",
            "raw_json": {},
        },
    )

    result = service.search(
        query="5220 Rue Jeanne-Mance, Montreal, QC",
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
    )

    assert result.error == "outside_quebec"
    assert result.geocode["city"] == "Toronto"


def test_search_location_returns_outside_quebec_for_non_quebec_coordinates(
    service_factory, monkeypatch
):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})

    result = service.search_location(
        latitude=43.6532,
        longitude=-79.3832,
        accuracy_m=25,
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
    )

    assert result.error == "outside_quebec"
    assert result.geocode["provider"] == "browser_geolocation"


def test_search_location_uses_operational_map_layers_with_durable_nearby(
    service_factory, monkeypatch
):
    service = service_factory(
        auto_refresh_on_search=False, durable_nearby_url="https://example.invalid"
    )
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    monkeypatch.setattr(service, "_upsert_address", lambda normalized, geocode: (7, True))
    monkeypatch.setattr(
        service,
        "_find_current_matches",
        lambda latitude, longitude, radius_m, days, include_planned: [
            {
                "outage_kind": "outage",
                "record_id": 1,
                "geometry_id": None,
                "geometry_geojson": None,
                "match_type": "nearby_match",
                "distance_m": 125.0,
                "confidence": 0.8,
                "municipality_code": "Montreal",
                "customers_affected": 10,
                "status": "N",
                "interruption_type": "P",
                "start_time": "2026-05-08 10:00:00",
                "end_time": None,
                "centroid_lat": 45.5,
                "centroid_lon": -73.56,
                "sort_time": "2026-05-08 10:00:00",
            }
        ],
    )
    map_layers = [
        {
            "outage_kind": "outage",
            "record_id": "map-1",
            "geometry_id": "g-1",
            "geometry_geojson": {"type": "Polygon", "coordinates": []},
            "match_type": "current_feed_map",
            "distance_m": None,
            "confidence": 0.5,
            "municipality_code": "Montreal",
            "customers_affected": 10,
            "status": "N",
            "interruption_type": "P",
            "start_time": "2026-05-08 10:00:00",
            "end_time": None,
            "centroid_lat": 45.5,
            "centroid_lon": -73.56,
            "sort_time": "2026-05-08 10:00:00",
        }
    ]
    monkeypatch.setattr(
        service, "_current_operational_map_layers", lambda include_planned: map_layers
    )
    monkeypatch.setattr(service, "_find_archived_outage_matches", lambda *args, **kwargs: [])
    monkeypatch.setattr(service, "_previous_outage_groups", lambda **kwargs: [])
    monkeypatch.setattr(service, "_query_count", lambda address_id: 3)

    result = service.search_location(
        latitude=45.5,
        longitude=-73.56,
        accuracy_m=20,
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
        include_map_layers=True,
        record_history=False,
    )

    assert result.error is None
    assert result.query_count == 3
    assert result.current_map_layers == map_layers
    assert result.normalized.normalized_line == "current location 45.50000,-73.56000"


def test_durable_runtime_operational_and_previous_map_layers(service_factory, monkeypatch):
    service = service_factory(durable_runtime_url="https://example.invalid")

    def fake_runtime_get(path, query=None):
        if path == "operational-map-layers":
            assert query == {"include_planned": "1"}
            return {"layers": [{"outage_kind": "outage", "geometry_geojson": {}}]}
        if path == "previous-map-layers":
            assert query == {"limit": "12"}
            return {"layers": [{"outage_kind": "previous_outage"}]}
        raise AssertionError(path)

    monkeypatch.setattr(service, "_durable_runtime_get", fake_runtime_get)

    assert service._build_current_operational_map_layers(True) == [
        {"outage_kind": "outage", "geometry_geojson": {}}
    ]
    assert service._build_previous_operational_map_layers(12) == [
        {"outage_kind": "previous_outage"}
    ]


def test_find_current_matches_returns_durable_matches_without_local_fallback(
    service_factory, monkeypatch
):
    service = service_factory(durable_nearby_url="https://example.invalid")
    sentinel = [{"record_id": 1, "outage_kind": "outage"}]
    monkeypatch.setattr(service, "_find_durable_current_matches", lambda **kwargs: sentinel)
    monkeypatch.setattr(
        service,
        "_match_rows",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("local fallback should not run")),
    )

    matches = service._find_current_matches(45.5, -73.56, 5000, 1825, True)

    assert matches == sentinel


def test_find_archived_outage_matches_falls_back_to_local_when_durable_unavailable(
    service_factory, monkeypatch
):
    service = service_factory(durable_history_url="https://example.invalid")
    monkeypatch.setattr(service, "_find_durable_archived_outage_matches", lambda **kwargs: None)
    monkeypatch.setattr(
        service,
        "_match_rows",
        lambda **kwargs: [
            {
                "outage_kind": "outage",
                "municipality_code": "Montreal",
                "start_time": "2026-05-08 10:00:00",
                "centroid_lat": 45.5,
                "centroid_lon": -73.56,
                "interruption_type": "P",
                "confidence": 0.8,
                "sort_time": "2026-05-08 10:00:00",
            }
        ],
    )

    matches = service._find_archived_outage_matches(
        45.5,
        -73.56,
        5000,
        1825,
        exclude_event_keys=set(),
    )

    assert len(matches) == 1
    assert matches[0]["municipality_code"] == "Montreal"
