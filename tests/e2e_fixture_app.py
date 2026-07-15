from __future__ import annotations

from datetime import datetime, timedelta

from app.addressing import NormalizedAddress
from app.config import Settings
from app.services import SearchResult


def _upcoming(days: int, hour: int) -> str:
    # Planned interruptions are future events; keep the fixture ahead of "now"
    # so the staleness filter (which drops ended windows) retains them.
    moment = (datetime.now() + timedelta(days=days)).replace(
        hour=hour, minute=0, second=0, microsecond=0
    )
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def _polygon(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> dict[str, object]:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [min_lon, min_lat],
                [max_lon, min_lat],
                [max_lon, max_lat],
                [min_lon, max_lat],
                [min_lon, min_lat],
            ]
        ],
    }


def _base_normalized() -> NormalizedAddress:
    return NormalizedAddress(
        original="5220 Rue Jeanne-Mance",
        normalized_line="5220 rue jeanne-mance, montreal, QC",
        street_line="5220 rue jeanne-mance",
        city="montreal",
        province="QC",
        postal_code="H2V4G7",
        unit="",
    )


def _base_geocode() -> dict[str, object]:
    return {
        "latitude": 45.5186,
        "longitude": -73.6027,
        "city": "Montreal",
        "province": "Quebec",
        "postal_code": "H2V 4G7",
    }


def _outage_matches() -> list[dict[str, object]]:
    return [
        {
            "outage_kind": "outage",
            "match_type": "direct_match",
            "centroid_lat": 45.5188,
            "centroid_lon": -73.6031,
            "geometry_geojson": _polygon(-73.6044, 45.5182, -73.6017, 45.5196),
            "start_time": "2026-05-09 10:15:00",
            "end_time": None,
            "customers_affected": 29,
            "distance_m": 180,
            "status": "N",
            "municipality_code": "2466023",
            "event_count": 1,
            "recent_events": [],
        },
        {
            "outage_kind": "outage",
            "match_type": "nearby_match",
            "centroid_lat": 45.5221,
            "centroid_lon": -73.6064,
            "geometry_geojson": _polygon(-73.6071, 45.5215, -73.6056, 45.5227),
            "start_time": "2026-05-08 21:40:00",
            "end_time": None,
            "customers_affected": 44,
            "distance_m": 410,
            "status": "R",
            "municipality_code": "2466023",
            "event_count": 1,
            "recent_events": [],
        },
    ]


def _planned_matches() -> list[dict[str, object]]:
    return [
        {
            "outage_kind": "planned",
            "match_type": "nearby_match",
            "geometry_id": 9001,
            "geometry_key": "planned:9001",
            "centroid_lat": 45.5201,
            "centroid_lon": -73.6002,
            "geometry_geojson": _polygon(-73.6013, 45.5194, -73.5995, 45.5209),
            "start_time": _upcoming(2, 8),
            "end_time": _upcoming(2, 12),
            "customers_affected": 16,
            "distance_m": 305,
            "status": "A",
            "municipality_code": "2466023",
            "event_count": 1,
            "recent_events": [],
        },
        {
            "outage_kind": "planned",
            "match_type": "nearby_match",
            "geometry_id": 9001,
            "geometry_key": "planned:9001",
            "centroid_lat": 45.5203,
            "centroid_lon": -73.6004,
            "geometry_geojson": _polygon(-73.6013, 45.5194, -73.5995, 45.5209),
            "start_time": _upcoming(3, 9),
            "end_time": _upcoming(3, 11),
            "customers_affected": 22,
            "distance_m": 315,
            "status": "A",
            "municipality_code": "2466023",
            "event_count": 1,
            "recent_events": [],
        },
    ]


def _previous_outage_groups() -> list[dict[str, object]]:
    return [
        {
            "label": "Near Jeanne-Mance historical cluster",
            "centroid_lat": 45.5173,
            "centroid_lon": -73.6041,
            "geometry_geojson": _polygon(-73.6051, 45.5166, -73.6032, 45.5180),
            "event_count": 2,
            "latest_start_time": "2025-12-18 13:20:00",
            "events": [
                {
                    "outage_kind": "outage",
                    "match_type": "previous_query_match",
                    "centroid_lat": 45.5173,
                    "centroid_lon": -73.6041,
                    "start_time": "2025-12-18 13:20:00",
                    "end_time": "2025-12-18 18:05:00",
                    "customers_affected": 133,
                    "distance_m": 265,
                    "status": "R",
                },
                {
                    "outage_kind": "outage",
                    "match_type": "previous_query_match",
                    "centroid_lat": 45.5171,
                    "centroid_lon": -73.6040,
                    "start_time": "2024-07-03 09:10:00",
                    "end_time": "2024-07-03 11:40:00",
                    "customers_affected": 57,
                    "distance_m": 280,
                    "status": "R",
                },
            ],
        }
    ]


def _regional_metric_layers() -> list[dict[str, object]]:
    return [
        {
            "centroid_lat": 45.5405,
            "centroid_lon": -73.6372,
            "geography_label": "Montreal",
            "geometry_geojson": _polygon(-73.95, 45.35, -73.45, 45.7),
            "source_dai": "DAI-2026-0077",
            "source_title": "Administrative region summary",
            "source_url": "https://example.invalid/dai-2026-0077",
            "source_dais": ["DAI-2026-0077"],
            "year": 2025,
            "period_label": "2025",
            "outage_count": 184,
            "average_duration_minutes": 86,
            "continuity_index_minutes": 12.4,
            "long_outage_count": 7,
            "metrics": [
                {"label": "Outages", "value": 184},
                {"label": "Average duration", "value": 86},
            ],
        }
    ]


def _disclosure_layers() -> list[dict[str, object]]:
    return [
        {
            "centroid_lat": 45.5146,
            "centroid_lon": -73.6108,
            "geometry_geojson": _polygon(-73.6172, 45.5102, -73.6042, 45.5184),
            "municipality_code": "Outremont",
            "record_count": 4,
            "start_min": "2022-01-12 05:10:00",
            "start_max": "2025-09-03 18:22:00",
            "duration_seconds_total": 44280,
            "source_dai": "DAI-2025-0275",
            "source_title": "Outremont disclosure extract",
            "source_dais": ["DAI-2025-0275"],
            "source_titles": ["Outremont disclosure extract"],
            "geography_type": "municipality",
            "precision_label": "municipality",
            "top_causes": [{"cause": "Vegetation", "count": 2}],
            "recent_events": [
                {
                    "start_time": "2025-09-03 18:22:00",
                    "end_time": "2025-09-03 21:10:00",
                    "row_area": "Outremont",
                    "cause": "Vegetation",
                    "duration_seconds": 10080,
                    "customers_affected": 84,
                }
            ],
        }
    ]


def _build_result(
    *,
    location_query: bool = False,
    map_layer_scopes: set[str] | frozenset[str] | None = None,
) -> SearchResult:
    map_layer_scopes = map_layer_scopes or {"current", "planned", "previous", "published"}
    normalized = _base_normalized()
    geocode = _base_geocode()
    if location_query:
        normalized = NormalizedAddress(
            original="Current location",
            normalized_line="current location 45.51860,-73.60270, QC",
            street_line="current location",
            city="montreal",
            province="QC",
            postal_code="",
            unit="",
        )
    outage_matches = _outage_matches()
    planned_matches = _planned_matches()
    previous_groups = _previous_outage_groups() if "previous" in map_layer_scopes else []
    current_map_layers = []
    if "current" in map_layer_scopes:
        current_map_layers.extend(outage_matches)
    if "planned" in map_layer_scopes:
        current_map_layers.extend(planned_matches)
    return SearchResult(
        normalized=normalized,
        address_id=1,
        cache_hit=True,
        geocode=geocode,
        matches=[*outage_matches, *planned_matches],
        query_count=3,
        collector_summary={},
        coverage={},
        outage_matches=outage_matches,
        planned_matches=planned_matches,
        previous_outage_groups=previous_groups,
        current_map_layers=current_map_layers,
        previous_map_layers=[
            {
                "outage_kind": "previous_outage",
                "match_type": "previous_context_map",
                "centroid_lat": 45.5171,
                "centroid_lon": -73.6040,
                "start_time": "2024-07-03 09:10:00",
                "end_time": "2024-07-03 11:40:00",
                "customers_affected": 57,
                "distance_m": None,
                "status": "R",
                "municipality_code": "66023",
                "geometry_geojson": _polygon(-73.61, 45.51, -73.59, 45.53),
                "event_count": 1,
                "recent_events": [],
            }
        ]
        if "previous" in map_layer_scopes
        else [],
        disclosure_layers=_disclosure_layers() if "published" in map_layer_scopes else [],
        regional_metric_layers=_regional_metric_layers() if "published" in map_layer_scopes else [],
        radius_m=5000,
        error=None,
    )


class StubGeocoder:
    def suggest(self, query: str, language: str = "fr", limit: int = 6) -> list[dict[str, object]]:
        base = {
            "latitude": 45.5186,
            "longitude": -73.6027,
            "city": "Montreal",
            "province": "Quebec",
            "postal_code": "H2V 4G7",
        }
        suggestions = [
            {
                "label": "5220 Rue Jeanne-Mance, Montreal, Quebec, H2V 4G7",
                "value": "5220 Rue Jeanne-Mance",
                **base,
            },
            {
                "label": "1701 Rue Parthenais, Montreal, Quebec, H2K 3S7",
                "value": "1701 Rue Parthenais, Montreal, QC H2K 3S7",
                "latitude": 45.5280,
                "longitude": -73.5607,
                "city": "Montreal",
                "province": "Quebec",
                "postal_code": "H2K 3S7",
            },
        ]
        query_text = query.strip().lower()
        if not query_text:
            return []
        return [
            item
            for item in suggestions
            if query_text in item["value"].lower() or query_text in item["label"].lower()
        ][:limit]


class E2EStubService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.geocoder = StubGeocoder()

    def search(self, **kwargs) -> SearchResult:
        return _build_result(
            location_query=False,
            map_layer_scopes=kwargs.get("map_layer_scopes"),
        )

    def search_location(self, **kwargs) -> SearchResult:
        return _build_result(
            location_query=True,
            map_layer_scopes=kwargs.get("map_layer_scopes"),
        )

    def _regional_metric_map_layers(self) -> list[dict[str, object]]:
        return _regional_metric_layers()

    def _disclosure_map_layers(self) -> list[dict[str, object]]:
        return _disclosure_layers()

    def _current_operational_map_layers(self, include_planned: bool) -> list[dict[str, object]]:
        layers = _outage_matches()
        if include_planned:
            layers = [*layers, *_planned_matches()]
        return layers

    def _previous_operational_map_layers(self, limit: int = 36) -> list[dict[str, object]]:
        return [
            {
                "outage_kind": "previous_outage",
                "match_type": "previous_context_map",
                "centroid_lat": 45.5171,
                "centroid_lon": -73.6040,
                "start_time": "2024-07-03 09:10:00",
                "end_time": "2024-07-03 11:40:00",
                "customers_affected": 57,
                "distance_m": None,
                "status": "R",
                "municipality_code": "66023",
                "geometry_geojson": _polygon(-73.61, 45.51, -73.59, 45.53),
                "event_count": 1,
                "recent_events": [],
            }
        ][:limit]

    def previous_operational_archive_summary(self) -> dict[str, object]:
        return {
            "mode": "municipal_archive",
            "territories": [
                {
                    "territoryId": "municipality:66023",
                    "territoryName": "Montréal",
                    "designation": "Municipalité",
                    "eventCount": 42,
                    "customersAffected": 1200,
                    "latestStartTime": "2026-06-14 14:06:00",
                    "geometryKey": "municipal_archive:municipality:66023",
                    "centroidLat": 45.52,
                    "centroidLon": -73.6,
                    "geometry": _polygon(-73.62, 45.5, -73.58, 45.54),
                },
                {
                    "territoryId": "municipality:49058",
                    "territoryName": "Drummondville",
                    "designation": "Municipalité",
                    "eventCount": 7,
                    "customersAffected": 80,
                    "latestStartTime": "2026-06-13 09:00:00",
                    "geometryKey": "municipal_archive:municipality:49058",
                    "centroidLat": 45.88,
                    "centroidLon": -72.48,
                    "geometry": _polygon(-72.5, 45.86, -72.46, 45.9),
                },
            ],
            "windows": [
                {
                    "key": "previous_archive_last_24h",
                    "areas": 0,
                    "totalCustomers": 0,
                },
                {
                    "key": "previous_archive_last_7d",
                    "areas": 0,
                    "totalCustomers": 0,
                },
            ],
            "largest": {
                "key": "previous_archive_largest",
                "startTime": "2025-12-18 13:20:00",
                "customersAffected": 133,
            },
            "latest": [
                {
                    "key": "previous_archive_latest",
                    "territoryId": "municipality:66023",
                    "territoryName": "Montréal",
                    "startTime": "2026-06-14 14:06:00",
                    "customersAffected": 4,
                }
            ],
        }

    def collect(self) -> dict[str, object]:
        return {"kind": "collect"}

    def collect_changed(self) -> dict[str, object]:
        return {"kind": "collect_changed"}

    def collect_current_outages(self) -> dict[str, object]:
        return {"kind": "collect_current_outages"}

    def collect_planned_interruptions(self) -> dict[str, object]:
        return {"kind": "collect_planned_interruptions"}

    def collect_disclosures(self) -> dict[str, object]:
        return {"kind": "collect_disclosures"}

    def run_changed_collection_job(self) -> dict[str, object]:
        return {"kind": "run_changed_collection_job"}

    def collect_disclosures_if_due(self) -> dict[str, object]:
        return {"kind": "collect_disclosures_if_due"}

    def collect_disclosure_sources(self, source_keys):
        return {"source_keys": source_keys}

    def collect_disclosure_source_payload(
        self,
        source_key,
        payload,
        *,
        content_type="application/octet-stream",
    ):
        return {"source_key": source_key, "size": len(payload), "content_type": content_type}

    def disclosure_export(self, source_keys=None):
        return {"source_keys": source_keys or []}

    def disclosure_payload_path(self, source_key):
        return None

    def raw_snapshot_payload_path(self, source_type, source_version):
        return None
