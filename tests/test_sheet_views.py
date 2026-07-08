from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.sheet_views import (
    HISTORY_MONTHS,
    _format_window,
    _monthly_buckets,
    _planned_groups,
    explore_sheet_context,
    overview_sheet_context,
)


def _recent(days_ago: int, hour: int = 11) -> str:
    moment = datetime.now(UTC) - timedelta(days=days_ago)
    return moment.strftime(f"%Y-%m-%d {hour:02d}:00:00")


def test_format_window_same_day_french():
    assert _format_window("fr", "2026-07-08 08:30:00", "2026-07-08 15:30:00") == "8 h 30 – 15 h 30"


def test_format_window_multi_day_keeps_dates():
    label = _format_window("fr", "2026-07-08 08:30:00", "2026-07-09 15:30:00")
    assert "8 juil." in label
    assert "9 juil." in label


def test_monthly_buckets_counts_recent_events():
    items = [
        {"startTime": _recent(2)},
        {"startTime": _recent(3)},
        {"startTime": _recent(500)},
    ]
    buckets = _monthly_buckets("fr", items, HISTORY_MONTHS)
    assert len(buckets) == HISTORY_MONTHS
    assert sum(bucket["count"] for bucket in buckets) == 2


def test_planned_groups_are_date_grouped_and_sorted():
    groups = _planned_groups(
        "fr",
        [
            {
                "startTime": "2026-07-09 09:00:00",
                "endTime": "2026-07-09 15:00:00",
                "customersAffected": 85,
            },
            {
                "startTime": "2026-07-08 08:30:00",
                "endTime": "2026-07-08 11:30:00",
                "customersAffected": 63,
            },
            {
                "startTime": "2026-07-08 12:30:00",
                "endTime": "2026-07-08 16:30:00",
                "customersAffected": 12,
            },
        ],
        with_distance=False,
    )
    assert [group["tileDay"] for group in groups] == ["8", "9"]
    assert len(groups[0]["rows"]) == 2
    assert groups[0]["rows"][0]["window"] == "8 h 30 – 11 h 30"


def test_explore_current_context_sorts_rows_by_customers():
    context = explore_sheet_context(
        "fr",
        "current",
        current_layers=[
            {
                "outage_kind": "outage",
                "match_type": "current_feed_map",
                "centroid_lat": 45.5,
                "centroid_lon": -73.6,
                "customers_affected": 10,
                "status": "L",
                "start_time": "2026-07-05 10:00:00",
            },
            {
                "outage_kind": "outage",
                "match_type": "current_feed_map",
                "centroid_lat": 46.8,
                "centroid_lon": -71.2,
                "customers_affected": 900,
                "status": "R",
                "start_time": "2026-07-05 09:00:00",
            },
        ],
    )
    assert context["mode"] == "explore"
    assert context["domain"] == "current"
    rows = context["body"]["rows"]
    assert [row["customers"] for row in rows] == ["900", "10"]
    assert context["map_update"]["matches"]


def _fake_result(previous_start: str) -> SimpleNamespace:
    return SimpleNamespace(
        radius_m=5000,
        geocode={"latitude": 45.5186, "longitude": -73.6027},
        normalized=SimpleNamespace(
            original="5220 Rue Jeanne-Mance", street_line="5220 rue Jeanne-Mance"
        ),
        current_map_layers=[
            {
                "outage_kind": "outage",
                "match_type": "current_feed_map",
                "centroid_lat": 45.53,
                "centroid_lon": -73.61,
                "customers_affected": 131,
                "status": "L",
                "start_time": _recent(0, hour=9),
            }
        ],
        previous_map_layers=[],
        previous_outage_groups=[
            {
                "centroid_lat": 45.53,
                "centroid_lon": -73.62,
                "label": "1000",
                "event_count": 1,
                "latest_start_time": previous_start,
                "geometry_geojson": None,
                "events": [
                    {
                        "start_time": previous_start,
                        "customers_affected": 28,
                        "distance_m": 2377.9,
                        "status": "N",
                    }
                ],
            }
        ],
        disclosure_layers=[],
        regional_metric_layers=[],
    )


def test_overview_context_builds_answer_stack():
    context = overview_sheet_context(
        "fr", _fake_result(_recent(2)), "5220 rue Jeanne-Mance, Montréal"
    )
    assert context["mode"] == "address"
    assert context["domain"] == "overview"
    assert context["current_line"]["state"] == "alert"
    assert context["history"]["count"] == 1
    assert len(context["history"]["buckets"]) == HISTORY_MONTHS
    assert context["history"]["maxBucket"] == 1
    assert context["map_update"]["radiusM"] == 5000
    assert context["map_update"]["center"] == [45.5186, -73.6027]


def test_latest_archive_groups_split_by_day():
    from app.sheet_views import _latest_archive_groups

    groups = _latest_archive_groups(
        "en",
        [
            {"startTime": "2026-07-05 23:18:00", "customersAffected": 8},
            {"startTime": "2026-07-05 09:02:00", "customersAffected": 12},
            {"startTime": "2026-07-04 22:10:00", "customersAffected": 3},
            {"startTime": None, "customersAffected": 1},
        ],
    )
    assert [group["heading"] for group in groups] == [
        "Sunday Jul 5",
        "Saturday Jul 4",
        "Unknown",
    ]
    assert len(groups[0]["rows"]) == 2
    assert groups[0]["rows"][0]["tile"] == {"day": "5", "month": "Jul"}


def test_address_domain_current_scopes_to_radius():
    from app.sheet_views import address_domain_sheet_context

    result = _fake_result(_recent(2))
    context = address_domain_sheet_context("fr", "current", result, "5220 rue Jeanne-Mance")
    assert context["mode"] == "address"
    assert context["scope"] == "local"
    rows = context["body"]["rows"]
    assert len(rows) == 1
    assert rows[0]["distanceKm"] != ""
    assert all(item["kind"] == "outage" for item in context["map_update"]["matches"])


def test_address_domain_archive_groups_local_rows():
    from app.sheet_views import address_domain_sheet_context

    result = _fake_result(_recent(2))
    context = address_domain_sheet_context("fr", "archive", result, "5220 rue Jeanne-Mance")
    rows = [row for row in context["body"]["rows"] if not row["isHeading"]]
    headings = [row for row in context["body"]["rows"] if row["isHeading"]]
    assert len(rows) == 1
    assert len(headings) == 1
    assert rows[0]["tile"]["day"]
    assert "pannes conservées" in context["body"]["summary"] or "1" in context["body"]["summary"]


def test_address_domain_province_scope_reuses_explore_context():
    from app.sheet_views import address_domain_sheet_context

    result = _fake_result(_recent(2))
    explore = {
        "mode": "explore",
        "domain": "planned",
        "scope": "province",
        "body": {},
        "map_update": None,
        "map_labels": {},
    }
    context = address_domain_sheet_context(
        "fr", "planned", result, "5220 rue Jeanne-Mance", scope="province", explore_context=explore
    )
    assert context["mode"] == "address"
    assert context["scope"] == "province"
    assert context["display_address"] == "5220 rue Jeanne-Mance"


def test_active_planned_drops_ended_notices():
    from app.sheet_views import _active_planned

    now = datetime(2026, 7, 6, 12, 0, 0)
    items = [
        {"startTime": "2026-06-17 08:30:00", "endTime": "2026-06-17 11:30:00"},  # stale
        {"startTime": "2026-07-09 08:30:00", "endTime": "2026-07-09 15:30:00"},  # future
        {"startTime": "2026-07-06 08:00:00", "endTime": None},  # ongoing / unknown end
    ]
    active = _active_planned(items, now)
    assert len(active) == 2
    assert all(item.get("endTime") != "2026-06-17 11:30:00" for item in active)


def test_pluralization_resolves_both_directions():
    from app.i18n import t

    assert t("fr", "explore_current_summary", count=1) == "1 panne en cours au Québec"
    assert t("fr", "explore_current_summary", count=76) == "76 pannes en cours au Québec"
    assert t("en", "explore_planned_summary", count=1) == "1 planned interruption"
    assert t("en", "explore_planned_summary", count=3) == "3 planned interruptions"


def test_french_decimal_separator():
    from app.views import _format_distance_km, _format_radius_km

    assert _format_distance_km(1500, "fr") == "1,5"
    assert _format_distance_km(1500, "en") == "1.5"
    assert _format_radius_km(4500, "fr") == "4,5"


def test_address_current_domain_uses_local_scope_label():
    from types import SimpleNamespace

    from app.sheet_views import address_domain_sheet_context

    result = SimpleNamespace(
        radius_m=5000,
        geocode={"latitude": 45.5186, "longitude": -73.6027},
        normalized=SimpleNamespace(original="5220 Rue Jeanne-Mance"),
        current_map_layers=[],
        previous_map_layers=[],
        previous_outage_groups=[],
        disclosure_layers=[],
        regional_metric_layers=[],
    )
    context = address_domain_sheet_context("fr", "current", result, "5220 Rue Jeanne-Mance")
    assert "à moins de 5 km" in context["body"]["summary"]
    assert "au Québec" not in context["body"]["summary"]
