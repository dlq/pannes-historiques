from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .geocoding import haversine_meters
from .i18n import STRINGS, choose_language, t

FIXED_RADIUS_M = 5000
FIXED_DAYS = 1825
FIXED_INCLUDE_PLANNED = True
PREVIOUS_NEAREST_LIMIT = 24
DEFAULT_MAP_CENTER = [45.56, -73.61]
DEFAULT_MAP_ZOOM = 8
SEARCH_MAP_ZOOM = 13
REGIONAL_GEOMETRY_ASSET = Path(__file__).parent / "static" / "regional_metric_geometries.json"
DISCLOSURE_GEOMETRY_ASSET = Path(__file__).parent / "static" / "disclosure_geometries.json"
HYDRO_STATUS_LABEL_KEYS = {
    "A": "hydro_status_assigned",
    "L": "hydro_status_crew_at_work",
    "R": "hydro_status_crew_en_route",
}


@lru_cache(maxsize=1)
def _regional_geometry_asset() -> dict[str, dict[str, Any]]:
    if not REGIONAL_GEOMETRY_ASSET.exists():
        return {}
    payload = json.loads(REGIONAL_GEOMETRY_ASSET.read_text(encoding="utf-8"))
    return {item["geometryKey"]: item["geometry"] for item in payload.get("geometries", [])}


@lru_cache(maxsize=1)
def _disclosure_geometry_asset() -> dict[str, dict[str, Any]]:
    if not DISCLOSURE_GEOMETRY_ASSET.exists():
        return {}
    payload = json.loads(DISCLOSURE_GEOMETRY_ASSET.read_text(encoding="utf-8"))
    return {item["geometryKey"]: item["geometry"] for item in payload.get("geometries", [])}


def _regional_geometry_key(item: dict[str, Any]) -> str:
    return f"regional:{item['geography_label']}"


def _disclosure_geometry_key(item: dict[str, Any]) -> str:
    return f"disclosure:{item['geography_type']}:{item['municipality_code']}"


def hydro_status_label(lang: str, status: str | None) -> str:
    code = (status or "").strip().upper()
    if not code:
        return t(lang, "unknown")
    label_key = HYDRO_STATUS_LABEL_KEYS.get(code)
    return t(lang, label_key) if label_key else t(lang, "hydro_status_undocumented")


def context_geometry_payload(result: Any) -> dict[str, Any]:
    regional_geometries = _regional_geometry_asset()
    disclosure_geometries = _disclosure_geometry_asset()
    regional_layers_by_key = {
        _regional_geometry_key(item): item for item in result.regional_metric_layers
    }
    for label in _regional_geometry_labels(regional_geometries):
        regional_layers_by_key.setdefault(f"regional:{label}", {"geography_label": label})
    return {
        "geometries": [
            {
                "kind": "regional_metric",
                "geometryKey": _regional_geometry_key(item),
                "geometry": regional_geometries.get(_regional_geometry_key(item))
                or item.get("geometry_geojson"),
            }
            for item in regional_layers_by_key.values()
            if regional_geometries.get(_regional_geometry_key(item)) or item.get("geometry_geojson")
        ]
        + [
            {
                "kind": "disclosure",
                "geometryKey": _disclosure_geometry_key(item),
                "geometry": disclosure_geometries.get(_disclosure_geometry_key(item))
                or item.get("geometry_geojson"),
            }
            for item in result.disclosure_layers
            if disclosure_geometries.get(_disclosure_geometry_key(item))
            or item.get("geometry_geojson")
        ]
    }


def result_context(lang: str, result: Any, *, include_map_payload: bool = True) -> dict[str, Any]:
    if result.error:
        if result.error == "outside_quebec":
            error_key = "outside_quebec_error"
        elif result.error == "geocode_failed" and not (
            result.normalized.city or result.normalized.postal_code
        ):
            error_key = "search_error_add_city"
        else:
            error_key = "search_error"
        return {"lang": lang, "result": result, "error_message": t(lang, error_key)}

    display_address = ", ".join(
        part
        for part in [
            result.normalized.street_line.title(),
            result.geocode.get("city", ""),
            result.geocode.get("province", ""),
            result.geocode.get("postal_code", ""),
        ]
        if part
    )
    map_payload = build_map_payload(lang, result, display_address) if include_map_payload else None
    return {
        "lang": lang,
        "result": result,
        "display_address": display_address,
        "map_payload": map_payload,
        "include_focus_geometry": include_map_payload,
    }


def default_map_payload(
    lang: str,
    regional_metric_layers: list[dict[str, Any]] | None = None,
    disclosure_layers: list[dict[str, Any]] | None = None,
    current_map_layers: list[dict[str, Any]] | None = None,
    previous_map_layers: list[dict[str, Any]] | None = None,
    previous_archive_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    regional_matches_by_key = {
        _regional_geometry_key(item): _regional_metric_map_item(lang, item)
        for item in regional_metric_layers or []
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    }
    if regional_metric_layers is not None:
        for label in _regional_geometry_labels(_regional_geometry_asset()):
            regional_matches_by_key.setdefault(
                f"regional:{label}", _regional_geometry_context_item(lang, label)
            )
    matches = [
        _operational_map_item(lang, item)
        for item in current_map_layers or []
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    ]
    matches += [
        _previous_operational_map_item(lang, item)
        for item in previous_map_layers or []
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    ]
    matches += list(regional_matches_by_key.values())
    matches += [
        _disclosure_map_item(lang, item)
        for item in disclosure_layers or []
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    ]
    return {
        "center": DEFAULT_MAP_CENTER,
        "zoom": DEFAULT_MAP_ZOOM,
        "showAddressMarker": False,
        "showEmptyNotice": False,
        "preserveInitialView": False,
        "contextGeometryUrl": "/map-context-geometries",
        "labels": _map_labels(lang),
        "loadedLayers": _loaded_layer_keys(matches),
        "matches": matches,
        "previousMode": "recent_archive",
        "previousArchiveSummary": previous_archive_summary,
        "previousSidebarMatches": [item for item in matches if item["kind"] == "previous_outage"],
    }


def _map_labels(lang: str) -> dict[str, str]:
    def map_label(key: str) -> str:
        if key in {"local_reliability_summary_body", "local_reliability_summary_meta"}:
            return STRINGS[choose_language(lang)].get(key, key)
        return t(lang, key)

    return {
        key: map_label(key)
        for key in [
            "address",
            "average_duration",
            "area",
            "cause",
            "close",
            "clients",
            "cumulative_disclosed_duration",
            "current_outages",
            "customers",
            "dai_source",
            "dai_sources",
            "distance",
            "disclosure_region",
            "duration_short",
            "end",
            "extracted_rows",
            "latest_map_source",
            "layer_info_close",
            "layer_info_current_body",
            "layer_info_current_layout",
            "layer_info_current_map",
            "layer_info_current_provenance",
            "layer_info_current_title",
            "layer_info_eyebrow",
            "layer_info_layout",
            "layer_info_map",
            "layer_info_open",
            "layer_info_planned_body",
            "layer_info_planned_layout",
            "layer_info_planned_map",
            "layer_info_planned_provenance",
            "layer_info_planned_title",
            "layer_info_previous_body",
            "layer_info_previous_layout",
            "layer_info_previous_map",
            "layer_info_previous_provenance",
            "layer_info_previous_title",
            "layer_info_provenance",
            "layer_info_published_body",
            "layer_info_published_layout",
            "layer_info_published_map",
            "layer_info_published_provenance",
            "layer_info_published_title",
            "local_reliability_summary_body",
            "local_reliability_summary_meta",
            "local_reliability_summary_title",
            "nearby_match",
            "map_unavailable",
            "outage",
            "outages",
            "outages_over_8h",
            "period",
            "planned",
            "planned_panel",
            "previous_outages_legend",
            "previous_recent_archive_empty",
            "previous_recent_archive_heading",
            "previous_scope_label",
            "previous_seen_before_here_heading",
            "previous_archive_last_24h",
            "previous_archive_last_7d",
            "previous_archive_last_30d",
            "previous_archive_last_1y",
            "previous_archive_largest",
            "previous_archive_latest",
            "previous_archive_summary_total",
            "previous_archive_summary_areas",
            "within_radius",
            "published_dai_records",
            "regional_colour_legend",
            "row_label_age",
            "row_label_area",
            "row_label_customers",
            "row_label_date",
            "row_label_duration",
            "row_label_records",
            "row_label_status",
            "row_label_time",
            "row_label_window",
            "rows",
            "sources",
            "start",
            "status",
            "top_causes",
            "total_disclosed_duration",
            "unknown",
        ]
    }


def build_map_payload(lang: str, result: Any, display_address: str) -> dict[str, Any]:
    reference = (result.geocode["latitude"], result.geocode["longitude"])
    current_items = [
        _operational_map_item(lang, item, reference)
        for item in result.current_map_layers
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    ]
    previous_items = [
        _previous_operational_map_item(lang, item, reference)
        for item in result.previous_map_layers
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    ]
    previous_group_items = [
        _previous_group_map_item(lang, group)
        for group in result.previous_outage_groups
        if group["centroid_lat"] is not None and group["centroid_lon"] is not None
    ]
    disclosure_items = [
        _disclosure_map_item(lang, item, reference)
        for item in result.disclosure_layers
        if item["centroid_lat"] is not None and item["centroid_lon"] is not None
    ]
    previous_sidebar_matches = _previous_sidebar_matches(previous_items, previous_group_items)
    previous_local_summary = _previous_local_summary(
        lang,
        previous_sidebar_matches,
        radius_m=result.radius_m,
        nearest_limit=PREVIOUS_NEAREST_LIMIT,
    )
    matches = (
        _sort_by_distance(current_items)
        + previous_sidebar_matches
        + [
            _regional_metric_map_item(lang, item)
            for item in result.regional_metric_layers
            if item["centroid_lat"] is not None and item["centroid_lon"] is not None
        ]
        + _sort_by_distance(disclosure_items)
    )
    return {
        "center": [result.geocode["latitude"], result.geocode["longitude"]],
        "zoom": SEARCH_MAP_ZOOM,
        "addressLabel": display_address or result.normalized.original,
        "contextGeometryUrl": "/map-context-geometries",
        "radiusM": result.radius_m,
        "labels": _map_labels(lang),
        "loadedLayers": _loaded_layer_keys(matches),
        "matches": matches,
        "previousMode": "seen_before_here",
        "previousRadiusM": result.radius_m,
        "previousNearestLimit": PREVIOUS_NEAREST_LIMIT,
        "previousLocalSummary": previous_local_summary,
        "previousSidebarMatches": previous_sidebar_matches,
    }


def _previous_sidebar_matches(
    previous_items: list[dict[str, Any]],
    previous_group_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if previous_group_items:
        return _sort_by_distance(previous_group_items)[:PREVIOUS_NEAREST_LIMIT]
    return [
        item
        for item in _sort_by_distance(previous_items)
        if item.get("distanceM") is not None and item["distanceM"] <= FIXED_RADIUS_M
    ][:PREVIOUS_NEAREST_LIMIT]


def _format_radius_km(radius_m: int | float | None) -> str:
    radius_km = float(radius_m or 0) / 1000
    if not radius_km:
        return "0"
    return str(int(radius_km)) if radius_km.is_integer() else f"{radius_km:.1f}"


def _previous_local_summary(
    lang: str,
    previous_sidebar_matches: list[dict[str, Any]],
    *,
    radius_m: int | float | None,
    nearest_limit: int,
) -> dict[str, Any]:
    count = len(previous_sidebar_matches)
    limit = nearest_limit
    radius_km = _format_radius_km(radius_m)
    return {
        "title": t(lang, "local_reliability_summary_title"),
        "body": t(
            lang,
            "local_reliability_summary_body",
            count=count,
            radius_km=radius_km,
        ),
        "meta": t(
            lang,
            "local_reliability_summary_meta",
            count=count,
            limit=limit,
            radius_km=radius_km,
        ),
        "count": count,
        "limit": limit,
        "radiusKm": radius_km,
    }


def _loaded_layer_keys(matches: list[dict[str, Any]]) -> list[str]:
    loaded = set()
    for item in matches:
        if item["kind"] == "outage":
            loaded.add("current")
        elif item["kind"] == "planned":
            loaded.add("planned")
        elif item["kind"] == "previous_outage":
            loaded.add("previous")
        elif item["kind"] in {"disclosure", "regional_metric"}:
            loaded.add("published")
    return sorted(loaded)


def _operational_map_item(
    lang: str,
    item: dict[str, Any],
    reference: tuple[float, float] | None = None,
) -> dict[str, Any]:
    return {
        "kind": item["outage_kind"],
        "matchType": item["match_type"],
        "lat": item["centroid_lat"],
        "lon": item["centroid_lon"],
        "label": item.get("start_time"),
        "kindLabel": t(lang, item["outage_kind"]),
        "matchLabel": t(lang, "current_feed_map"),
        "geometry": item.get("geometry_geojson"),
        "geometryKey": item.get("geometry_key")
        or (
            f"{item['outage_kind']}:{item.get('geometry_id')}"
            if item.get("geometry_id") is not None
            else None
        ),
        "customersAffected": item.get("customers_affected"),
        "distanceM": item.get("distance_m")
        if item.get("distance_m") is not None
        else _distance_from_reference(item["centroid_lat"], item["centroid_lon"], reference),
        "status": item.get("status"),
        "statusLabel": hydro_status_label(lang, item.get("status")),
        "startTime": item.get("start_time"),
        "endTime": item.get("end_time"),
        "municipalityCode": item.get("municipality_code"),
        "eventCount": item.get("event_count"),
        "recentEvents": item.get("recent_events", [])[:12],
    }


def _previous_group_map_item(lang: str, group: dict[str, Any]) -> dict[str, Any]:
    first_event = group["events"][0] if group["events"] else {}
    distances = [
        event["distance_m"] for event in group["events"] if event.get("distance_m") is not None
    ]
    return {
        "kind": "previous_outage",
        "matchType": "previous_query_match",
        "lat": group["centroid_lat"],
        "lon": group["centroid_lon"],
        "label": group["label"],
        "kindLabel": t(lang, "previous_outage_tooltip"),
        "eventCountLabel": t(lang, "events_in_group"),
        "geometry": group.get("geometry_geojson"),
        "eventCount": group["event_count"],
        "customersAffected": first_event.get("customers_affected"),
        "distanceM": min(distances) if distances else None,
        "status": first_event.get("status"),
        "statusLabel": hydro_status_label(lang, first_event.get("status")),
        "startTime": first_event.get("start_time"),
        "latestStartTime": group["latest_start_time"],
        "recentEvents": group["events"][:12],
    }


def _previous_operational_map_item(
    lang: str,
    item: dict[str, Any],
    reference: tuple[float, float] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "previous_outage",
        "matchType": item["match_type"],
        "lat": item["centroid_lat"],
        "lon": item["centroid_lon"],
        "label": item["start_time"],
        "kindLabel": t(lang, "previous_outage_tooltip"),
        "matchLabel": t(lang, "previous_outages_legend"),
        "geometry": item.get("geometry_geojson"),
        "customersAffected": item["customers_affected"],
        "distanceM": item["distance_m"]
        if item["distance_m"] is not None
        else _distance_from_reference(item["centroid_lat"], item["centroid_lon"], reference),
        "status": item["status"],
        "statusLabel": hydro_status_label(lang, item["status"]),
        "startTime": item["start_time"],
        "endTime": item["end_time"],
        "municipalityCode": item["municipality_code"],
        "eventCount": item.get("event_count"),
        "recentEvents": item.get("recent_events", [])[:12],
    }


def _regional_metric_map_item(lang: str, item: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "regional_metric",
        "matchType": "administrative_region_aggregate",
        "lat": item["centroid_lat"],
        "lon": item["centroid_lon"],
        "label": item["geography_label"],
        "deferGeometry": True,
        "geometryKey": _regional_geometry_key(item),
        "sourceDai": item["source_dai"],
        "sourceTitle": item["source_title"],
        "sourceUrl": item["source_url"],
        "sourceDais": item["source_dais"],
        "year": item["year"],
        "periodLabel": item["period_label"],
        "outageCount": item["outage_count"],
        "averageDurationMinutes": item["average_duration_minutes"],
        "continuityIndexMinutes": item["continuity_index_minutes"],
        "regionalBurdenLabel": t(lang, "regional_colour_legend"),
        "longOutageCount": item["long_outage_count"],
        "metrics": item["metrics"],
    }


def _disclosure_map_item(
    lang: str,
    item: dict[str, Any],
    reference: tuple[float, float] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "disclosure",
        "matchType": "disclosure_area_context",
        "lat": item["centroid_lat"],
        "lon": item["centroid_lon"],
        "label": item["municipality_code"],
        "regionLabel": t(lang, "disclosure_region"),
        "deferGeometry": True,
        "geometryKey": _disclosure_geometry_key(item),
        "recordCount": item["record_count"],
        "startMin": item["start_min"],
        "startMax": item["start_max"],
        "durationSecondsTotal": item["duration_seconds_total"],
        "sourceDai": item["source_dai"],
        "sourceTitle": item["source_title"],
        "sourceDais": item["source_dais"],
        "sourceTitles": item["source_titles"],
        "geographyType": item["geography_type"],
        "precisionLabel": item["precision_label"],
        "distanceM": _distance_from_reference(
            item["centroid_lat"], item["centroid_lon"], reference
        ),
        "topCauses": item["top_causes"],
        "recentEvents": item["recent_events"],
    }


def _distance_from_reference(
    lat: float | None,
    lon: float | None,
    reference: tuple[float, float] | None,
) -> float | None:
    if reference is None or lat is None or lon is None:
        return None
    return round(haversine_meters(reference[0], reference[1], lat, lon), 1)


def _sort_by_distance(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            item.get("distanceM") is None,
            item.get("distanceM") if item.get("distanceM") is not None else float("inf"),
            item.get("startTime") or "",
            item.get("label") or "",
        ),
    )


def _regional_geometry_labels(regional_geometries: dict[str, dict[str, Any]]) -> list[str]:
    prefix = "regional:"
    return sorted(key.removeprefix(prefix) for key in regional_geometries if key.startswith(prefix))


def _regional_geometry_context_item(lang: str, label: str) -> dict[str, Any]:
    return {
        "kind": "regional_metric",
        "matchType": "administrative_region_context",
        "label": label,
        "deferGeometry": True,
        "geometryKey": f"regional:{label}",
        "sourceDai": "",
        "sourceTitle": "",
        "sourceUrl": "",
        "sourceDais": [],
        "year": "",
        "periodLabel": t(lang, "unknown"),
        "outageCount": None,
        "averageDurationMinutes": None,
        "continuityIndexMinutes": None,
        "regionalBurdenLabel": t(lang, "regional_colour_legend"),
        "longOutageCount": None,
        "metrics": [],
    }
