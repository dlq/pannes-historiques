from __future__ import annotations

from typing import Any

from .i18n import t

RADIUS_OPTIONS = (500, 1200, 2500, 5000)
DAYS_OPTIONS = (7, 30, 180, 365, 1825)


def result_context(lang: str, result: Any) -> dict[str, Any]:
    if result.error:
        return {"lang": lang, "result": result, "error_message": t(lang, "search_error")}

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
    map_payload = {
        "center": [result.geocode["latitude"], result.geocode["longitude"]],
        "addressLabel": display_address or result.normalized.original,
        "radiusM": result.radius_m,
        "matches": [
            {
                "kind": item["outage_kind"],
                "matchType": item["match_type"],
                "lat": item["centroid_lat"],
                "lon": item["centroid_lon"],
                "label": item["start_time"],
                "geometry": item.get("geometry_geojson"),
            }
            for item in result.matches
            if item["centroid_lat"] is not None and item["centroid_lon"] is not None
        ]
        + [
            {
                "kind": "regional_metric",
                "matchType": "administrative_region_aggregate",
                "lat": item["centroid_lat"],
                "lon": item["centroid_lon"],
                "label": item["geography_label"],
                "geometry": item.get("geometry_geojson"),
                "sourceDai": item["source_dai"],
                "sourceTitle": item["source_title"],
                "sourceUrl": item["source_url"],
                "sourceDais": item["source_dais"],
                "year": item["year"],
                "periodLabel": item["period_label"],
                "outageCount": item["outage_count"],
                "averageDurationMinutes": item["average_duration_minutes"],
                "continuityIndexMinutes": item["continuity_index_minutes"],
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
                "geometry": item.get("geometry_geojson"),
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
    archive_span = (
        f"{result.coverage['outage_min_time'] or t(lang, 'unknown')}"
        f" -> {result.coverage['outage_max_time'] or t(lang, 'unknown')}"
    )
    planned_span = (
        f"{result.coverage['planned_min_time'] or t(lang, 'unknown')}"
        f" -> {result.coverage['planned_max_time'] or t(lang, 'unknown')}"
    )
    max_distance = max((item["distance_m"] or 0 for item in result.matches), default=None)

    return {
        "lang": lang,
        "result": result,
        "display_address": display_address,
        "map_payload": map_payload,
        "archive_span": archive_span,
        "planned_span": planned_span,
        "max_distance": max_distance,
    }
