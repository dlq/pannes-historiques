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
    disclosure_map_items = {}
    for item in result.disclosure_matches:
        if item["centroid_lat"] is None or item["centroid_lon"] is None:
            continue
        key = (
            item["source_dai"],
            item["municipality_code"],
            round(item["centroid_lat"], 4),
            round(item["centroid_lon"], 4),
        )
        existing = disclosure_map_items.setdefault(
            key,
            {
                "kind": "disclosure",
                "matchType": item["match_type"],
                "lat": item["centroid_lat"],
                "lon": item["centroid_lon"],
                "label": f"{item['source_dai']} · {item['municipality_code']}",
                "geometry": item.get("geometry_geojson"),
                "count": 0,
            },
        )
        existing["count"] += 1
        existing["label"] = (
            f"{item['source_dai']} · {item['municipality_code']} · {existing['count']} records"
        )

    map_payload = {
        "center": [result.geocode["latitude"], result.geocode["longitude"]],
        "addressLabel": display_address or result.normalized.original,
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
        + list(disclosure_map_items.values()),
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
