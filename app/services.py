from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from .addressing import NormalizedAddress, normalize_address, normalize_text
from .config import ensure_directories
from .db import initialize, open_db
from .disclosures import DisclosureCollector
from .geocoding import GeocodingService, haversine_meters
from .hydro import HydroCollector


def point_in_polygon(point_lon: float, point_lat: float, polygon: list[list[float]]) -> bool:
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        intersects = ((yi > point_lat) != (yj > point_lat)) and (
            point_lon < (xj - xi) * (point_lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def within_quebec_bounds(latitude: float, longitude: float) -> bool:
    return 44.8 <= latitude <= 62.7 and -79.8 <= longitude <= -57.0


def clearly_outside_quebec_query(normalized: NormalizedAddress) -> bool:
    haystack = normalize_text(
        " ".join(
            part
            for part in [
                normalized.original,
                normalized.normalized_line,
                normalized.city,
                normalized.province,
            ]
            if part
        )
    )
    return any(token in haystack.split() for token in {"ottawa", "ontario", "on"})


@dataclass
class SearchResult:
    normalized: NormalizedAddress
    address_id: int | None
    cache_hit: bool
    geocode: dict[str, Any] | None
    matches: list[dict[str, Any]]
    query_count: int
    collector_summary: dict[str, Any]
    coverage: dict[str, Any]
    outage_matches: list[dict[str, Any]]
    planned_matches: list[dict[str, Any]]
    previous_outage_groups: list[dict[str, Any]]
    disclosure_matches: list[dict[str, Any]]
    disclosure_layers: list[dict[str, Any]]
    disclosure_metrics: list[dict[str, Any]]
    regional_metric_layers: list[dict[str, Any]]
    radius_m: int
    error: str | None = None


class AppService:
    def __init__(self, settings):
        self.settings = settings
        ensure_directories(settings)
        initialize(settings.db_path)
        self.geocoder = GeocodingService(settings)
        self.collector = HydroCollector(settings)
        self.disclosure_collector = DisclosureCollector(settings)

    def collect(self) -> dict[str, Any]:
        return self.collector.collect_all()

    def collect_disclosures(self) -> dict[str, Any]:
        return self.disclosure_collector.collect_all()

    def maybe_refresh(self) -> dict[str, Any] | None:
        with open_db(self.settings.db_path) as connection:
            row = connection.execute(
                "SELECT fetched_at FROM raw_snapshots ORDER BY fetched_at DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return self.collect()
        fetched_at = datetime.fromisoformat(row["fetched_at"].replace("Z", "+00:00"))
        age = datetime.now(UTC) - fetched_at.astimezone(UTC)
        if age > timedelta(minutes=self.settings.refresh_max_age_minutes):
            return self.collect()
        return None

    def search(
        self,
        *,
        query: str,
        language: str,
        radius_m: int,
        days: int,
        include_planned: bool,
    ) -> SearchResult:
        normalized = normalize_address(query)
        if clearly_outside_quebec_query(normalized):
            collector_summary = self.collector_status()
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=None,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=self.coverage_stats(),
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                disclosure_matches=[],
                disclosure_layers=[],
                disclosure_metrics=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="outside_quebec",
            )
        if self.settings.auto_refresh_on_search:
            self.collect()

        geocode = self.geocoder.geocode(normalized)
        collector_summary = self.collector_status()
        if geocode is None:
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=None,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=self.coverage_stats(),
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                disclosure_matches=[],
                disclosure_layers=[],
                disclosure_metrics=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="geocode_failed",
            )
        geocode = self._geocode_dict(geocode)
        if not within_quebec_bounds(geocode["latitude"], geocode["longitude"]):
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=geocode,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=self.coverage_stats(),
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                disclosure_matches=[],
                disclosure_layers=[],
                disclosure_metrics=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="outside_quebec",
            )

        address_id, cache_hit = self._upsert_address(normalized, geocode)
        matches = self._find_current_matches(
            geocode["latitude"], geocode["longitude"], radius_m, days, include_planned
        )
        outage_matches = [item for item in matches if item["outage_kind"] == "outage"]
        planned_matches = [item for item in matches if item["outage_kind"] == "planned"]
        disclosure_matches = self._find_disclosure_matches(
            normalized=normalized,
            geocode=geocode,
            radius_m=radius_m,
            days=days,
        )
        disclosure_layers = self._disclosure_map_layers()
        disclosure_metrics = self._find_disclosure_metrics(normalized=normalized, geocode=geocode)
        regional_metric_layers = self._regional_metric_map_layers()
        self._save_matches(address_id, outage_matches)
        previous_outage_groups = self._previous_outage_groups(
            address_id=address_id,
            exclude_event_keys={self._outage_display_key(item) for item in outage_matches},
        )
        query_count = self._record_query(
            address_id=address_id,
            original_query=query,
            normalized_query=normalized.normalized_line,
            language=language,
            radius_m=radius_m,
            days=days,
            include_planned=include_planned,
            cache_hit=cache_hit,
        )
        return SearchResult(
            normalized=normalized,
            address_id=address_id,
            cache_hit=cache_hit,
            geocode=geocode,
            matches=matches,
            query_count=query_count,
            collector_summary=collector_summary,
            coverage=self.coverage_stats(),
            outage_matches=outage_matches,
            planned_matches=planned_matches,
            previous_outage_groups=previous_outage_groups,
            disclosure_matches=disclosure_matches,
            disclosure_layers=disclosure_layers,
            disclosure_metrics=disclosure_metrics,
            regional_metric_layers=regional_metric_layers,
            radius_m=radius_m,
        )

    def search_location(
        self,
        *,
        latitude: float,
        longitude: float,
        accuracy_m: float | None,
        language: str,
        radius_m: int,
        days: int,
        include_planned: bool,
    ) -> SearchResult:
        label = f"Current location ({latitude:.5f}, {longitude:.5f})"
        normalized = NormalizedAddress(
            original=label,
            normalized_line=f"current location {latitude:.5f},{longitude:.5f}",
            street_line="Current location",
            city="",
            province="QC",
            postal_code="",
            unit="",
        )
        geocode = {
            "provider": "browser_geolocation",
            "confidence": 0.95 if accuracy_m is not None and accuracy_m <= 100 else 0.75,
            "quality": "device_location",
            "latitude": latitude,
            "longitude": longitude,
            "city": "",
            "province": "QC",
            "postal_code": "",
            "raw_json": {"accuracy_m": accuracy_m},
        }
        collector_summary = self.collector_status()
        if not within_quebec_bounds(latitude, longitude):
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=geocode,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=self.coverage_stats(),
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                disclosure_matches=[],
                disclosure_layers=[],
                disclosure_metrics=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="outside_quebec",
            )
        if self.settings.auto_refresh_on_search:
            self.collect()

        address_id, cache_hit = self._upsert_address(normalized, geocode)
        matches = self._find_current_matches(latitude, longitude, radius_m, days, include_planned)
        outage_matches = [item for item in matches if item["outage_kind"] == "outage"]
        planned_matches = [item for item in matches if item["outage_kind"] == "planned"]
        disclosure_matches = self._find_disclosure_matches(
            normalized=normalized,
            geocode=geocode,
            radius_m=radius_m,
            days=days,
        )
        disclosure_layers = self._disclosure_map_layers()
        disclosure_metrics = self._find_disclosure_metrics(normalized=normalized, geocode=geocode)
        regional_metric_layers = self._regional_metric_map_layers()
        self._save_matches(address_id, outage_matches)
        previous_outage_groups = self._previous_outage_groups(
            address_id=address_id,
            exclude_event_keys={self._outage_display_key(item) for item in outage_matches},
        )
        query_count = self._record_query(
            address_id=address_id,
            original_query=label,
            normalized_query=normalized.normalized_line,
            language=language,
            radius_m=radius_m,
            days=days,
            include_planned=include_planned,
            cache_hit=cache_hit,
        )
        return SearchResult(
            normalized=normalized,
            address_id=address_id,
            cache_hit=cache_hit,
            geocode=geocode,
            matches=matches,
            query_count=query_count,
            collector_summary=collector_summary,
            coverage=self.coverage_stats(),
            outage_matches=outage_matches,
            planned_matches=planned_matches,
            previous_outage_groups=previous_outage_groups,
            disclosure_matches=disclosure_matches,
            disclosure_layers=disclosure_layers,
            disclosure_metrics=disclosure_metrics,
            regional_metric_layers=regional_metric_layers,
            radius_m=radius_m,
        )

    def collector_status(self) -> dict[str, Any]:
        with open_db(self.settings.db_path) as connection:
            count = connection.execute("SELECT COUNT(*) AS count FROM raw_snapshots").fetchone()[
                "count"
            ]
            latest = connection.execute(
                "SELECT source_type, source_version, fetched_at FROM raw_snapshots ORDER BY fetched_at DESC LIMIT 1"
            ).fetchone()
            earliest = connection.execute(
                "SELECT source_type, source_version, fetched_at FROM raw_snapshots ORDER BY fetched_at ASC LIMIT 1"
            ).fetchone()
        return {
            "snapshot_count": int(count),
            "latest": dict(latest) if latest else None,
            "earliest": dict(earliest) if earliest else None,
        }

    def coverage_stats(self) -> dict[str, Any]:
        with open_db(self.settings.db_path) as connection:
            outage_count = connection.execute(
                "SELECT COUNT(*) AS count FROM outage_records"
            ).fetchone()["count"]
            planned_count = connection.execute(
                "SELECT COUNT(*) AS count FROM planned_interruptions"
            ).fetchone()["count"]
            event_count = connection.execute(
                "SELECT COUNT(*) AS count FROM resolved_events"
            ).fetchone()["count"]
            geometry_count = connection.execute(
                "SELECT COUNT(*) AS count FROM outage_geometries"
            ).fetchone()["count"]
            disclosure_source_count = connection.execute(
                "SELECT COUNT(*) AS count FROM disclosure_sources"
            ).fetchone()["count"]
            disclosure_event_count = connection.execute(
                "SELECT COUNT(*) AS count FROM disclosure_outage_events"
            ).fetchone()["count"]
            disclosure_metric_count = connection.execute(
                "SELECT COUNT(*) AS count FROM disclosure_annual_metrics"
            ).fetchone()["count"]
            outage_range = connection.execute(
                "SELECT MIN(outage_start_time) AS min_time, MAX(outage_start_time) AS max_time FROM outage_records"
            ).fetchone()
            planned_range = connection.execute(
                "SELECT MIN(scheduled_start) AS min_time, MAX(scheduled_start) AS max_time FROM planned_interruptions"
            ).fetchone()
        return {
            "outage_count": int(outage_count),
            "planned_count": int(planned_count),
            "event_count": int(event_count),
            "geometry_count": int(geometry_count),
            "outage_min_time": outage_range["min_time"] if outage_range else None,
            "outage_max_time": outage_range["max_time"] if outage_range else None,
            "planned_min_time": planned_range["min_time"] if planned_range else None,
            "planned_max_time": planned_range["max_time"] if planned_range else None,
            "disclosure_source_count": int(disclosure_source_count),
            "disclosure_event_count": int(disclosure_event_count),
            "disclosure_metric_count": int(disclosure_metric_count),
        }

    @staticmethod
    def _geocode_dict(geocode: Any) -> dict[str, Any]:
        if isinstance(geocode, dict):
            return geocode
        return {
            "provider": geocode.provider,
            "confidence": geocode.confidence,
            "quality": geocode.quality,
            "latitude": geocode.latitude,
            "longitude": geocode.longitude,
            "city": geocode.city,
            "province": geocode.province,
            "postal_code": geocode.postal_code,
            "raw_json": geocode.raw_json,
        }

    def _upsert_address(
        self, normalized: NormalizedAddress, geocode: dict[str, Any]
    ) -> tuple[int, bool]:
        geocode = self._geocode_dict(geocode)
        with open_db(self.settings.db_path) as connection:
            existing = connection.execute(
                "SELECT id FROM addresses WHERE normalized_line = ?",
                (normalized.normalized_line,),
            ).fetchone()
            if existing:
                connection.execute(
                    """
                    UPDATE addresses
                    SET updated_at = CURRENT_TIMESTAMP,
                        latitude = ?,
                        longitude = ?,
                        geocoder = ?,
                        geocoder_confidence = ?,
                        geocode_quality = ?
                    WHERE id = ?
                    """,
                    (
                        geocode["latitude"],
                        geocode["longitude"],
                        geocode["provider"],
                        geocode["confidence"],
                        geocode["quality"],
                        existing["id"],
                    ),
                )
                return int(existing["id"]), True
            cursor = connection.execute(
                """
                INSERT INTO addresses
                (original_query, normalized_line, street_line, unit, city, province, postal_code,
                 latitude, longitude, geocoder, geocoder_confidence, geocode_quality)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized.original,
                    normalized.normalized_line,
                    normalized.street_line,
                    normalized.unit,
                    geocode["city"] or normalized.city,
                    normalized.province,
                    geocode["postal_code"] or normalized.postal_code,
                    geocode["latitude"],
                    geocode["longitude"],
                    geocode["provider"],
                    geocode["confidence"],
                    geocode["quality"],
                ),
            )
            return int(cursor.lastrowid), False

    def _record_query(
        self,
        *,
        address_id: int,
        original_query: str,
        normalized_query: str,
        language: str,
        radius_m: int,
        days: int,
        include_planned: bool,
        cache_hit: bool,
    ) -> int:
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                INSERT INTO query_history
                (address_id, original_query, normalized_query, language, radius_m, time_window_days, include_planned, cache_hit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    address_id,
                    original_query,
                    normalized_query,
                    language,
                    radius_m,
                    days,
                    1 if include_planned else 0,
                    1 if cache_hit else 0,
                ),
            )
            count_row = connection.execute(
                "SELECT COUNT(*) AS count FROM query_history WHERE address_id = ?",
                (address_id,),
            ).fetchone()
        return int(count_row["count"])

    def _find_current_matches(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
        days: int,
        include_planned: bool,
    ) -> list[dict[str, Any]]:
        cutoff = (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        matches: list[dict[str, Any]] = []
        with open_db(self.settings.db_path) as connection:
            geometry_rows = connection.execute(
                """
                SELECT *
                FROM outage_geometries
                ORDER BY id DESC
                """
            ).fetchall()
            geometry_payload = [dict(row) for row in geometry_rows]

            outage_rows = connection.execute(
                """
                SELECT r.*
                FROM outage_records r
                JOIN raw_snapshots s ON s.id = r.snapshot_id
                WHERE s.source_type = 'bismarkers'
                  AND s.id = (
                    SELECT id
                    FROM raw_snapshots
                    WHERE source_type = 'bismarkers'
                    ORDER BY fetched_at DESC, id DESC
                    LIMIT 1
                  )
                  AND COALESCE(r.outage_start_time, '') >= ?
                ORDER BY COALESCE(r.outage_start_time, r.created_at) DESC
                """,
                (cutoff,),
            ).fetchall()
            matches.extend(
                self._match_rows(
                    rows=outage_rows,
                    geometry_payload=geometry_payload,
                    latitude=latitude,
                    longitude=longitude,
                    radius_m=radius_m,
                    outage_kind="outage",
                )
            )

            if include_planned:
                planned_rows = connection.execute(
                    """
                    SELECT p.*
                    FROM planned_interruptions p
                    JOIN raw_snapshots s ON s.id = p.snapshot_id
                    WHERE s.source_type = 'aipmarkers'
                      AND s.id = (
                        SELECT id
                        FROM raw_snapshots
                        WHERE source_type = 'aipmarkers'
                        ORDER BY fetched_at DESC, id DESC
                        LIMIT 1
                      )
                      AND COALESCE(p.scheduled_start, '') >= ?
                    ORDER BY COALESCE(p.scheduled_start, p.created_at) DESC
                    """,
                    (cutoff,),
                ).fetchall()
                matches.extend(
                    self._match_rows(
                        rows=planned_rows,
                        geometry_payload=geometry_payload,
                        latitude=latitude,
                        longitude=longitude,
                        radius_m=radius_m,
                        outage_kind="planned",
                    )
                )
        matches = self._dedupe_matches(matches)
        matches.sort(
            key=lambda item: (
                self._match_rank(item["match_type"]),
                item["confidence"],
                item["sort_time"] or "",
            ),
            reverse=True,
        )
        return matches

    def _match_rows(
        self,
        *,
        rows,
        geometry_payload: list[dict[str, Any]],
        latitude: float,
        longitude: float,
        radius_m: int,
        outage_kind: str,
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for row in rows:
            geometry_match = self._find_geometry_match(
                geometry_payload,
                row["source_version"],
                latitude,
                longitude,
                row["centroid_lat"],
                row["centroid_lon"],
            )
            centroid_distance = None
            if row["centroid_lat"] is not None and row["centroid_lon"] is not None:
                centroid_distance = haversine_meters(
                    latitude, longitude, row["centroid_lat"], row["centroid_lon"]
                )
            match_type = None
            confidence = 0.0
            geometry_id = None
            if geometry_match and geometry_match["contains"]:
                match_type = "direct_match"
                confidence = 0.92
                geometry_id = geometry_match["geometry_id"]
            elif centroid_distance is not None and centroid_distance <= radius_m:
                match_type = "nearby_match"
                confidence = max(0.45, 0.82 - centroid_distance / max(radius_m * 1.5, 1))
                geometry_id = geometry_match["geometry_id"] if geometry_match else None

            if not match_type:
                continue
            results.append(
                {
                    "address_id": None,
                    "outage_kind": outage_kind,
                    "record_id": row["id"],
                    "geometry_id": geometry_id,
                    "geometry_geojson": geometry_match["geometry_geojson"]
                    if geometry_match
                    else None,
                    "match_type": match_type,
                    "distance_m": round(centroid_distance, 1)
                    if centroid_distance is not None
                    else None,
                    "confidence": round(confidence, 2),
                    "municipality_code": row["municipality_code"],
                    "customers_affected": row["customers_affected"],
                    "status": row["status"],
                    "interruption_type": row["interruption_type"]
                    if outage_kind == "outage"
                    else "AIP",
                    "start_time": row["outage_start_time"]
                    if outage_kind == "outage"
                    else row["scheduled_start"],
                    "end_time": row["estimated_restore_time"]
                    if outage_kind == "outage"
                    else row["scheduled_end"],
                    "centroid_lat": row["centroid_lat"],
                    "centroid_lon": row["centroid_lon"],
                    "sort_time": row["outage_start_time"]
                    if outage_kind == "outage"
                    else row["scheduled_start"],
                }
            )
        return results

    def _find_geometry_match(
        self,
        geometry_rows: list[dict[str, Any]],
        source_version: str,
        latitude: float,
        longitude: float,
        row_centroid_lat: float | None,
        row_centroid_lon: float | None,
    ) -> dict[str, Any] | None:
        same_version_rows = [
            row for row in geometry_rows if row["source_version"] == source_version
        ]
        if not same_version_rows:
            return None

        for row in geometry_rows:
            if row["source_version"] != source_version:
                continue
            if row["bbox_min_lon"] is not None:
                if not (
                    row["bbox_min_lon"] <= longitude <= row["bbox_max_lon"]
                    and row["bbox_min_lat"] <= latitude <= row["bbox_max_lat"]
                ):
                    continue
            geojson = json.loads(row["geometry_geojson"])
            polygon = geojson["coordinates"][0]
            if point_in_polygon(longitude, latitude, polygon):
                return {"contains": True, "geometry_id": row["id"], "geometry_geojson": geojson}

        if row_centroid_lat is not None and row_centroid_lon is not None:
            best_row = min(
                same_version_rows,
                key=lambda row: haversine_meters(
                    row_centroid_lat,
                    row_centroid_lon,
                    row["centroid_lat"] if row["centroid_lat"] is not None else 0.0,
                    row["centroid_lon"] if row["centroid_lon"] is not None else 0.0,
                ),
            )
            return {
                "contains": False,
                "geometry_id": best_row["id"],
                "geometry_geojson": json.loads(best_row["geometry_geojson"]),
            }

        row = same_version_rows[0]
        return {
            "contains": False,
            "geometry_id": row["id"],
            "geometry_geojson": json.loads(row["geometry_geojson"]),
        }

    def _save_matches(self, address_id: int, matches: list[dict[str, Any]]) -> None:
        with open_db(self.settings.db_path) as connection:
            for item in matches:
                if item["outage_kind"] != "outage":
                    continue
                connection.execute(
                    """
                    INSERT OR REPLACE INTO address_outage_matches
                    (address_id, outage_kind, record_id, geometry_id, match_type, distance_m, confidence)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        address_id,
                        item["outage_kind"],
                        item["record_id"],
                        item["geometry_id"],
                        item["match_type"],
                        item["distance_m"],
                        item["confidence"],
                    ),
                )

    def _previous_outage_groups(
        self, *, address_id: int, exclude_event_keys: set[tuple[Any, ...]]
    ) -> list[dict[str, Any]]:
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT m.geometry_id, m.match_type, m.distance_m, m.confidence, m.matched_at,
                       r.id AS record_id, r.customers_affected, r.outage_start_time,
                       r.estimated_restore_time, r.interruption_type, r.status,
                       r.municipality_code, r.centroid_lon, r.centroid_lat,
                       g.name AS geometry_name, g.geometry_geojson
                FROM address_outage_matches m
                JOIN outage_records r ON r.id = m.record_id
                LEFT JOIN outage_geometries g ON g.id = m.geometry_id
                WHERE m.address_id = ?
                  AND m.outage_kind = 'outage'
                ORDER BY COALESCE(r.outage_start_time, m.matched_at) DESC
                """,
                (address_id,),
            ).fetchall()

        groups: dict[str, dict[str, Any]] = {}
        for row in rows:
            item = dict(row)
            event = {
                "municipality_code": item["municipality_code"],
                "start_time": item["outage_start_time"],
                "centroid_lat": item["centroid_lat"],
                "centroid_lon": item["centroid_lon"],
                "interruption_type": item["interruption_type"],
            }
            if self._outage_display_key(event) in exclude_event_keys:
                continue
            group_key = (
                f"geometry:{item['geometry_id']}"
                if item["geometry_id"] is not None
                else f"centroid:{round(item['centroid_lat'] or 0.0, 3)}:{round(item['centroid_lon'] or 0.0, 3)}"
            )
            group = groups.setdefault(
                group_key,
                {
                    "geometry_id": item["geometry_id"],
                    "label": item["geometry_name"]
                    or item["municipality_code"]
                    or f"{item['centroid_lat']}, {item['centroid_lon']}",
                    "municipality_code": item["municipality_code"],
                    "centroid_lat": item["centroid_lat"],
                    "centroid_lon": item["centroid_lon"],
                    "geometry_geojson": json.loads(item["geometry_geojson"])
                    if item["geometry_geojson"]
                    else None,
                    "events": [],
                },
            )
            group["events"].append(
                {
                    "outage_kind": "outage",
                    "record_id": item["record_id"],
                    "match_type": item["match_type"],
                    "distance_m": item["distance_m"],
                    "confidence": item["confidence"],
                    "municipality_code": item["municipality_code"],
                    "customers_affected": item["customers_affected"],
                    "status": item["status"],
                    "interruption_type": item["interruption_type"],
                    "start_time": item["outage_start_time"],
                    "end_time": item["estimated_restore_time"],
                    "centroid_lat": item["centroid_lat"],
                    "centroid_lon": item["centroid_lon"],
                    "matched_at": item["matched_at"],
                    "sort_time": item["outage_start_time"],
                }
            )

        grouped = list(groups.values())
        for group in grouped:
            group["events"].sort(key=lambda item: item["sort_time"] or "", reverse=True)
            group["event_count"] = len(group["events"])
            group["latest_start_time"] = (
                group["events"][0]["start_time"] if group["events"] else None
            )
        grouped.sort(key=lambda item: item["latest_start_time"] or "", reverse=True)
        return grouped

    @staticmethod
    def _outage_display_key(item: dict[str, Any]) -> tuple[Any, ...]:
        return (
            item["municipality_code"],
            item["start_time"],
            round(item["centroid_lat"] or 0.0, 3),
            round(item["centroid_lon"] or 0.0, 3),
            item["interruption_type"],
        )

    @staticmethod
    def _dedupe_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
        deduped: dict[tuple[Any, ...], dict[str, Any]] = {}
        for item in matches:
            key = (
                item["outage_kind"],
                item["municipality_code"],
                item["start_time"],
                round(item["centroid_lat"] or 0.0, 3),
                round(item["centroid_lon"] or 0.0, 3),
                item["interruption_type"],
            )
            existing = deduped.get(key)
            if existing is None or item["confidence"] > existing["confidence"]:
                deduped[key] = item
        return list(deduped.values())

    @staticmethod
    def _match_rank(match_type: str) -> int:
        return {
            "direct_match": 3,
            "nearby_match": 2,
            "area_match": 1,
        }.get(match_type, 0)

    def _find_disclosure_matches(
        self,
        *,
        normalized: NormalizedAddress,
        geocode: dict[str, Any],
        radius_m: int,
        days: int,
    ) -> list[dict[str, Any]]:
        cutoff = (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        haystack = self._area_haystack(normalized, geocode)
        rows = []
        with open_db(self.settings.db_path) as connection:
            candidates = connection.execute(
                """
                SELECT e.*, s.dai_number, s.title, s.attachment_url, s.notes,
                       g.geometry_geojson AS disclosure_geometry_geojson,
                       g.centroid_lon AS disclosure_geometry_centroid_lon,
                       g.centroid_lat AS disclosure_geometry_centroid_lat
                FROM disclosure_outage_events e
                JOIN disclosure_sources s ON s.id = e.source_id
                LEFT JOIN disclosure_geometries g
                  ON g.source_id = s.id
                 AND g.geography_label = e.geography_label
                 AND g.id = (
                    SELECT g2.id
                    FROM disclosure_geometries g2
                    WHERE g2.source_id = s.id
                      AND g2.geography_label = e.geography_label
                    ORDER BY CASE WHEN g2.geometry_source = 'fallback_area' THEN 1 ELSE 0 END,
                             g2.id DESC
                    LIMIT 1
                 )
                WHERE COALESCE(e.start_time, '') >= ?
                ORDER BY COALESCE(e.start_time, e.created_at) DESC
                LIMIT 5000
                """,
                (cutoff,),
            ).fetchall()
        for row in candidates:
            item = dict(row)
            centroid_lat = item["disclosure_geometry_centroid_lat"] or item["centroid_lat"]
            centroid_lon = item["disclosure_geometry_centroid_lon"] or item["centroid_lon"]
            distance_m = None
            if centroid_lat is not None and centroid_lon is not None:
                distance_m = haversine_meters(
                    geocode["latitude"],
                    geocode["longitude"],
                    centroid_lat,
                    centroid_lon,
                )
            normalized_geo = normalize_text(item["geography_label"])
            area_hit = normalized_geo and normalized_geo in haystack
            distance_hit = distance_m is not None and distance_m <= max(radius_m, 7500)
            if not area_hit and not distance_hit:
                continue
            confidence = 0.58 if area_hit else 0.46
            if item["geography_type"] in {"region", "province"}:
                confidence = 0.32
            rows.append(
                {
                    "outage_kind": "disclosure",
                    "record_id": item["id"],
                    "match_type": "disclosure_area_context",
                    "distance_m": round(distance_m, 1) if distance_m is not None else None,
                    "confidence": confidence,
                    "municipality_code": item["geography_label"],
                    "customers_affected": item["customers_affected"],
                    "status": item["precision_label"],
                    "interruption_type": item["interruption_type"] or "historical_disclosure",
                    "start_time": item["start_time"],
                    "end_time": item["end_time"],
                    "duration_seconds": item["duration_seconds"],
                    "cause": item["cause"],
                    "equipment": item["equipment"],
                    "category": item["category"],
                    "source_dai": item["dai_number"],
                    "source_title": item["title"],
                    "source_url": item["attachment_url"],
                    "geography_type": item["geography_type"],
                    "precision_label": item["precision_label"],
                    "geometry_geojson": json.loads(item["disclosure_geometry_geojson"])
                    if item["disclosure_geometry_geojson"]
                    else None,
                    "centroid_lat": centroid_lat,
                    "centroid_lon": centroid_lon,
                    "sort_time": item["start_time"],
                    "area_hit": bool(area_hit),
                }
            )
        area_rows = [row for row in rows if row["area_hit"]]
        if area_rows:
            rows = area_rows
        rows.sort(key=lambda row: (row["area_hit"], row["sort_time"] or ""), reverse=True)
        for row in rows:
            row.pop("area_hit", None)
        return rows[:36]

    def _find_disclosure_metrics(
        self, *, normalized: NormalizedAddress, geocode: dict[str, Any]
    ) -> list[dict[str, Any]]:
        haystack = self._area_haystack(normalized, geocode)
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT m.*, s.dai_number, s.title, s.attachment_url
                FROM disclosure_annual_metrics m
                JOIN disclosure_sources s ON s.id = m.source_id
                ORDER BY COALESCE(m.year, 0) DESC
                LIMIT 200
                """
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            if normalize_text(item["geography_label"]) not in haystack:
                continue
            results.append(item)
        return results[:12]

    def _regional_metric_map_layers(self) -> list[dict[str, Any]]:
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT m.*, s.dai_number, s.title, s.attachment_url,
                       g.geometry_geojson, g.centroid_lon, g.centroid_lat
                FROM disclosure_annual_metrics m
                JOIN disclosure_sources s ON s.id = m.source_id
                LEFT JOIN disclosure_geometries g
                  ON g.source_id = s.id
                 AND g.geography_label = m.geography_label
                 AND g.id = (
                    SELECT g2.id
                    FROM disclosure_geometries g2
                    WHERE g2.source_id = s.id
                      AND g2.geography_label = m.geography_label
                    ORDER BY CASE WHEN g2.geometry_source = 'fallback_area' THEN 1 ELSE 0 END,
                             g2.id DESC
                    LIMIT 1
                 )
                WHERE m.geography_type = 'administrative_region'
                ORDER BY m.geography_label,
                         COALESCE(m.year, 0) DESC,
                         CASE WHEN m.period_label LIKE '%09-30%' THEN 1 ELSE 0 END,
                         s.dai_number DESC
                """
            ).fetchall()

        layers_by_region: dict[str, dict[str, Any]] = {}
        for row in rows:
            item = dict(row)
            key = normalize_text(item["geography_label"])
            group = layers_by_region.setdefault(
                key,
                {
                    "outage_kind": "regional_metric",
                    "source_dai": item["dai_number"],
                    "source_title": item["title"],
                    "source_url": item["attachment_url"],
                    "source_dais": [],
                    "geography_label": item["geography_label"],
                    "geography_type": item["geography_type"],
                    "year": item["year"],
                    "period_label": item["period_label"],
                    "outage_count": item["outage_count"],
                    "average_duration_minutes": item["average_duration_minutes"],
                    "continuity_index_minutes": item["continuity_index_minutes"],
                    "long_outage_count": item["long_outage_count"],
                    "centroid_lon": item["centroid_lon"],
                    "centroid_lat": item["centroid_lat"],
                    "geometry_geojson": json.loads(item["geometry_geojson"])
                    if item["geometry_geojson"]
                    else None,
                    "metrics": [],
                },
            )
            if item["dai_number"] not in group["source_dais"]:
                group["source_dais"].append(item["dai_number"])
            group["metrics"].append(
                {
                    "source_dai": item["dai_number"],
                    "source_title": item["title"],
                    "source_url": item["attachment_url"],
                    "year": item["year"],
                    "period_label": item["period_label"],
                    "outage_count": item["outage_count"],
                    "average_duration_minutes": item["average_duration_minutes"],
                    "continuity_index_minutes": item["continuity_index_minutes"],
                    "long_outage_count": item["long_outage_count"],
                }
            )
        return sorted(layers_by_region.values(), key=lambda item: item["geography_label"])

    def _disclosure_map_layers(self) -> list[dict[str, Any]]:
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT e.id, e.start_time, e.end_time, e.duration_seconds, e.customers_affected,
                       e.cause, e.equipment, e.geography_label, e.geography_type, e.precision_label,
                       s.dai_number, s.title, s.attachment_url,
                       g.geometry_geojson, g.centroid_lon, g.centroid_lat
                FROM disclosure_outage_events e
                JOIN disclosure_sources s ON s.id = e.source_id
                LEFT JOIN disclosure_geometries g
                  ON g.source_id = s.id
                 AND g.geography_label = e.geography_label
                 AND g.id = (
                    SELECT g2.id
                    FROM disclosure_geometries g2
                    WHERE g2.source_id = s.id
                      AND g2.geography_label = e.geography_label
                    ORDER BY CASE WHEN g2.geometry_source = 'fallback_area' THEN 1 ELSE 0 END,
                             g2.id DESC
                    LIMIT 1
                 )
                ORDER BY COALESCE(e.start_time, e.created_at) DESC
                """
            ).fetchall()

        groups: dict[tuple[str, str], dict[str, Any]] = {}
        for row in rows:
            item = dict(row)
            key = (item["geography_type"], item["geography_label"])
            group = groups.setdefault(
                key,
                {
                    "outage_kind": "disclosure",
                    "source_dai": item["dai_number"],
                    "source_title": item["title"],
                    "source_url": item["attachment_url"],
                    "source_dais": [],
                    "source_titles": {},
                    "municipality_code": item["geography_label"],
                    "geography_type": item["geography_type"],
                    "precision_label": item["precision_label"],
                    "centroid_lon": item["centroid_lon"],
                    "centroid_lat": item["centroid_lat"],
                    "geometry_geojson": json.loads(item["geometry_geojson"])
                    if item["geometry_geojson"]
                    else None,
                    "record_count": 0,
                    "start_min": None,
                    "start_max": None,
                    "duration_seconds_total": 0,
                    "cause_counts": {},
                    "recent_events": [],
                },
            )
            if item["dai_number"] not in group["source_dais"]:
                group["source_dais"].append(item["dai_number"])
                group["source_titles"][item["dai_number"]] = item["title"]
            group["record_count"] += 1
            if item["start_time"]:
                group["start_min"] = min(
                    filter(None, [group["start_min"], item["start_time"]]),
                    default=item["start_time"],
                )
                group["start_max"] = max(
                    filter(None, [group["start_max"], item["start_time"]]),
                    default=item["start_time"],
                )
            if item["duration_seconds"] is not None:
                group["duration_seconds_total"] += item["duration_seconds"]
            cause = item["cause"] or "Unknown"
            group["cause_counts"][cause] = group["cause_counts"].get(cause, 0) + 1
            group["recent_events"].append(
                {
                    "start_time": item["start_time"],
                    "end_time": item["end_time"],
                    "duration_seconds": item["duration_seconds"],
                    "cause": item["cause"],
                    "row_area": item["equipment"],
                    "customers_affected": item["customers_affected"],
                    "source_dai": item["dai_number"],
                }
            )

        layers = []
        for group in groups.values():
            top_causes = sorted(
                group["cause_counts"].items(),
                key=lambda item: (item[1], item[0]),
                reverse=True,
            )[:4]
            layers.append(
                {
                    "outage_kind": group["outage_kind"],
                    "source_dai": group["source_dai"],
                    "source_title": group["source_title"],
                    "source_url": group["source_url"],
                    "source_dais": group["source_dais"],
                    "source_titles": group["source_titles"],
                    "municipality_code": group["municipality_code"],
                    "geography_type": group["geography_type"],
                    "precision_label": group["precision_label"],
                    "centroid_lon": group["centroid_lon"],
                    "centroid_lat": group["centroid_lat"],
                    "geometry_geojson": group["geometry_geojson"],
                    "record_count": group["record_count"],
                    "start_min": group["start_min"],
                    "start_max": group["start_max"],
                    "duration_seconds_total": group["duration_seconds_total"],
                    "top_causes": [{"cause": cause, "count": count} for cause, count in top_causes],
                    "recent_events": group["recent_events"],
                }
            )
        layers.sort(key=lambda item: (item["source_dai"], item["municipality_code"]))
        return layers

    @staticmethod
    def _area_haystack(normalized: NormalizedAddress, geocode: dict[str, Any]) -> str:
        raw_json = geocode.get("raw_json") or {}
        raw_text = json.dumps(raw_json, ensure_ascii=True) if isinstance(raw_json, dict) else ""
        values = [
            normalized.normalized_line,
            normalized.city,
            geocode.get("city", ""),
            geocode.get("province", ""),
            geocode.get("postal_code", ""),
            raw_text,
        ]
        return normalize_text(" ".join(str(value) for value in values if value))
