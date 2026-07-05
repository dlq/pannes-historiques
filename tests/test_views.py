from types import SimpleNamespace

from conftest import make_search_result

from app.views import (
    context_geometry_payload,
    default_map_payload,
    hydro_status_label,
    result_context,
)


def test_result_context_builds_display_address_and_map_payload():
    result = make_search_result()
    context = result_context("en", result)

    assert context["display_address"] == "5220 Rue Jeanne-Mance, Montreal, Quebec, H2V 4G7"
    assert context["map_payload"]["radiusM"] == 5000
    assert context["map_payload"]["contextGeometryUrl"] == "/map-context-geometries"


def test_result_context_uses_local_previous_groups_for_search_context():
    result = make_search_result()
    result.previous_outage_groups = [
        {
            "centroid_lat": 45.7,
            "centroid_lon": -73.8,
            "label": "Address saved group",
            "events": [
                {
                    "distance_m": 50,
                    "customers_affected": 99,
                    "status": "R",
                    "start_time": "2026-01-01 09:00:00",
                }
            ],
            "event_count": 1,
            "latest_start_time": "2026-01-01 09:00:00",
        }
    ]
    result.previous_map_layers = [
        {
            "outage_kind": "previous_outage",
            "match_type": "previous_context_map",
            "centroid_lat": 45.52,
            "centroid_lon": -73.61,
            "start_time": "2026-05-15 10:00:00",
            "end_time": "2026-05-15 12:00:00",
            "geometry_geojson": None,
            "customers_affected": 9,
            "distance_m": None,
            "status": "R",
            "municipality_code": "66023",
            "event_count": 1,
            "recent_events": [],
        }
    ]

    context = result_context("en", result)
    previous_items = [
        item for item in context["map_payload"]["matches"] if item["kind"] == "previous_outage"
    ]

    assert len(previous_items) == 1
    assert previous_items[0]["matchType"] == "previous_query_match"
    assert previous_items[0]["customersAffected"] == 99


def test_result_context_marks_previous_section_as_seen_before_here_for_address():
    result = make_search_result()

    context = result_context("en", result)

    assert context["map_payload"]["previousMode"] == "seen_before_here"


def test_result_context_summarizes_local_previous_evidence_for_address():
    result = make_search_result()
    result.previous_outage_groups = [
        {
            "centroid_lat": 45.7,
            "centroid_lon": -73.8,
            "label": "Address saved group",
            "events": [
                {
                    "distance_m": 50,
                    "customers_affected": 99,
                    "status": "R",
                    "start_time": "2026-01-01 09:00:00",
                }
            ],
            "event_count": 1,
            "latest_start_time": "2026-01-01 09:00:00",
        },
        {
            "centroid_lat": 45.71,
            "centroid_lon": -73.81,
            "label": "Second saved group",
            "events": [
                {
                    "distance_m": 250,
                    "customers_affected": 42,
                    "status": "L",
                    "start_time": "2026-02-01 08:00:00",
                }
            ],
            "event_count": 1,
            "latest_start_time": "2026-02-01 08:00:00",
        },
    ]

    context = result_context("en", result)

    assert context["map_payload"]["previousLocalSummary"] == {
        "title": "Local stability evidence",
        "body": "2 retained outages within 5 km. More rows mean more interruptions observed near here.",
        "meta": "All retained records within 5 km shown",
        "caveat": "This is not an official complete Hydro-Quebec address history.",
        "source": "Source: retained captures of the public Hydro-Quebec feed.",
        "latestLabel": "Most recent: 2026-02-01",
        "nearestLabel": "Nearest: 0.1 km",
        "bandLabel": "0-1 km: 2 · 1-3 km: 0 · 3-5 km: 0",
        "count": 2,
        "limit": 24,
        "radiusKm": "5",
    }


def test_result_context_previous_sidebar_rows_prefer_local_matches_for_address():
    result = make_search_result()
    result.previous_outage_groups = [
        {
            "centroid_lat": 45.7,
            "centroid_lon": -73.8,
            "label": "Address saved group",
            "events": [
                {
                    "distance_m": 50,
                    "customers_affected": 99,
                    "status": "R",
                    "start_time": "2026-01-01 09:00:00",
                }
            ],
            "event_count": 1,
            "latest_start_time": "2026-01-01 09:00:00",
        }
    ]
    result.previous_map_layers = [
        {
            "outage_kind": "previous_outage",
            "match_type": "previous_context_map",
            "centroid_lat": 45.52,
            "centroid_lon": -73.61,
            "start_time": "2026-05-15 10:00:00",
            "end_time": "2026-05-15 12:00:00",
            "geometry_geojson": None,
            "customers_affected": 9,
            "distance_m": None,
            "status": "R",
            "municipality_code": "66023",
            "event_count": 1,
            "recent_events": [],
        }
    ]

    context = result_context("en", result)

    assert [item["matchType"] for item in context["map_payload"]["previousSidebarMatches"]] == [
        "previous_query_match"
    ]


def test_default_map_payload_marks_previous_section_as_recent_archive():
    payload = default_map_payload("en", previous_map_layers=[])

    assert payload["previousMode"] == "recent_archive"


def test_default_map_payload_starts_without_address_marker_or_fixed_view():
    payload = default_map_payload(
        "en",
        [
            {
                "centroid_lat": 45.5,
                "centroid_lon": -73.6,
                "geography_label": "Montreal",
                "source_dai": "DAI-1",
                "source_title": "Source",
                "source_url": "https://example.test/source.pdf",
                "source_dais": ["DAI-1"],
                "year": 2025,
                "period_label": "2025",
                "outage_count": 10,
                "average_duration_minutes": 12,
                "continuity_index_minutes": 120,
                "long_outage_count": 1,
                "metrics": [],
            }
        ],
        [
            {
                "centroid_lat": 45.51,
                "centroid_lon": -73.61,
                "municipality_code": "Outremont",
                "record_count": 4,
                "start_min": "2022-01-12 05:10:00",
                "start_max": "2025-09-03 18:22:00",
                "duration_seconds_total": 44280,
                "source_dai": "DAI-2025-0275",
                "source_title": "Outremont disclosure extract",
                "source_dais": ["DAI-2025-0275"],
                "source_titles": {"DAI-2025-0275": "Outremont disclosure extract"},
                "geography_type": "municipality",
                "precision_label": "municipality",
                "top_causes": [{"cause": "Vegetation", "count": 2}],
                "recent_events": [],
            }
        ],
        [
            {
                "outage_kind": "outage",
                "match_type": "current_feed_map",
                "centroid_lat": 45.52,
                "centroid_lon": -73.62,
                "start_time": "2026-05-16 12:00:00",
                "end_time": None,
                "geometry_geojson": None,
                "customers_affected": 42,
                "distance_m": None,
                "status": "A",
                "municipality_code": "66023",
                "event_count": 1,
                "recent_events": [],
            },
            {
                "outage_kind": "planned",
                "match_type": "current_feed_map",
                "centroid_lat": 45.53,
                "centroid_lon": -73.63,
                "start_time": "2026-05-17 09:00:00",
                "end_time": "2026-05-17 11:00:00",
                "geometry_geojson": None,
                "customers_affected": 15,
                "distance_m": None,
                "status": "",
                "municipality_code": "66023",
                "event_count": 1,
                "recent_events": [],
            },
        ],
    )

    assert payload["center"] == [45.56, -73.61]
    assert payload["zoom"] == 8
    assert payload["showAddressMarker"] is False
    assert payload["showEmptyNotice"] is False
    assert payload["preserveInitialView"] is False
    assert any(item["kind"] == "outage" for item in payload["matches"])
    assert any(item["kind"] == "planned" for item in payload["matches"])
    assert any(
        item["kind"] == "regional_metric" and item["label"] == "Montreal"
        for item in payload["matches"]
    )
    assert any(item["kind"] == "disclosure" for item in payload["matches"])


def test_result_context_maps_error_keys():
    result = make_search_result()
    result.error = "outside_quebec"

    context = result_context("en", result)

    assert context["error_message"] == "This tool currently supports locations in Quebec only."


def test_result_context_uses_add_city_message_for_under_specific_geocode_failure():
    result = make_search_result()
    result.error = "geocode_failed"
    result.normalized = result.normalized.__class__(
        original="1010 rue Sherbrooke O.",
        normalized_line="1010 rue sherbrooke ouest, QC",
        street_line="1010 rue sherbrooke ouest",
        city="",
        province="QC",
        postal_code="",
        unit="",
    )

    context = result_context("en", result)

    assert (
        context["error_message"]
        == "The address could not be matched. Add the city or postal code and try again."
    )


def test_context_geometry_payload_prefers_static_or_inline_geometry():
    result = SimpleNamespace(
        regional_metric_layers=[
            {
                "geography_label": "Montreal",
                "geometry_geojson": {"type": "Polygon", "coordinates": []},
            }
        ],
        disclosure_layers=[
            {
                "geography_type": "municipality",
                "municipality_code": "Outremont",
                "geometry_geojson": {"type": "Polygon", "coordinates": []},
            }
        ],
    )

    payload = context_geometry_payload(result)

    assert payload["geometries"][0]["kind"] == "regional_metric"
    assert any(item["kind"] == "disclosure" for item in payload["geometries"])


def test_hydro_status_label_decodes_verified_codes_and_labels_unknown_codes():
    assert hydro_status_label("en", "A") == "Work assigned"
    assert hydro_status_label("en", "L") == "Crew at work"
    assert hydro_status_label("en", "R") == "Crew en route"
    assert hydro_status_label("fr", "A") == "Travaux assignés"
    assert hydro_status_label("en", "N") == "Not specified"
    assert hydro_status_label("fr", "N") == "Non précisé"
    assert hydro_status_label("en", "") == "Unknown"
