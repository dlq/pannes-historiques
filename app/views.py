from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .i18n import t

FIXED_RADIUS_M = 5000
FIXED_DAYS = 1825
FIXED_INCLUDE_PLANNED = True
REGIONAL_GEOMETRY_ASSET = Path(__file__).parent / "static" / "regional_metric_geometries.json"
DISCLOSURE_GEOMETRY_ASSET = Path(__file__).parent / "static" / "disclosure_geometries.json"


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


def context_geometry_payload(result: Any) -> dict[str, Any]:
    regional_geometries = _regional_geometry_asset()
    disclosure_geometries = _disclosure_geometry_asset()
    return {
        "geometries": [
            {
                "kind": "regional_metric",
                "geometryKey": _regional_geometry_key(item),
                "geometry": regional_geometries.get(_regional_geometry_key(item))
                or item.get("geometry_geojson"),
            }
            for item in result.regional_metric_layers
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
        error_key = "outside_quebec_error" if result.error == "outside_quebec" else "search_error"
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


def build_map_payload(lang: str, result: Any, display_address: str) -> dict[str, Any]:
    return {
        "center": [result.geocode["latitude"], result.geocode["longitude"]],
        "addressLabel": display_address or result.normalized.original,
        "contextGeometryUrl": "/map-context-geometries",
        "radiusM": result.radius_m,
        "labels": {
            key: t(lang, key)
            for key in [
                "address",
                "average_duration",
                "area",
                "cause",
                "clients",
                "customers",
                "dai_source",
                "dai_sources",
                "distance",
                "disclosure_region",
                "duration_short",
                "end",
                "extracted_rows",
                "latest_map_source",
                "nearby_match",
                "outage",
                "outages",
                "outages_over_8h",
                "period",
                "planned",
                "published_dai_records",
                "regional_colour_legend",
                "rows",
                "sources",
                "start",
                "status",
                "top_causes",
                "total_disclosed_duration",
                "unknown",
            ]
        },
        "matches": [
            {
                "kind": item["outage_kind"],
                "matchType": item["match_type"],
                "lat": item["centroid_lat"],
                "lon": item["centroid_lon"],
                "label": item["start_time"],
                "kindLabel": t(lang, item["outage_kind"]),
                "matchLabel": t(lang, "current_feed_map"),
                "geometry": item.get("geometry_geojson"),
                "customersAffected": item["customers_affected"],
                "distanceM": item["distance_m"],
                "status": item["status"],
                "startTime": item["start_time"],
                "endTime": item["end_time"],
                "municipalityCode": item["municipality_code"],
                "eventCount": item.get("event_count"),
                "recentEvents": item.get("recent_events", [])[:12],
            }
            for item in result.current_map_layers
            if item["centroid_lat"] is not None and item["centroid_lon"] is not None
        ]
        + [
            {
                "kind": "previous_outage",
                "matchType": "previous_query_match",
                "lat": group["centroid_lat"],
                "lon": group["centroid_lon"],
                "label": group["label"],
                "kindLabel": t(lang, "previous_outage_tooltip"),
                "eventCountLabel": t(lang, "events_in_group"),
                "geometry": group.get("geometry_geojson"),
                "eventCount": group["event_count"],
                "customersAffected": group["events"][0]["customers_affected"]
                if group["events"]
                else None,
                "distanceM": group["events"][0]["distance_m"] if group["events"] else None,
                "status": group["events"][0]["status"] if group["events"] else None,
                "startTime": group["events"][0]["start_time"] if group["events"] else None,
                "latestStartTime": group["latest_start_time"],
                "recentEvents": group["events"][:12],
            }
            for group in result.previous_outage_groups
            if group.get("geometry_geojson")
            and group["centroid_lat"] is not None
            and group["centroid_lon"] is not None
        ]
        + [
            {
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
            for item in result.regional_metric_layers
            if item["centroid_lat"] is not None and item["centroid_lon"] is not None
        ]
        + [
            {
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
                "topCauses": item["top_causes"],
                "recentEvents": item["recent_events"],
            }
            for item in result.disclosure_layers
            if item["centroid_lat"] is not None and item["centroid_lon"] is not None
        ],
    }
