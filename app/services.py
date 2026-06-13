from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .addressing import NormalizedAddress, normalize_address, normalize_text
from .config import ensure_directories
from .db import initialize, open_db
from .disclosures import DisclosureCollector
from .geocoding import GeocodingService, haversine_meters
from .hydro import HydroCollector
from .perf import current_timer

DURABLE_RUNTIME_CACHEABLE_PATHS = {
    "map-context",
    "operational-map-layers",
    "previous-map-layers",
    "status",
}
DEFAULT_PREVIOUS_MAP_LAYER_LIMIT = 48
CURRENT_MAP_LAYER_SCOPE = "current"
PLANNED_MAP_LAYER_SCOPE = "planned"
PREVIOUS_MAP_LAYER_SCOPE = "previous"
PUBLISHED_MAP_LAYER_SCOPE = "published"
ALL_MAP_LAYER_SCOPES = frozenset(
    {
        CURRENT_MAP_LAYER_SCOPE,
        PLANNED_MAP_LAYER_SCOPE,
        PREVIOUS_MAP_LAYER_SCOPE,
        PUBLISHED_MAP_LAYER_SCOPE,
    }
)


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
    current_map_layers: list[dict[str, Any]]
    previous_map_layers: list[dict[str, Any]]
    disclosure_layers: list[dict[str, Any]]
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
        self._context_cache: dict[str, dict[str, Any]] = {}

    def _durable_runtime_get(
        self, path: str, query: dict[str, str] | None = None
    ) -> dict[str, Any] | None:
        if not self.settings.durable_runtime_url:
            return None
        normalized_path = path.strip("/")
        if (
            normalized_path in DURABLE_RUNTIME_CACHEABLE_PATHS
            and self.settings.durable_context_cache_ttl_seconds > 0
        ):
            cache_query = urllib.parse.urlencode(query or {})
            return self._cached_context(
                f"durable_runtime_get:{normalized_path}:{cache_query}",
                lambda: self._durable_runtime_get_uncached(path, query),
                ttl_seconds=self.settings.durable_context_cache_ttl_seconds,
                cache_none=False,
            )
        return self._durable_runtime_get_uncached(path, query)

    def _durable_runtime_get_uncached(
        self, path: str, query: dict[str, str] | None = None
    ) -> dict[str, Any] | None:
        suffix = f"/{path.lstrip('/')}"
        encoded = f"?{urllib.parse.urlencode(query)}" if query else ""
        request = urllib.request.Request(
            f"{self.settings.durable_runtime_url}{suffix}{encoded}",
            headers={"User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)"},
        )
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            current_timer().set(f"durable_runtime_{path.replace('/', '_')}_error", str(exc))
            return None

    def _durable_runtime_post(self, path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.settings.durable_runtime_url:
            return None
        request = urllib.request.Request(
            f"{self.settings.durable_runtime_url}/{path.lstrip('/')}",
            data=json.dumps(payload, ensure_ascii=True).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            current_timer().set(f"durable_runtime_{path.replace('/', '_')}_error", str(exc))
            return None

    def collect(self) -> dict[str, Any]:
        result = self.collector.collect_all()
        self._clear_context_cache()
        return result

    def collect_changed(self) -> dict[str, Any]:
        result = self.collector.collect_changed()
        if any(source.get("changed") for source in result.get("sources", [])):
            self._clear_context_cache()
        return result

    def collect_changed_for_durable(
        self, existing_versions: dict[str, str | None]
    ) -> dict[str, Any]:
        result = self.collector.collect_changed_against(existing_versions)
        result["mode"] = "durable_fetch"
        return result

    def collect_current_outages(self) -> dict[str, Any]:
        result = self.collector.collect_source("bis")
        self._clear_context_cache()
        return result

    def collect_planned_interruptions(self) -> dict[str, Any]:
        result = self.collector.collect_source("aip")
        self._clear_context_cache()
        return result

    def collect_disclosures(self) -> dict[str, Any]:
        result = self.disclosure_collector.collect_all()
        self._clear_context_cache()
        return result

    def collect_disclosure_sources(self, source_keys: list[str]) -> dict[str, Any]:
        result = self.disclosure_collector.collect_sources(source_keys)
        self._clear_context_cache()
        return result

    def collect_disclosure_source_payload(
        self,
        source_key: str,
        payload: bytes,
        *,
        content_type: str = "application/octet-stream",
    ) -> dict[str, Any]:
        result = self.disclosure_collector.collect_source_payload(
            source_key,
            payload,
            content_type=content_type,
        )
        self._clear_context_cache()
        return result

    def collect_disclosures_if_due(self, *, min_age_days: int = 14) -> dict[str, Any]:
        now = datetime.now(UTC).replace(microsecond=0)
        latest = self._latest_job_run("disclosures")
        if latest and latest.get("finished_at"):
            finished_at = datetime.fromisoformat(latest["finished_at"].replace("Z", "+00:00"))
            age = now - finished_at.astimezone(UTC)
            if age < timedelta(days=min_age_days):
                return {
                    "changed": False,
                    "skipped": True,
                    "reason": "not_due",
                    "last_finished_at": latest["finished_at"],
                    "next_due_at": (finished_at + timedelta(days=min_age_days)).isoformat(),
                }
        return self._run_job("disclosures", self.collect_disclosures)

    def disclosure_export(self, source_keys: list[str] | None = None) -> dict[str, Any]:
        source_filter = ""
        params: list[Any] = []
        if source_keys:
            placeholders = ",".join("?" for _ in source_keys)
            source_filter = f" WHERE attachment_url IN ({placeholders})"
            params = list(source_keys)
        with open_db(self.settings.db_path) as connection:
            sources = [
                dict(row)
                for row in connection.execute(
                    f"SELECT * FROM disclosure_sources{source_filter}",
                    params,
                )
            ]
            event_filter = ""
            joined_params: list[Any] = []
            if source_keys:
                placeholders = ",".join("?" for _ in source_keys)
                event_filter = f" WHERE s.attachment_url IN ({placeholders})"
                joined_params = list(source_keys)
            events = [
                dict(row)
                for row in connection.execute(
                    f"""
                    SELECT e.*, s.attachment_url AS source_key
                    FROM disclosure_outage_events e
                    JOIN disclosure_sources s ON s.id = e.source_id
                    {event_filter}
                    ORDER BY e.source_id, e.source_row_id
                    """,
                    joined_params,
                )
            ]
            metrics = [
                dict(row)
                for row in connection.execute(
                    f"""
                    SELECT m.*, s.attachment_url AS source_key
                    FROM disclosure_annual_metrics m
                    JOIN disclosure_sources s ON s.id = m.source_id
                    {event_filter}
                    ORDER BY m.source_id, COALESCE(m.year, 0), m.geography_label
                    """,
                    joined_params,
                )
            ]
            geometries = [
                dict(row)
                for row in connection.execute(
                    f"""
                    SELECT g.id, g.source_id, s.attachment_url AS source_key,
                           g.geography_label, g.geography_type, g.geometry_source,
                           g.centroid_lon, g.centroid_lat, g.bbox_min_lon, g.bbox_min_lat,
                           g.bbox_max_lon, g.bbox_max_lat, g.updated_at
                    FROM disclosure_geometries g
                    JOIN disclosure_sources s ON s.id = g.source_id
                    {event_filter}
                    ORDER BY g.source_id, g.geography_label, g.geometry_source
                    """,
                    joined_params,
                )
            ]
        return {
            "sources": sources,
            "events": events,
            "metrics": metrics,
            "geometries": geometries,
            "counts": {
                "sources": len(sources),
                "events": len(events),
                "metrics": len(metrics),
                "geometries": len(geometries),
            },
        }

    def disclosure_payload_path(self, source_key: str) -> Path | None:
        with open_db(self.settings.db_path) as connection:
            row = connection.execute(
                """
                SELECT payload_path
                FROM disclosure_sources
                WHERE attachment_url = ?
                  AND payload_path IS NOT NULL
                """,
                (source_key,),
            ).fetchone()
        if not row:
            return None
        path = Path(row["payload_path"])
        try:
            path.relative_to(self.settings.raw_dir)
        except ValueError:
            return None
        return path if path.exists() else None

    def raw_snapshot_payload_path(self, payload_path: str) -> Path | None:
        path = Path(payload_path)
        try:
            path.relative_to(self.settings.raw_dir)
        except ValueError:
            return None
        return path if path.exists() else None

    def run_changed_collection_job(self) -> dict[str, Any]:
        return self._run_job("hydro_changed", self.collect_changed)

    def _run_job(self, job_name: str, factory) -> dict[str, Any]:
        started_at = datetime.now(UTC).replace(microsecond=0).isoformat()
        run_id = self._record_job_started(job_name, started_at)
        try:
            result = factory()
            self._record_job_finished(run_id, "ok", result)
            return result
        except Exception as exc:
            result = {"errors": [{"job": job_name, "error": str(exc)}]}
            self._record_job_finished(run_id, "error", result)
            return result

    def _record_job_started(self, job_name: str, started_at: str) -> int:
        with open_db(self.settings.db_path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO job_runs (job_name, started_at, status, summary_json)
                VALUES (?, ?, ?, ?)
                """,
                (job_name, started_at, "running", "{}"),
            )
            return int(cursor.lastrowid)

    def _record_job_finished(self, run_id: int, status: str, summary: dict[str, Any]) -> None:
        finished_at = datetime.now(UTC).replace(microsecond=0).isoformat()
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                UPDATE job_runs
                SET finished_at = ?, status = ?, summary_json = ?
                WHERE id = ?
                """,
                (finished_at, status, json.dumps(json_safe(summary), ensure_ascii=True), run_id),
            )

    def _latest_job_run(self, job_name: str) -> dict[str, Any] | None:
        with open_db(self.settings.db_path) as connection:
            row = connection.execute(
                """
                SELECT *
                FROM job_runs
                WHERE job_name = ?
                  AND status = 'ok'
                ORDER BY finished_at DESC, id DESC
                LIMIT 1
                """,
                (job_name,),
            ).fetchone()
        return dict(row) if row else None

    def _clear_context_cache(self) -> None:
        self._context_cache.clear()

    def _cached_context(
        self,
        key: str,
        factory,
        *,
        ttl_seconds: int | None = None,
        cache_none: bool = True,
    ):
        now = time.monotonic()
        cached = self._context_cache.get(key)
        if cached and (cached["expires_at"] is None or cached["expires_at"] > now):
            current_timer().set(f"context_cache.{key}.hit", True)
            return cached["value"]

        if cached:
            current_timer().set(f"context_cache.{key}.expired", True)

        if key not in self._context_cache or cached:
            current_timer().set(f"context_cache.{key}.hit", False)
            with current_timer().step(f"context_cache.{key}.build"):
                value = factory()
                if value is None and not cache_none:
                    return value
                self._context_cache[key] = {
                    "expires_at": None if ttl_seconds is None else now + max(ttl_seconds, 0),
                    "value": value,
                }
                return value

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
        include_map_layers: bool = True,
        record_history: bool = True,
        map_layer_scopes: set[str] | frozenset[str] | None = None,
    ) -> SearchResult:
        map_layer_scopes = self._normalize_map_layer_scopes(map_layer_scopes)
        needs_previous_layers = PREVIOUS_MAP_LAYER_SCOPE in map_layer_scopes
        needs_current_layers = bool(
            {CURRENT_MAP_LAYER_SCOPE, PLANNED_MAP_LAYER_SCOPE} & map_layer_scopes
        )
        needs_published_layers = PUBLISHED_MAP_LAYER_SCOPE in map_layer_scopes
        timer = current_timer()
        timer.set("search.query_length", len(query or ""))
        timer.set("search.radius_m", radius_m)
        timer.set("search.days", days)
        with timer.step("search.normalize_address"):
            normalized = normalize_address(query)
        if clearly_outside_quebec_query(normalized):
            with timer.step("search.collector_status"):
                collector_summary = self.collector_status()
            with timer.step("search.coverage_stats"):
                coverage = self.coverage_stats()
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=None,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=coverage,
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                current_map_layers=[],
                previous_map_layers=[],
                disclosure_layers=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="outside_quebec",
            )
        if self.settings.auto_refresh_on_search:
            with timer.step("search.auto_refresh_collect"):
                self.collect()

        with timer.step("search.geocode"):
            geocode = self.geocoder.geocode(normalized)
        with timer.step("search.collector_status"):
            collector_summary = self.collector_status()
        if geocode is None:
            with timer.step("search.coverage_stats"):
                coverage = self.coverage_stats()
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=None,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=coverage,
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                current_map_layers=[],
                previous_map_layers=[],
                disclosure_layers=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="geocode_failed",
            )
        with timer.step("search.geocode_dict"):
            geocode = self._geocode_dict(geocode)
        if not within_quebec_bounds(geocode["latitude"], geocode["longitude"]):
            with timer.step("search.coverage_stats"):
                coverage = self.coverage_stats()
            return SearchResult(
                normalized=normalized,
                address_id=None,
                cache_hit=False,
                geocode=geocode,
                matches=[],
                query_count=0,
                collector_summary=collector_summary,
                coverage=coverage,
                outage_matches=[],
                planned_matches=[],
                previous_outage_groups=[],
                current_map_layers=[],
                previous_map_layers=[],
                disclosure_layers=[],
                regional_metric_layers=[],
                radius_m=radius_m,
                error="outside_quebec",
            )

        with timer.step("search.upsert_address"):
            address_id, cache_hit = self._upsert_address(normalized, geocode)
        timer.set("search.address_cache_hit", cache_hit)
        with timer.step("search.find_current_matches"):
            matches = self._find_current_matches(
                geocode["latitude"], geocode["longitude"], radius_m, days, include_planned
            )
        with timer.step("search.split_current_matches"):
            outage_matches = [item for item in matches if item["outage_kind"] == "outage"]
            planned_matches = [item for item in matches if item["outage_kind"] == "planned"]
        with timer.step("search.find_archived_outage_matches"):
            archived_outage_matches = (
                self._find_archived_outage_matches(
                    geocode["latitude"],
                    geocode["longitude"],
                    radius_m,
                    days,
                    exclude_event_keys={self._outage_display_key(item) for item in outage_matches},
                )
                if needs_previous_layers or record_history
                else []
            )
        with timer.step("search.current_map_layers"):
            if include_map_layers and needs_current_layers:
                current_map_layers = self._current_operational_map_layers(
                    include_planned=include_planned and PLANNED_MAP_LAYER_SCOPE in map_layer_scopes
                )
                current_map_layers = self._filter_current_map_layers(
                    current_map_layers,
                    map_layer_scopes,
                )
            else:
                current_map_layers = []
        with timer.step("search.previous_map_layers"):
            previous_map_layers = (
                self._previous_operational_map_layers()
                if include_map_layers and needs_previous_layers
                else []
            )
        with timer.step("search.disclosure_layers"):
            disclosure_layers = (
                self._disclosure_map_layers()
                if include_map_layers and needs_published_layers
                else []
            )
        with timer.step("search.regional_metric_layers"):
            regional_metric_layers = (
                self._regional_metric_map_layers()
                if include_map_layers and needs_published_layers
                else []
            )
        with timer.step("search.save_matches"):
            if record_history:
                self._save_matches(address_id, outage_matches + archived_outage_matches)
        with timer.step("search.previous_outage_groups"):
            if needs_previous_layers:
                previous_outage_groups = self._previous_outage_groups(
                    address_id=address_id,
                    exclude_event_keys={self._outage_display_key(item) for item in outage_matches},
                )
                if archived_outage_matches:
                    previous_outage_groups = self._group_outage_matches(
                        archived_outage_matches,
                        exclude_event_keys={
                            self._outage_display_key(item) for item in outage_matches
                        },
                    )
            else:
                previous_outage_groups = []
        with timer.step("search.record_query"):
            if record_history:
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
            else:
                query_count = self._query_count(address_id)
        with timer.step("search.coverage_stats"):
            coverage = self.coverage_stats()
        timer.set("search.match_count", len(matches))
        timer.set("search.archived_outage_match_count", len(archived_outage_matches))
        timer.set("search.current_map_layer_count", len(current_map_layers))
        timer.set("search.disclosure_layer_count", len(disclosure_layers))
        timer.set("search.regional_metric_layer_count", len(regional_metric_layers))
        return SearchResult(
            normalized=normalized,
            address_id=address_id,
            cache_hit=cache_hit,
            geocode=geocode,
            matches=matches,
            query_count=query_count,
            collector_summary=collector_summary,
            coverage=coverage,
            outage_matches=outage_matches,
            planned_matches=planned_matches,
            previous_outage_groups=previous_outage_groups,
            current_map_layers=current_map_layers,
            previous_map_layers=previous_map_layers,
            disclosure_layers=disclosure_layers,
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
        include_map_layers: bool = True,
        record_history: bool = True,
        map_layer_scopes: set[str] | frozenset[str] | None = None,
    ) -> SearchResult:
        map_layer_scopes = self._normalize_map_layer_scopes(map_layer_scopes)
        needs_previous_layers = PREVIOUS_MAP_LAYER_SCOPE in map_layer_scopes
        needs_current_layers = bool(
            {CURRENT_MAP_LAYER_SCOPE, PLANNED_MAP_LAYER_SCOPE} & map_layer_scopes
        )
        needs_published_layers = PUBLISHED_MAP_LAYER_SCOPE in map_layer_scopes
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
                current_map_layers=[],
                previous_map_layers=[],
                disclosure_layers=[],
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
        archived_outage_matches = (
            self._find_archived_outage_matches(
                latitude,
                longitude,
                radius_m,
                days,
                exclude_event_keys={self._outage_display_key(item) for item in outage_matches},
            )
            if needs_previous_layers or record_history
            else []
        )
        if include_map_layers and needs_current_layers:
            current_map_layers = self._current_operational_map_layers(
                include_planned=include_planned and PLANNED_MAP_LAYER_SCOPE in map_layer_scopes
            )
            current_map_layers = self._filter_current_map_layers(
                current_map_layers,
                map_layer_scopes,
            )
        else:
            current_map_layers = []
        previous_map_layers = (
            self._previous_operational_map_layers()
            if include_map_layers and needs_previous_layers
            else []
        )
        disclosure_layers = (
            self._disclosure_map_layers() if include_map_layers and needs_published_layers else []
        )
        regional_metric_layers = (
            self._regional_metric_map_layers()
            if include_map_layers and needs_published_layers
            else []
        )
        if record_history:
            self._save_matches(address_id, outage_matches + archived_outage_matches)
        previous_outage_groups = (
            self._previous_outage_groups(
                address_id=address_id,
                exclude_event_keys={self._outage_display_key(item) for item in outage_matches},
            )
            if needs_previous_layers
            else []
        )
        if record_history:
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
        else:
            query_count = self._query_count(address_id)
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
            current_map_layers=current_map_layers,
            previous_map_layers=previous_map_layers,
            disclosure_layers=disclosure_layers,
            regional_metric_layers=regional_metric_layers,
            radius_m=radius_m,
        )

    @staticmethod
    def _normalize_map_layer_scopes(
        scopes: set[str] | frozenset[str] | None,
    ) -> frozenset[str]:
        if scopes is None:
            return ALL_MAP_LAYER_SCOPES
        return frozenset(scope for scope in scopes if scope in ALL_MAP_LAYER_SCOPES)

    @staticmethod
    def _filter_current_map_layers(
        layers: list[dict[str, Any]],
        scopes: frozenset[str],
    ) -> list[dict[str, Any]]:
        return [
            item
            for item in layers
            if (item.get("outage_kind") == "outage" and CURRENT_MAP_LAYER_SCOPE in scopes)
            or (item.get("outage_kind") == "planned" and PLANNED_MAP_LAYER_SCOPE in scopes)
        ]

    def collector_status(self) -> dict[str, Any]:
        return self._cached_context("collector_status", self._collector_status)

    def _collector_status(self) -> dict[str, Any]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("status")
            if payload and payload.get("collector"):
                return payload["collector"]
            return {"snapshot_count": 0, "latest": None, "earliest": None}
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
        return self._cached_context("coverage_stats", self._coverage_stats)

    def _coverage_stats(self) -> dict[str, Any]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("status")
            if payload and payload.get("coverage"):
                return payload["coverage"]
            return {
                "outage_count": 0,
                "planned_count": 0,
                "event_count": 0,
                "geometry_count": 0,
                "outage_min_time": None,
                "outage_max_time": None,
                "planned_min_time": None,
                "planned_max_time": None,
                "disclosure_source_count": 0,
                "disclosure_event_count": 0,
                "disclosure_metric_count": 0,
            }
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
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_post(
                "address",
                {"normalized": vars(normalized), "geocode": geocode},
            )
            if payload:
                return int(payload["address_id"]), bool(payload["cache_hit"])
            raise RuntimeError("D1 runtime address upsert failed")
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
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_post(
                "query",
                {
                    "address_id": address_id,
                    "original_query": original_query,
                    "normalized_query": normalized_query,
                    "language": language,
                    "radius_m": radius_m,
                    "days": days,
                    "include_planned": include_planned,
                    "cache_hit": cache_hit,
                },
            )
            if payload:
                return int(payload["count"])
            return 0
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

    def _query_count(self, address_id: int) -> int:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("query-count", {"address_id": str(address_id)})
            if payload:
                return int(payload["count"])
            return 0
        with open_db(self.settings.db_path) as connection:
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
        if self.settings.durable_nearby_url:
            durable_matches = self._find_durable_current_matches(
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
                include_planned=include_planned,
            )
            if durable_matches is not None:
                return durable_matches
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

    def _find_durable_current_matches(
        self,
        *,
        latitude: float,
        longitude: float,
        radius_m: int,
        include_planned: bool,
    ) -> list[dict[str, Any]] | None:
        timer = current_timer()
        query = urllib.parse.urlencode(
            {
                "lat": f"{latitude:.7f}",
                "lon": f"{longitude:.7f}",
                "radius_m": str(radius_m),
                "limit": "500",
            }
        )
        url = f"{self.settings.durable_nearby_url}?{query}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)"},
        )
        try:
            with timer.step("search.durable_nearby_fetch"):
                with urllib.request.urlopen(request, timeout=8) as response:
                    payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            timer.set("search.durable_nearby_error", str(exc))
            return None

        matches = [
            self._durable_item_to_match(item, radius_m)
            for item in payload.get("items", [])
            if include_planned or item.get("kind") != "planned"
        ]
        matches = [item for item in matches if item is not None]
        matches = self._dedupe_matches(matches)
        matches.sort(
            key=lambda item: (
                self._match_rank(item["match_type"]),
                item["confidence"],
                item["sort_time"] or "",
            ),
            reverse=True,
        )
        timer.set("search.durable_nearby_count", len(matches))
        return matches

    @staticmethod
    def _durable_item_to_match(item: dict[str, Any], radius_m: int) -> dict[str, Any] | None:
        outage_kind = "planned" if item.get("kind") == "planned" else "outage"
        distance_m = item.get("distance_m")
        if distance_m is None:
            return None
        confidence = max(0.45, 0.82 - float(distance_m) / max(radius_m * 1.5, 1))
        start_time = (
            item.get("start_time") if outage_kind == "outage" else item.get("scheduled_start")
        )
        end_time = (
            item.get("estimated_restore_time")
            if outage_kind == "outage"
            else item.get("scheduled_end")
        )
        return {
            "address_id": None,
            "outage_kind": outage_kind,
            "record_id": item.get("id"),
            "geometry_id": None,
            "geometry_geojson": None,
            "match_type": "nearby_match",
            "distance_m": round(float(distance_m), 1),
            "confidence": round(confidence, 2),
            "municipality_code": item.get("municipality_code"),
            "customers_affected": item.get("customers_affected"),
            "status": item.get("status"),
            "interruption_type": item.get("interruption_type")
            if outage_kind == "outage"
            else "AIP",
            "start_time": start_time,
            "end_time": end_time,
            "centroid_lat": item.get("centroid_lat"),
            "centroid_lon": item.get("centroid_lon"),
            "sort_time": start_time,
        }

    def _find_archived_outage_matches(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
        days: int,
        exclude_event_keys: set[tuple[Any, ...]],
    ) -> list[dict[str, Any]]:
        if self.settings.durable_history_url:
            durable_matches = self._find_durable_archived_outage_matches(
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
                days=days,
                exclude_event_keys=exclude_event_keys,
            )
            if durable_matches is not None:
                return durable_matches
        cutoff = (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        with open_db(self.settings.db_path) as connection:
            latest_snapshot = connection.execute(
                """
                SELECT id
                FROM raw_snapshots
                WHERE source_type = 'bismarkers'
                ORDER BY fetched_at DESC, id DESC
                LIMIT 1
                """
            ).fetchone()
            latest_snapshot_id = latest_snapshot["id"] if latest_snapshot else None
            geometry_rows = connection.execute(
                """
                SELECT *
                FROM outage_geometries
                ORDER BY id DESC
                """
            ).fetchall()
            outage_rows = connection.execute(
                """
                SELECT r.*
                FROM outage_records r
                JOIN raw_snapshots s ON s.id = r.snapshot_id
                WHERE s.source_type = 'bismarkers'
                  AND (? IS NULL OR s.id != ?)
                  AND COALESCE(r.outage_start_time, '') >= ?
                ORDER BY COALESCE(r.outage_start_time, r.created_at) DESC
                """,
                (latest_snapshot_id, latest_snapshot_id, cutoff),
            ).fetchall()
        matches = self._match_rows(
            rows=outage_rows,
            geometry_payload=[dict(row) for row in geometry_rows],
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
            outage_kind="outage",
        )
        matches = [
            item
            for item in self._dedupe_matches(matches)
            if self._outage_display_key(item) not in exclude_event_keys
        ]
        matches.sort(key=lambda item: item["sort_time"] or "", reverse=True)
        return matches

    def _find_durable_archived_outage_matches(
        self,
        *,
        latitude: float,
        longitude: float,
        radius_m: int,
        days: int,
        exclude_event_keys: set[tuple[Any, ...]],
    ) -> list[dict[str, Any]] | None:
        timer = current_timer()
        query = urllib.parse.urlencode(
            {
                "lat": f"{latitude:.7f}",
                "lon": f"{longitude:.7f}",
                "radius_m": str(radius_m),
                "days": str(days),
                "limit": "1000",
            }
        )
        url = f"{self.settings.durable_history_url}?{query}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)"},
        )
        try:
            with timer.step("search.durable_history_fetch"):
                with urllib.request.urlopen(request, timeout=8) as response:
                    payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            timer.set("search.durable_history_error", str(exc))
            return None

        matches = [
            self._durable_history_item_to_match(item, radius_m) for item in payload.get("items", [])
        ]
        matches = [item for item in matches if item is not None]
        matches = [
            item
            for item in self._dedupe_matches(matches)
            if self._outage_display_key(item) not in exclude_event_keys
        ]
        matches.sort(key=lambda item: item["sort_time"] or "", reverse=True)
        timer.set("search.durable_history_count", len(matches))
        return matches

    @staticmethod
    def _durable_history_item_to_match(
        item: dict[str, Any], radius_m: int
    ) -> dict[str, Any] | None:
        distance_m = item.get("distance_m")
        if distance_m is None:
            return None
        confidence = max(0.45, 0.82 - float(distance_m) / max(radius_m * 1.5, 1))
        return {
            "address_id": None,
            "outage_kind": "outage",
            "record_id": item.get("event_key"),
            "geometry_id": None,
            "geometry_geojson": None,
            "match_type": "nearby_match",
            "distance_m": round(float(distance_m), 1),
            "confidence": round(confidence, 2),
            "municipality_code": item.get("municipality_code"),
            "customers_affected": item.get("customers_affected"),
            "status": item.get("status"),
            "interruption_type": item.get("interruption_type"),
            "start_time": item.get("start_time"),
            "end_time": item.get("end_time"),
            "centroid_lat": item.get("centroid_lat"),
            "centroid_lon": item.get("centroid_lon"),
            "sort_time": item.get("start_time") or item.get("last_seen_at"),
            "event_count": item.get("record_count"),
        }

    def _current_operational_map_layers(self, include_planned: bool) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url or self.settings.durable_nearby_url:
            return self._build_current_operational_map_layers(include_planned)
        return self._cached_context(
            f"current_operational_map_layers:{int(include_planned)}",
            lambda: self._build_current_operational_map_layers(include_planned),
        )

    def _previous_operational_map_layers(
        self, limit: int = DEFAULT_PREVIOUS_MAP_LAYER_LIMIT
    ) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url:
            return self._build_previous_operational_map_layers(limit)
        return self._cached_context(
            f"previous_operational_map_layers:{limit}",
            lambda: self._build_previous_operational_map_layers(limit),
        )

    def _build_previous_operational_map_layers(self, limit: int) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("previous-map-layers", {"limit": str(limit)})
            if payload:
                return payload.get("layers", [])
            return []
        with open_db(self.settings.db_path) as connection:
            current_rows = connection.execute(
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
                """
            ).fetchall()
            rows = connection.execute(
                """
                SELECT r.*
                FROM outage_records r
                JOIN raw_snapshots s ON s.id = r.snapshot_id
                WHERE s.source_type = 'bismarkers'
                  AND r.centroid_lat IS NOT NULL
                  AND r.centroid_lon IS NOT NULL
                  AND s.id != (
                    SELECT id
                    FROM raw_snapshots
                    WHERE source_type = 'bismarkers'
                    ORDER BY fetched_at DESC, id DESC
                    LIMIT 1
                  )
                ORDER BY COALESCE(r.outage_start_time, r.created_at) DESC
                LIMIT ?
                """,
                (limit * 4,),
            ).fetchall()
            geometry_rows = connection.execute(
                """
                SELECT *
                FROM outage_geometries
                ORDER BY id DESC
                """
            ).fetchall()
        current_keys = {
            self._outage_display_key(
                {
                    "municipality_code": row["municipality_code"],
                    "start_time": row["outage_start_time"],
                    "centroid_lat": row["centroid_lat"],
                    "centroid_lon": row["centroid_lon"],
                    "interruption_type": row["interruption_type"],
                }
            )
            for row in current_rows
        }
        rows = [
            row
            for row in rows
            if self._outage_display_key(
                {
                    "municipality_code": row["municipality_code"],
                    "start_time": row["outage_start_time"],
                    "centroid_lat": row["centroid_lat"],
                    "centroid_lon": row["centroid_lon"],
                    "interruption_type": row["interruption_type"],
                }
            )
            not in current_keys
        ]
        layers = self._map_layers_for_rows(
            rows=rows,
            geometry_payload=[dict(row) for row in geometry_rows],
            outage_kind="previous_outage",
        )
        return layers[:limit]

    def _build_current_operational_map_layers(self, include_planned: bool) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get(
                "operational-map-layers",
                {"include_planned": "1" if include_planned else "0"},
            )
            if payload:
                return payload.get("layers", [])

        if self.settings.durable_nearby_url:
            layers = self._durable_current_operational_map_layers()
            if layers:
                return [
                    item for item in layers if include_planned or item["outage_kind"] != "planned"
                ]

        with open_db(self.settings.db_path) as connection:
            geometry_rows = connection.execute(
                """
                SELECT g.*, s.source_type
                FROM outage_geometries g
                JOIN raw_snapshots s ON s.id = g.snapshot_id
                WHERE s.source_type IN ('bispoly', 'aippoly')
                  AND s.id = (
                    SELECT id
                    FROM raw_snapshots s2
                    WHERE s2.source_type = s.source_type
                    ORDER BY s2.fetched_at DESC, s2.id DESC
                    LIMIT 1
                )
                ORDER BY g.id DESC
                """
            ).fetchall()
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
                ORDER BY COALESCE(r.outage_start_time, r.created_at) DESC
                """
            ).fetchall()
            planned_rows = []
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
                    ORDER BY COALESCE(p.scheduled_start, p.created_at) DESC
                    """
                ).fetchall()

        geometry_payload = [dict(row) for row in geometry_rows]
        layers = self._map_layers_for_rows(
            rows=outage_rows,
            geometry_payload=geometry_payload,
            outage_kind="outage",
        )
        if include_planned:
            layers.extend(
                self._map_layers_for_rows(
                    rows=planned_rows,
                    geometry_payload=geometry_payload,
                    outage_kind="planned",
                )
            )
        return layers

    def _durable_current_operational_map_layers(self) -> list[dict[str, Any]]:
        url = self.settings.durable_nearby_url.replace("/nearby", "/hydro")
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)"},
        )
        try:
            with current_timer().step("current_layers.durable_hydro_fetch"):
                with urllib.request.urlopen(request, timeout=8) as response:
                    payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            current_timer().set("current_layers.durable_hydro_error", str(exc))
            return []

        layers = [
            self._durable_feed_item_to_layer(item, "outage") for item in payload.get("outages", [])
        ]
        layers.extend(
            self._durable_feed_item_to_layer(item, "planned") for item in payload.get("planned", [])
        )
        return [item for item in layers if item is not None]

    @staticmethod
    def _durable_feed_item_to_layer(
        item: dict[str, Any], outage_kind: str
    ) -> dict[str, Any] | None:
        if item.get("centroid_lat") is None or item.get("centroid_lon") is None:
            return None
        start_time = (
            item.get("outage_start_time")
            if outage_kind == "outage"
            else item.get("scheduled_start")
        )
        end_time = (
            item.get("estimated_restore_time")
            if outage_kind == "outage"
            else item.get("scheduled_end")
        )
        return {
            "address_id": None,
            "outage_kind": outage_kind,
            "record_id": item.get("id"),
            "geometry_id": None,
            "geometry_geojson": None,
            "match_type": "current_feed_map",
            "distance_m": None,
            "confidence": 1.0,
            "municipality_code": item.get("municipality_code"),
            "customers_affected": item.get("customers_affected"),
            "status": item.get("status"),
            "interruption_type": item.get("interruption_type")
            if outage_kind == "outage"
            else "AIP",
            "start_time": start_time,
            "end_time": end_time,
            "centroid_lat": item.get("centroid_lat"),
            "centroid_lon": item.get("centroid_lon"),
            "sort_time": start_time,
        }

    def _map_layers_for_rows(
        self,
        *,
        rows,
        geometry_payload: list[dict[str, Any]],
        outage_kind: str,
    ) -> list[dict[str, Any]]:
        groups: dict[tuple[str, int | str], dict[str, Any]] = {}
        geometry_index = self._geometry_rows_by_version(geometry_payload)
        for row in rows:
            centroid_lat = row["centroid_lat"]
            centroid_lon = row["centroid_lon"]
            if centroid_lat is None or centroid_lon is None:
                continue
            geometry_match = self._find_geometry_match(
                geometry_index,
                row["source_version"],
                centroid_lat,
                centroid_lon,
                centroid_lat,
                centroid_lon,
            )
            geometry_id = geometry_match["geometry_id"] if geometry_match else None
            if outage_kind == "previous_outage":
                key = (outage_kind, self._previous_layer_group_key(row, geometry_match))
            else:
                key = (outage_kind, geometry_id if geometry_id is not None else row["id"])
            is_outage = outage_kind in {"outage", "previous_outage"}
            start_time = row["outage_start_time"] if is_outage else row["scheduled_start"]
            end_time = row["estimated_restore_time"] if is_outage else row["scheduled_end"]
            event = {
                "start_time": start_time,
                "end_time": end_time,
                "customers_affected": row["customers_affected"],
                "status": row["status"],
                "municipality_code": row["municipality_code"],
                "centroid_lat": centroid_lat,
                "centroid_lon": centroid_lon,
                "distance_m": None,
            }
            event_key = self._outage_event_key(
                {
                    "municipality_code": row["municipality_code"],
                    "start_time": start_time,
                    "centroid_lat": centroid_lat,
                    "centroid_lon": centroid_lon,
                    "interruption_type": row["interruption_type"] if is_outage else "AIP",
                }
            )
            group = groups.get(key)
            if group is None:
                groups[key] = {
                    "outage_kind": outage_kind,
                    "record_id": row["id"],
                    "geometry_id": geometry_id,
                    "geometry_geojson": geometry_match["geometry_geojson"]
                    if geometry_match
                    else None,
                    "match_type": "previous_context_map"
                    if outage_kind == "previous_outage"
                    else "current_feed_map",
                    "distance_m": None,
                    "confidence": 0.5,
                    "municipality_code": row["municipality_code"],
                    "customers_affected": row["customers_affected"],
                    "status": row["status"],
                    "interruption_type": row["interruption_type"] if is_outage else "AIP",
                    "start_time": start_time,
                    "end_time": end_time,
                    "centroid_lat": centroid_lat,
                    "centroid_lon": centroid_lon,
                    "sort_time": start_time,
                    "event_count": 1,
                    "recent_events": [event],
                    "_event_keys": {event_key} if outage_kind == "previous_outage" else set(),
                }
            else:
                if outage_kind == "previous_outage" and event_key in group["_event_keys"]:
                    continue
                if outage_kind == "previous_outage":
                    group["_event_keys"].add(event_key)
                group["event_count"] += 1
                group["recent_events"].append(event)
                if outage_kind in {"planned", "previous_outage"}:
                    group["customers_affected"] = max(
                        group["customers_affected"] or 0,
                        row["customers_affected"] or 0,
                    )
                else:
                    group["customers_affected"] = (group["customers_affected"] or 0) + (
                        row["customers_affected"] or 0
                    )
                if (start_time or "") > (group["start_time"] or ""):
                    group["start_time"] = start_time
                    group["end_time"] = end_time
                    group["status"] = row["status"]
                    group["sort_time"] = start_time
        layers = list(groups.values())
        for layer in layers:
            layer.pop("_event_keys", None)
        layers.sort(key=lambda item: item["sort_time"] or "", reverse=True)
        return layers

    @staticmethod
    def _previous_layer_group_key(row: Any, geometry_match: dict[str, Any] | None) -> str:
        if geometry_match is not None:
            geometry_lat = geometry_match.get("centroid_lat")
            geometry_lon = geometry_match.get("centroid_lon")
            rounded_geometry = (
                f"{float(geometry_lat):.2f}:{float(geometry_lon):.2f}"
                if geometry_lat is not None and geometry_lon is not None
                else ""
            )
            return ":".join(
                [
                    str(row["municipality_code"] or ""),
                    rounded_geometry,
                ]
            )
        return ":".join(
            [
                str(row["municipality_code"] or ""),
                f"{float(row['centroid_lat']):.4f}",
                f"{float(row['centroid_lon']):.4f}",
                str(row["interruption_type"] or ""),
                str(row["outage_start_time"] or ""),
            ]
        )

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
        geometry_index = self._geometry_rows_by_version(geometry_payload)
        containing_versions = self._geometry_versions_containing_point(
            geometry_payload,
            latitude=latitude,
            longitude=longitude,
        )
        for row in rows:
            centroid_distance = None
            if row["centroid_lat"] is not None and row["centroid_lon"] is not None:
                centroid_distance = haversine_meters(
                    latitude, longitude, row["centroid_lat"], row["centroid_lon"]
                )
            if (centroid_distance is None or centroid_distance > radius_m) and row[
                "source_version"
            ] not in containing_versions:
                continue
            geometry_match = self._find_geometry_match(
                geometry_index,
                row["source_version"],
                latitude,
                longitude,
                row["centroid_lat"],
                row["centroid_lon"],
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

    @staticmethod
    def _geometry_rows_by_version(
        geometry_rows: list[dict[str, Any]],
    ) -> dict[str, list[dict[str, Any]]]:
        rows_by_version: dict[str, list[dict[str, Any]]] = {}
        for row in geometry_rows:
            rows_by_version.setdefault(row["source_version"], []).append(row)
        return rows_by_version

    @staticmethod
    def _geometry_geojson(row: dict[str, Any]) -> dict[str, Any]:
        if "_geometry_geojson" not in row:
            row["_geometry_geojson"] = json.loads(row["geometry_geojson"])
        return row["_geometry_geojson"]

    @staticmethod
    def _geometry_versions_containing_point(
        geometry_rows: list[dict[str, Any]], *, latitude: float, longitude: float
    ) -> set[str]:
        versions: set[str] = set()
        for row in geometry_rows:
            if row["bbox_min_lon"] is None or (
                row["bbox_min_lon"] <= longitude <= row["bbox_max_lon"]
                and row["bbox_min_lat"] <= latitude <= row["bbox_max_lat"]
            ):
                versions.add(row["source_version"])
        return versions

    def _find_geometry_match(
        self,
        geometry_rows_by_version: dict[str, list[dict[str, Any]]],
        source_version: str,
        latitude: float,
        longitude: float,
        row_centroid_lat: float | None,
        row_centroid_lon: float | None,
    ) -> dict[str, Any] | None:
        same_version_rows = geometry_rows_by_version.get(source_version, [])
        if not same_version_rows:
            return None
        assigned_row = self._assign_geometry_row(
            same_version_rows=same_version_rows,
            row_centroid_lat=row_centroid_lat,
            row_centroid_lon=row_centroid_lon,
        )
        if assigned_row is None:
            return None

        geojson = self._geometry_geojson(assigned_row)
        contains = False
        if assigned_row["bbox_min_lon"] is None or (
            assigned_row["bbox_min_lon"] <= longitude <= assigned_row["bbox_max_lon"]
            and assigned_row["bbox_min_lat"] <= latitude <= assigned_row["bbox_max_lat"]
        ):
            polygon = geojson["coordinates"][0]
            contains = point_in_polygon(longitude, latitude, polygon)

        return {
            "contains": contains,
            "geometry_id": assigned_row["id"],
            "geometry_geojson": geojson,
            "polygon_id": assigned_row["polygon_id"],
            "name": assigned_row["name"],
            "centroid_lat": assigned_row["centroid_lat"],
            "centroid_lon": assigned_row["centroid_lon"],
        }

    @staticmethod
    def _assign_geometry_row(
        *,
        same_version_rows: list[dict[str, Any]],
        row_centroid_lat: float | None,
        row_centroid_lon: float | None,
    ) -> dict[str, Any] | None:
        if not same_version_rows:
            return None
        if row_centroid_lat is None or row_centroid_lon is None:
            return same_version_rows[0]

        rows_with_centroids = [
            row
            for row in same_version_rows
            if row["centroid_lat"] is not None and row["centroid_lon"] is not None
        ]
        if not rows_with_centroids:
            return same_version_rows[0]

        return min(
            rows_with_centroids,
            key=lambda row: haversine_meters(
                row_centroid_lat,
                row_centroid_lon,
                row["centroid_lat"],
                row["centroid_lon"],
            ),
        )

    def _save_matches(self, address_id: int, matches: list[dict[str, Any]]) -> None:
        if self.settings.durable_runtime_url:
            payload_matches = [
                {**item, "event_key": self._outage_event_key(item)}
                for item in matches
                if item["outage_kind"] == "outage"
            ]
            self._durable_runtime_post(
                "matches",
                {"address_id": address_id, "matches": payload_matches},
            )
            return
        with open_db(self.settings.db_path) as connection:
            for item in matches:
                if item["outage_kind"] != "outage":
                    continue
                connection.execute(
                    """
                    INSERT INTO address_outage_matches
                    (address_id, outage_kind, record_id, event_key, geometry_id, match_type, distance_m, confidence)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(address_id, outage_kind, event_key)
                    WHERE event_key IS NOT NULL
                    DO UPDATE SET
                        record_id = excluded.record_id,
                        geometry_id = excluded.geometry_id,
                        match_type = excluded.match_type,
                        distance_m = excluded.distance_m,
                        confidence = excluded.confidence,
                        matched_at = CURRENT_TIMESTAMP
                    """,
                    (
                        address_id,
                        item["outage_kind"],
                        item["record_id"],
                        self._outage_event_key(item),
                        item["geometry_id"],
                        item["match_type"],
                        item["distance_m"],
                        item["confidence"],
                    ),
                )

    def _previous_outage_groups(
        self, *, address_id: int, exclude_event_keys: set[tuple[Any, ...]]
    ) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("previous-groups", {"address_id": str(address_id)})
            if payload:
                groups = []
                for group in payload.get("groups", []):
                    events = [
                        event
                        for event in group.get("events", [])
                        if self._outage_display_key(event) not in exclude_event_keys
                    ]
                    if not events:
                        continue
                    group = {**group, "events": events, "event_count": len(events)}
                    groups.append(group)
                return groups
            return []
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT m.geometry_id, m.match_type, m.distance_m, m.confidence, m.matched_at,
                       r.id AS record_id, r.customers_affected, r.outage_start_time,
                       r.estimated_restore_time, r.interruption_type, r.status,
                       r.municipality_code, r.centroid_lon, r.centroid_lat,
                       g.name AS geometry_name
                FROM address_outage_matches m
                JOIN outage_records r ON r.id = m.record_id
                LEFT JOIN outage_geometries g ON g.id = m.geometry_id
                WHERE m.address_id = ?
                  AND m.outage_kind = 'outage'
                  AND m.geometry_id IS NOT NULL
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
            event_key = self._outage_event_key(event)
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
                    "geometry_geojson": None,
                    "events": [],
                    "event_keys": set(),
                },
            )
            if event_key in group["event_keys"]:
                continue
            group["event_keys"].add(event_key)
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
            group["events"] = group["events"][:3]
            group["event_count"] = len(group["events"])
            group["latest_start_time"] = (
                group["events"][0]["start_time"] if group["events"] else None
            )
            group.pop("event_keys", None)
        grouped.sort(key=lambda item: item["latest_start_time"] or "", reverse=True)
        return grouped[:12]

    def _group_outage_matches(
        self, matches: list[dict[str, Any]], exclude_event_keys: set[tuple[Any, ...]]
    ) -> list[dict[str, Any]]:
        groups: dict[str, dict[str, Any]] = {}
        for item in matches:
            if item["outage_kind"] != "outage":
                continue
            if self._outage_display_key(item) in exclude_event_keys:
                continue
            event_key = self._outage_event_key(item)
            group_key = (
                f"geometry:{item['geometry_id']}"
                if item.get("geometry_id") is not None
                else f"centroid:{round(item['centroid_lat'] or 0.0, 3)}:{round(item['centroid_lon'] or 0.0, 3)}"
            )
            group = groups.setdefault(
                group_key,
                {
                    "geometry_id": item.get("geometry_id"),
                    "label": item.get("municipality_code")
                    or f"{item.get('centroid_lat')}, {item.get('centroid_lon')}",
                    "municipality_code": item.get("municipality_code"),
                    "centroid_lat": item.get("centroid_lat"),
                    "centroid_lon": item.get("centroid_lon"),
                    "geometry_geojson": item.get("geometry_geojson"),
                    "events": [],
                    "event_keys": set(),
                },
            )
            if event_key in group["event_keys"]:
                continue
            group["event_keys"].add(event_key)
            group["events"].append(
                {**item, "sort_time": item.get("sort_time") or item.get("start_time")}
            )

        grouped = list(groups.values())
        for group in grouped:
            group["events"].sort(key=lambda item: item["sort_time"] or "", reverse=True)
            group["events"] = group["events"][:3]
            group["event_count"] = len(group["events"])
            group["latest_start_time"] = (
                group["events"][0]["start_time"] if group["events"] else None
            )
            group.pop("event_keys", None)
        grouped.sort(key=lambda item: item["latest_start_time"] or "", reverse=True)
        return grouped[:12]

    @staticmethod
    def _outage_display_key(item: dict[str, Any]) -> tuple[Any, ...]:
        return (
            item["municipality_code"],
            item["start_time"],
            round(item["centroid_lat"] or 0.0, 3),
            round(item["centroid_lon"] or 0.0, 3),
            item["interruption_type"],
        )

    @classmethod
    def _outage_event_key(cls, item: dict[str, Any]) -> str:
        return "|".join(str(part or "") for part in cls._outage_display_key(item))

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

    def _regional_metric_map_layers(self) -> list[dict[str, Any]]:
        return self._cached_context(
            "regional_metric_map_layers",
            self._build_regional_metric_map_layers,
        )

    def _build_regional_metric_map_layers(self) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("map-context")
            if payload and "regional_metric_layers" in payload:
                return payload["regional_metric_layers"]
            return []
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT m.*, s.dai_number, s.title, s.attachment_url,
                       g.centroid_lon, g.centroid_lat
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
                    "geometry_geojson": None,
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
        return self._cached_context("disclosure_map_layers", self._build_disclosure_map_layers)

    def _build_disclosure_map_layers(self) -> list[dict[str, Any]]:
        if self.settings.durable_runtime_url:
            payload = self._durable_runtime_get("map-context")
            if payload and "disclosure_layers" in payload:
                return payload["disclosure_layers"]
            return []
        with open_db(self.settings.db_path) as connection:
            rows = connection.execute(
                """
                SELECT e.id, e.start_time, e.end_time, e.duration_seconds, e.customers_affected,
                       e.cause, e.equipment, e.geography_label, e.geography_type, e.precision_label,
                       s.dai_number, s.title, s.attachment_url,
                       g.centroid_lon, g.centroid_lat
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
                    "geometry_geojson": None,
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


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "__dict__"):
        return json_safe(vars(value))
    return value
