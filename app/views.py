from __future__ import annotations

from typing import Any

from .i18n import t

FIXED_RADIUS_M = 5000
FIXED_DAYS = 1825
FIXED_INCLUDE_PLANNED = True


def result_context(lang: str, result: Any) -> dict[str, Any]:
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
                "customersAffected": item["customers_affected"],
                "distanceM": item["distance_m"],
                "status": item["status"],
                "startTime": item["start_time"],
                "endTime": item["end_time"],
                "municipalityCode": item["municipality_code"],
            }
            for item in result.matches
            if item["centroid_lat"] is not None and item["centroid_lon"] is not None
        ]
        + [
            {
                "kind": "previous_outage",
                "matchType": "previous_query_match",
                "lat": group["centroid_lat"],
                "lon": group["centroid_lon"],
                "label": group["label"],
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
    return {
        "lang": lang,
        "result": result,
        "display_address": display_address,
        "map_payload": map_payload,
    }
