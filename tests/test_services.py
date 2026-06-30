from app.addressing import NormalizedAddress
from app.services import (
    clearly_outside_quebec_query,
    point_in_polygon,
    within_quebec_bounds,
)


def fake_montreal_geocode() -> dict[str, object]:
    return {
        "provider": "fake",
        "confidence": 0.9,
        "quality": "address",
        "latitude": 45.5,
        "longitude": -73.56,
        "city": "Montreal",
        "province": "Quebec",
        "postal_code": "H2V4G7",
        "raw_json": {},
    }


def fake_outage_match(
    *,
    record_id: object = 1,
    start_time: str = "2026-05-18 10:00:00",
    distance_m: float = 125.0,
    customers_affected: int = 10,
    status: str = "N",
    centroid_lat: float = 45.5,
    centroid_lon: float = -73.56,
) -> dict[str, object]:
    return {
        "outage_kind": "outage",
        "record_id": record_id,
        "geometry_id": None,
        "geometry_geojson": None,
        "match_type": "nearby_match",
        "distance_m": distance_m,
        "confidence": 0.8,
        "municipality_code": "Montreal",
        "customers_affected": customers_affected,
        "status": status,
        "interruption_type": "P",
        "start_time": start_time,
        "end_time": None,
        "centroid_lat": centroid_lat,
        "centroid_lon": centroid_lon,
        "sort_time": start_time,
    }


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


def test_durable_previous_archive_summary_uses_runtime_summary_endpoint(
    service_factory, monkeypatch
):
    service = service_factory(durable_runtime_url="https://example.invalid")
    summary = {
        "windows": [
            {
                "key": "previous_archive_last_24h",
                "areas": 74,
                "totalCustomers": 12604,
            }
        ],
        "largest": {
            "key": "previous_archive_largest",
            "startTime": "2026-06-13 20:19:00",
            "customersAffected": 3685,
        },
        "latest": [
            {
                "key": "previous_archive_latest",
                "startTime": "2026-06-13 20:19:00",
                "customersAffected": 3685,
                "centroidLat": 45.5,
                "centroidLon": -73.6,
            }
        ],
    }

    def fake_runtime_get(path, query=None):
        assert path == "previous-archive-summary"
        assert query is None
        return summary

    monkeypatch.setattr(service, "_durable_runtime_get", fake_runtime_get)

    assert service.previous_operational_archive_summary() == summary


def test_durable_previous_archive_summary_preserves_municipal_bins(service_factory, monkeypatch):
    service = service_factory(durable_runtime_url="https://example.invalid")
    summary = {
        "mode": "municipal_archive",
        "windows": [],
        "largest": None,
        "latest": [],
        "territories": [
            {
                "territoryId": "municipality:06066",
                "territoryName": "Montréal",
                "designation": "Municipalité",
                "eventCount": 42,
                "customersAffected": 1200,
                "latestStartTime": "2026-06-14 10:30:00",
            }
        ],
    }

    def fake_runtime_get(path, query=None):
        assert path == "previous-archive-summary"
        assert query is None
        return summary

    monkeypatch.setattr(service, "_durable_runtime_get", fake_runtime_get)

    result = service.previous_operational_archive_summary()

    assert result["mode"] == "municipal_archive"
    assert result["territories"] == summary["territories"]


def test_durable_runtime_get_caches_context_reads(service_factory, monkeypatch):
    service = service_factory(
        durable_runtime_url="https://example.invalid",
        durable_context_cache_ttl_seconds=60,
    )
    calls = []

    def fake_uncached(path, query=None):
        calls.append((path, query))
        return {"value": len(calls)}

    monkeypatch.setattr(service, "_durable_runtime_get_uncached", fake_uncached)

    first = service._durable_runtime_get("previous-map-layers", {"limit": "120"})
    second = service._durable_runtime_get("previous-map-layers", {"limit": "120"})
    other_query = service._durable_runtime_get("previous-map-layers", {"limit": "60"})
    uncached_path = service._durable_runtime_get("query-count", {"address_id": "1"})

    assert first == {"value": 1}
    assert second == {"value": 1}
    assert other_query == {"value": 2}
    assert uncached_path == {"value": 3}
    assert calls == [
        ("previous-map-layers", {"limit": "120"}),
        ("previous-map-layers", {"limit": "60"}),
        ("query-count", {"address_id": "1"}),
    ]


def test_durable_runtime_requests_include_operation_token(service_factory, monkeypatch):
    service = service_factory(
        durable_runtime_url="https://example.invalid",
        durable_runtime_operation_token="secret-token",
        durable_context_cache_ttl_seconds=0,
    )
    seen_headers = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"ok": true}'

    def fake_urlopen(request, timeout):
        seen_headers.append(dict(request.header_items()))
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    assert service._durable_runtime_get("status") == {"ok": True}
    assert service._durable_runtime_post("query", {"address_id": 1}) == {"ok": True}

    assert seen_headers == [
        {
            "User-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
            "X-pannes-operation-token": "secret-token",
        },
        {
            "Content-type": "application/json",
            "User-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
            "X-pannes-operation-token": "secret-token",
        },
    ]


def test_durable_runtime_get_does_not_cache_failed_context_reads(service_factory, monkeypatch):
    service = service_factory(
        durable_runtime_url="https://example.invalid",
        durable_context_cache_ttl_seconds=60,
    )
    calls = []
    responses = iter([None, {"layers": []}])

    def fake_uncached(path, query=None):
        calls.append((path, query))
        return next(responses)

    monkeypatch.setattr(service, "_durable_runtime_get_uncached", fake_uncached)

    assert service._durable_runtime_get("previous-map-layers", {"limit": "48"}) is None
    assert service._durable_runtime_get("previous-map-layers", {"limit": "48"}) == {"layers": []}
    assert calls == [
        ("previous-map-layers", {"limit": "48"}),
        ("previous-map-layers", {"limit": "48"}),
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


def test_archived_outage_matches_populate_previous_groups_when_runtime_has_none(
    service_factory, monkeypatch
):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    monkeypatch.setattr(service, "_upsert_address", lambda normalized, geocode: (7, True))
    monkeypatch.setattr(service, "_find_current_matches", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        service,
        "_find_archived_outage_matches",
        lambda *args, **kwargs: [
            {
                "outage_kind": "outage",
                "record_id": "event-1",
                "geometry_id": None,
                "geometry_geojson": None,
                "match_type": "nearby_match",
                "distance_m": 125.0,
                "confidence": 0.8,
                "municipality_code": "Montreal",
                "customers_affected": 10,
                "status": "N",
                "interruption_type": "P",
                "start_time": "2026-05-18 10:00:00",
                "end_time": None,
                "centroid_lat": 45.5,
                "centroid_lon": -73.56,
                "sort_time": "2026-05-18 10:00:00",
            }
        ],
    )
    monkeypatch.setattr(service, "_previous_outage_groups", lambda **kwargs: [])
    monkeypatch.setattr(service, "_query_count", lambda address_id: 0)
    monkeypatch.setattr(
        service.geocoder,
        "geocode",
        lambda normalized: {
            "provider": "fake",
            "confidence": 0.9,
            "quality": "address",
            "latitude": 45.5,
            "longitude": -73.56,
            "city": "Montreal",
            "province": "Quebec",
            "postal_code": "H2V4G7",
            "raw_json": {},
        },
    )

    result = service.search(
        query="5220 Rue Jeanne-Mance",
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
        record_history=False,
    )

    assert len(result.previous_outage_groups) == 1
    assert result.previous_outage_groups[0]["event_count"] == 1
    assert result.previous_outage_groups[0]["events"][0]["start_time"] == "2026-05-18 10:00:00"


def test_address_search_without_history_or_map_layers_stays_read_only(service_factory, monkeypatch):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    monkeypatch.setattr(
        service.geocoder,
        "geocode",
        lambda normalized: fake_montreal_geocode(),
    )
    monkeypatch.setattr(service, "_upsert_address", lambda normalized, geocode: (7, True))
    monkeypatch.setattr(
        service,
        "_find_current_matches",
        lambda latitude, longitude, radius_m, days, include_planned: [fake_outage_match()],
    )
    monkeypatch.setattr(service, "_find_archived_outage_matches", lambda *args, **kwargs: [])
    monkeypatch.setattr(service, "_previous_outage_groups", lambda **kwargs: [])
    monkeypatch.setattr(service, "_query_count", lambda address_id: 3)
    monkeypatch.setattr(
        service,
        "_current_operational_map_layers",
        lambda include_planned: (_ for _ in ()).throw(
            AssertionError("current map layers should not be built")
        ),
    )
    monkeypatch.setattr(
        service,
        "_previous_operational_map_layers",
        lambda: (_ for _ in ()).throw(AssertionError("previous map layers should not be built")),
    )
    monkeypatch.setattr(
        service,
        "_disclosure_map_layers",
        lambda: (_ for _ in ()).throw(AssertionError("disclosure layers should not be built")),
    )
    monkeypatch.setattr(
        service,
        "_regional_metric_map_layers",
        lambda: (_ for _ in ()).throw(AssertionError("regional metric layers should not be built")),
    )
    monkeypatch.setattr(
        service,
        "_save_matches",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("read-only search should not save matches")
        ),
    )
    monkeypatch.setattr(
        service,
        "_record_query",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("read-only search should not record query history")
        ),
    )

    result = service.search(
        query="5220 Rue Jeanne-Mance",
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
        include_map_layers=False,
        record_history=False,
    )

    assert result.error is None
    assert result.query_count == 3
    assert len(result.outage_matches) == 1
    assert result.current_map_layers == []
    assert result.previous_map_layers == []
    assert result.disclosure_layers == []
    assert result.regional_metric_layers == []


def test_location_search_records_current_and_archived_matches(service_factory, monkeypatch):
    service = service_factory(auto_refresh_on_search=False)
    monkeypatch.setattr(service, "collector_status", lambda: {"snapshot_count": 0})
    monkeypatch.setattr(service, "coverage_stats", lambda: {"outage_count": 0})
    monkeypatch.setattr(service, "_upsert_address", lambda normalized, geocode: (7, True))
    current_match = fake_outage_match(record_id="current-1")
    archived_match = fake_outage_match(
        record_id="archived-1",
        start_time="2026-05-17 09:00:00",
        distance_m=200.0,
        customers_affected=15,
        status="R",
        centroid_lat=45.51,
        centroid_lon=-73.57,
    )
    monkeypatch.setattr(
        service,
        "_find_current_matches",
        lambda latitude, longitude, radius_m, days, include_planned: [current_match],
    )

    archived_calls = []

    def fake_archived_matches(*args, **kwargs):
        archived_calls.append(kwargs)
        return [archived_match]

    monkeypatch.setattr(service, "_find_archived_outage_matches", fake_archived_matches)
    monkeypatch.setattr(service, "_current_operational_map_layers", lambda include_planned: [])
    monkeypatch.setattr(service, "_previous_operational_map_layers", lambda: [])
    monkeypatch.setattr(service, "_disclosure_map_layers", lambda: [])
    monkeypatch.setattr(service, "_regional_metric_map_layers", lambda: [])
    monkeypatch.setattr(service, "_previous_outage_groups", lambda **kwargs: [])
    saved_matches = []
    recorded_queries = []
    monkeypatch.setattr(
        service,
        "_save_matches",
        lambda address_id, matches: saved_matches.append((address_id, matches)),
    )
    monkeypatch.setattr(
        service,
        "_record_query",
        lambda **kwargs: recorded_queries.append(kwargs) or 4,
    )

    result = service.search_location(
        latitude=45.5,
        longitude=-73.56,
        accuracy_m=20,
        language="en",
        radius_m=5000,
        days=1825,
        include_planned=True,
        record_history=True,
    )

    assert result.error is None
    assert result.query_count == 4
    assert archived_calls[0]["exclude_event_keys"] == {service._outage_display_key(current_match)}
    assert saved_matches == [(7, [current_match, archived_match])]
    assert recorded_queries[0]["original_query"] == "Current location (45.50000, -73.56000)"
    assert recorded_queries[0]["normalized_query"] == "current location 45.50000,-73.56000"


def test_current_operational_map_layers_prefers_durable_feed(service_factory, monkeypatch):
    service = service_factory(durable_nearby_url="https://example.invalid/api/durable/nearby")
    monkeypatch.setattr(
        service,
        "_durable_current_operational_map_layers",
        lambda: [
            {"outage_kind": "outage", "start_time": "2026-05-19 08:22:00"},
            {"outage_kind": "planned", "start_time": "2026-05-20 09:30:00"},
        ],
    )
    monkeypatch.setattr(
        service,
        "_map_layers_for_rows",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("local fallback should not run")),
    )

    layers = service._build_current_operational_map_layers(include_planned=False)

    assert layers == [{"outage_kind": "outage", "start_time": "2026-05-19 08:22:00"}]


def test_current_operational_map_layers_refreshes_durable_feed(service_factory, monkeypatch):
    service = service_factory(durable_nearby_url="https://example.invalid/api/durable/nearby")
    calls = iter(
        [
            [{"outage_kind": "outage", "record_id": "old", "start_time": "2026-05-19 08:22:00"}],
            [{"outage_kind": "outage", "record_id": "new", "start_time": "2026-05-19 17:15:50"}],
        ]
    )
    monkeypatch.setattr(service, "_durable_current_operational_map_layers", lambda: next(calls))
    monkeypatch.setattr(
        service,
        "_map_layers_for_rows",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("local fallback should not run")),
    )

    first_layers = service._current_operational_map_layers(include_planned=False)
    second_layers = service._current_operational_map_layers(include_planned=False)

    assert first_layers == [
        {"outage_kind": "outage", "record_id": "old", "start_time": "2026-05-19 08:22:00"}
    ]
    assert second_layers == [
        {"outage_kind": "outage", "record_id": "new", "start_time": "2026-05-19 17:15:50"}
    ]


def test_previous_map_layers_group_by_stable_area_key(service_factory):
    service = service_factory()
    rows = [
        {
            "id": 1,
            "source_version": "v1",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "outage_start_time": "2026-05-31 13:52:04",
            "estimated_restore_time": None,
            "customers_affected": 2,
            "status": "N",
            "municipality_code": "mun-1",
            "interruption_type": "P",
        },
        {
            "id": 2,
            "source_version": "v2",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "outage_start_time": "2026-05-31 13:52:04",
            "estimated_restore_time": None,
            "customers_affected": 2,
            "status": "N",
            "municipality_code": "mun-1",
            "interruption_type": "P",
        },
    ]
    geometry_payload = [
        {
            "id": 10,
            "source_version": "v1",
            "polygon_id": "snapshot-area-107",
            "name": "Stable area",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "bbox_min_lon": -74.2,
            "bbox_min_lat": 45.14,
            "bbox_max_lon": -74.19,
            "bbox_max_lat": 45.15,
            "geometry_geojson": (
                '{"type":"Polygon","coordinates":[[[-74.2,45.14],[-74.19,45.14],'
                "[-74.19,45.15],[-74.2,45.15],[-74.2,45.14]]]}"
            ),
        },
        {
            "id": 11,
            "source_version": "v2",
            "polygon_id": "snapshot-area-102",
            "name": "Stable area",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "bbox_min_lon": -74.2,
            "bbox_min_lat": 45.14,
            "bbox_max_lon": -74.19,
            "bbox_max_lat": 45.15,
            "geometry_geojson": (
                '{"type":"Polygon","coordinates":[[[-74.2,45.14],[-74.19,45.14],'
                "[-74.19,45.15],[-74.2,45.15],[-74.2,45.14]]]}"
            ),
        },
    ]

    layers = service._map_layers_for_rows(
        rows=rows,
        geometry_payload=geometry_payload,
        outage_kind="previous_outage",
    )

    assert len(layers) == 1
    assert layers[0]["event_count"] == 1
    assert layers[0]["customers_affected"] == 2
    assert len(layers[0]["recent_events"]) == 1


def test_previous_map_layers_use_peak_clients_for_reused_area(service_factory):
    service = service_factory()
    rows = [
        {
            "id": 1,
            "source_version": "v1",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "outage_start_time": "2026-05-31 13:52:04",
            "estimated_restore_time": None,
            "customers_affected": 2,
            "status": "N",
            "municipality_code": "mun-1",
            "interruption_type": "P",
        },
        {
            "id": 2,
            "source_version": "v1",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "outage_start_time": "2026-06-01 13:52:04",
            "estimated_restore_time": None,
            "customers_affected": 9,
            "status": "N",
            "municipality_code": "mun-1",
            "interruption_type": "P",
        },
    ]
    geometry_payload = [
        {
            "id": 10,
            "source_version": "v1",
            "polygon_id": "snapshot-area-107",
            "name": "Stable area",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "bbox_min_lon": -74.2,
            "bbox_min_lat": 45.14,
            "bbox_max_lon": -74.19,
            "bbox_max_lat": 45.15,
            "geometry_geojson": (
                '{"type":"Polygon","coordinates":[[[-74.2,45.14],[-74.19,45.14],'
                "[-74.19,45.15],[-74.2,45.15],[-74.2,45.14]]]}"
            ),
        }
    ]

    layers = service._map_layers_for_rows(
        rows=rows,
        geometry_payload=geometry_payload,
        outage_kind="previous_outage",
    )

    assert len(layers) == 1
    assert layers[0]["event_count"] == 2
    assert layers[0]["customers_affected"] == 9


def test_planned_map_layers_use_peak_clients_for_reused_area(service_factory):
    service = service_factory()
    rows = [
        {
            "id": 1,
            "source_version": "v1",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "scheduled_start": "2026-06-10 08:00:00",
            "scheduled_end": "2026-06-10 12:00:00",
            "customers_affected": 61,
            "status": "N",
            "municipality_code": "mun-1",
        },
        {
            "id": 2,
            "source_version": "v1",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "scheduled_start": "2026-06-11 08:00:00",
            "scheduled_end": "2026-06-11 12:00:00",
            "customers_affected": 125,
            "status": "N",
            "municipality_code": "mun-1",
        },
    ]
    geometry_payload = [
        {
            "id": 10,
            "source_version": "v1",
            "polygon_id": "planned-area-1",
            "name": "Planned area",
            "centroid_lat": 45.14447149313006,
            "centroid_lon": -74.19701651273986,
            "bbox_min_lon": -74.2,
            "bbox_min_lat": 45.14,
            "bbox_max_lon": -74.19,
            "bbox_max_lat": 45.15,
            "geometry_geojson": (
                '{"type":"Polygon","coordinates":[[[-74.2,45.14],[-74.19,45.14],'
                "[-74.19,45.15],[-74.2,45.15],[-74.2,45.14]]]}"
            ),
        }
    ]

    layers = service._map_layers_for_rows(
        rows=rows,
        geometry_payload=geometry_payload,
        outage_kind="planned",
    )

    assert len(layers) == 1
    assert layers[0]["event_count"] == 2
    assert layers[0]["customers_affected"] == 125
    assert [event["customers_affected"] for event in layers[0]["recent_events"]] == [61, 125]
