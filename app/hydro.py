from __future__ import annotations

import hashlib
import json
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from .db import open_db

HYDRO_ROOT = "https://pannes.hydroquebec.com/pannes/donnees/v3_0"


@dataclass(frozen=True)
class Snapshot:
    source_type: str
    version: str
    fetched_at: str
    payload_path: Path
    content_type: str
    sha256: str
    http_status: int


def fetch_bytes(url: str) -> tuple[bytes, int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "pannes-historiques/0.1"})
    with urllib.request.urlopen(request, timeout=20) as response:
        content = response.read()
        return content, response.getcode(), response.headers.get_content_type()


class HydroCollector:
    def __init__(self, settings):
        self.settings = settings

    def collect_all(self) -> dict[str, Any]:
        results: dict[str, Any] = {"snapshots": [], "errors": []}
        for source in ("bis", "aip"):
            try:
                result = self.collect_source(source)
                results["snapshots"].extend(result["snapshots"])
                results["errors"].extend(result["errors"])
            except Exception as exc:
                results["errors"].append({"source": source, "error": str(exc)})
        return results

    def collect_changed(self) -> dict[str, Any]:
        results: dict[str, Any] = {"sources": [], "snapshots": [], "errors": []}
        for source in ("bis", "aip"):
            result = self.collect_source_if_changed(source)
            results["sources"].append(
                {
                    "source": source,
                    "version": result.get("version"),
                    "changed": result.get("changed", False),
                }
            )
            results["snapshots"].extend(result.get("snapshots", []))
            results["errors"].extend(result.get("errors", []))
        return results

    def collect_source(self, source: str) -> dict[str, Any]:
        if source not in {"bis", "aip"}:
            raise ValueError(f"unsupported Hydro-Quebec source: {source}")
        results: dict[str, Any] = {"snapshots": [], "errors": []}
        try:
            version = self._fetch_version(source)
            results["snapshots"].extend(self._fetch_payloads(source, version))
        except Exception as exc:
            results["errors"].append({"source": source, "error": str(exc)})
        return results

    def collect_source_if_changed(self, source: str) -> dict[str, Any]:
        if source not in {"bis", "aip"}:
            raise ValueError(f"unsupported Hydro-Quebec source: {source}")
        results: dict[str, Any] = {
            "source": source,
            "version": None,
            "changed": False,
            "snapshots": [],
            "errors": [],
        }
        try:
            version_payload, status, content_type = fetch_bytes(
                f"{HYDRO_ROOT}/{source}version.json"
            )
            if status != 200:
                raise RuntimeError(f"version fetch failed for {source}: HTTP {status}")
            version = self._parse_version(version_payload)
            results["version"] = version
            latest = self._latest_payload_version(source)
            if latest == version:
                return results
            results["changed"] = True
            results["snapshots"].extend(
                self._fetch_payloads(
                    source,
                    version,
                    version_payload=version_payload,
                    version_content_type=content_type,
                )
            )
        except Exception as exc:
            results["errors"].append({"source": source, "error": str(exc)})
        return results

    def _fetch_version(self, source: str) -> str:
        payload, status, _ = fetch_bytes(f"{HYDRO_ROOT}/{source}version.json")
        if status != 200:
            raise RuntimeError(f"version fetch failed for {source}: HTTP {status}")
        return self._parse_version(payload)

    @staticmethod
    def _parse_version(payload: bytes) -> str:
        version_data = json.loads(payload.decode("utf-8"))
        if isinstance(version_data, str):
            return version_data
        if isinstance(version_data, dict):
            return str(version_data.get("version") or next(iter(version_data.values())))
        raise RuntimeError("unexpected version payload")

    def _latest_payload_version(self, source: str) -> str | None:
        with open_db(self.settings.db_path) as connection:
            row = connection.execute(
                """
                SELECT source_version
                FROM raw_snapshots
                WHERE source_type = ?
                ORDER BY fetched_at DESC, id DESC
                LIMIT 1
                """,
                (f"{source}markers",),
            ).fetchone()
        return row["source_version"] if row else None

    def _fetch_payloads(
        self,
        source: str,
        version: str,
        *,
        version_payload: bytes | None = None,
        version_content_type: str | None = None,
    ) -> list[Snapshot]:
        now = datetime.now(UTC).replace(microsecond=0).isoformat()
        items: list[tuple[str, str, str]] = [
            (f"{source}version", f"{HYDRO_ROOT}/{source}version.json", "json"),
            (f"{source}markers", f"{HYDRO_ROOT}/{source}markers{version}.json", "json"),
            (f"{source}poly", f"{HYDRO_ROOT}/{source}poly{version}.kmz", "kmz"),
        ]
        snapshots: list[Snapshot] = []
        for source_type, url, extension in items:
            if source_type.endswith("version") and version_payload is not None:
                payload = version_payload
                status = 200
                content_type = version_content_type or "application/json"
            else:
                payload, status, content_type = fetch_bytes(url)
            snapshot = self._store_snapshot(
                source_type=source_type,
                version=version,
                fetched_at=now,
                payload=payload,
                content_type=content_type,
                extension=extension,
            )
            snapshots.append(snapshot)
            self._register_snapshot(snapshot)
            if source_type.endswith("markers"):
                self._ingest_markers(snapshot, payload)
            if source_type.endswith("poly"):
                self._ingest_polygons(snapshot, payload)
        return snapshots

    def _store_snapshot(
        self,
        *,
        source_type: str,
        version: str,
        fetched_at: str,
        payload: bytes,
        content_type: str,
        extension: str,
    ) -> Snapshot:
        dated = fetched_at.split("T", 1)[0]
        if source_type.endswith("version"):
            file_name = f"time={fetched_at.replace(':', '-')}.{extension}"
            path = (
                self.settings.raw_dir / "hydro_quebec" / source_type / f"date={dated}" / file_name
            )
        else:
            file_name = f"version={version}.{extension}"
            path = self.settings.raw_dir / "hydro_quebec" / source_type / file_name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        return Snapshot(
            source_type=source_type,
            version=version,
            fetched_at=fetched_at,
            payload_path=path,
            content_type=content_type,
            sha256=hashlib.sha256(payload).hexdigest(),
            http_status=200,
        )

    def _register_snapshot(self, snapshot: Snapshot) -> int:
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO raw_snapshots
                (source_type, source_version, fetched_at, payload_path, content_type, sha256, http_status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot.source_type,
                    snapshot.version,
                    snapshot.fetched_at,
                    str(snapshot.payload_path),
                    snapshot.content_type,
                    snapshot.sha256,
                    snapshot.http_status,
                ),
            )
            row = connection.execute(
                "SELECT id FROM raw_snapshots WHERE payload_path = ?",
                (str(snapshot.payload_path),),
            ).fetchone()
            return int(row["id"])

    def _snapshot_id(self, payload_path: Path) -> int:
        with open_db(self.settings.db_path) as connection:
            row = connection.execute(
                "SELECT id FROM raw_snapshots WHERE payload_path = ?",
                (str(payload_path),),
            ).fetchone()
        if not row:
            raise RuntimeError(f"snapshot missing for {payload_path}")
        return int(row["id"])

    def _ingest_markers(self, snapshot: Snapshot, payload: bytes) -> None:
        snapshot_id = self._snapshot_id(snapshot.payload_path)
        data = json.loads(payload.decode("utf-8"))
        with open_db(self.settings.db_path) as connection:
            if snapshot.source_type == "bismarkers":
                rows = data.get("pannes", []) if isinstance(data, dict) else data
                for index, record in enumerate(rows):
                    centroid_lon, centroid_lat = parse_centroid(safe_get(record, 4))
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO outage_records
                        (snapshot_id, source_version, record_index, customers_affected, outage_start_time,
                         estimated_restore_time, interruption_type, status, cause_group_code,
                         cause_detail_code, municipality_code, centroid_lon, centroid_lat, raw_record_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            snapshot_id,
                            snapshot.version,
                            index,
                            maybe_int(safe_get(record, 0)),
                            safe_get(record, 1),
                            safe_get(record, 2),
                            safe_get(record, 3),
                            safe_get(record, 5),
                            safe_get(record, 6),
                            safe_get(record, 7),
                            safe_get(record, 8),
                            centroid_lon,
                            centroid_lat,
                            json.dumps(record, ensure_ascii=True),
                        ),
                    )
                    self._upsert_resolved_event(
                        connection, "outage", snapshot.version, snapshot.fetched_at, record
                    )
            else:
                rows = data if isinstance(data, list) else data.get("interruptions", [])
                for index, record in enumerate(rows):
                    centroid_lon, centroid_lat = parse_centroid(safe_get(record, 15))
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO planned_interruptions
                        (snapshot_id, source_version, record_index, notice_id, scheduled_start, scheduled_end,
                         actual_start, actual_end, postponed_start, postponed_end, rescheduled_start,
                         rescheduled_end, customers_affected, municipality_code, status, centroid_lon,
                         centroid_lat, raw_record_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            snapshot_id,
                            snapshot.version,
                            index,
                            safe_get(record, 1),
                            safe_get(record, 2),
                            safe_get(record, 3),
                            safe_get(record, 4),
                            safe_get(record, 5),
                            safe_get(record, 6),
                            safe_get(record, 7),
                            safe_get(record, 8),
                            safe_get(record, 9),
                            maybe_int(safe_get(record, 10)),
                            safe_get(record, 13),
                            safe_get(record, 14),
                            centroid_lon,
                            centroid_lat,
                            json.dumps(record, ensure_ascii=True),
                        ),
                    )
                    self._upsert_resolved_event(
                        connection, "planned", snapshot.version, snapshot.fetched_at, record
                    )

    def _upsert_resolved_event(
        self,
        connection,
        outage_kind: str,
        source_version: str,
        fetched_at: str,
        record: list[Any],
    ) -> None:
        if outage_kind == "outage":
            centroid_lon, centroid_lat = parse_centroid(safe_get(record, 4))
            start_time = safe_get(record, 1) or ""
            municipality = safe_get(record, 8) or ""
            interruption_type = safe_get(record, 3) or ""
            customers = maybe_int(safe_get(record, 0))
            status = safe_get(record, 5) or ""
        else:
            centroid_lon, centroid_lat = parse_centroid(safe_get(record, 15))
            start_time = safe_get(record, 2) or ""
            municipality = safe_get(record, 13) or ""
            interruption_type = "AIP"
            customers = maybe_int(safe_get(record, 10))
            status = safe_get(record, 14) or ""

        rounded_lon = round(centroid_lon or 0.0, 3)
        rounded_lat = round(centroid_lat or 0.0, 3)
        time_bucket = (start_time or "")[:16]
        event_key = f"{outage_kind}|{municipality}|{rounded_lat}|{rounded_lon}|{interruption_type}|{time_bucket}"

        existing = connection.execute(
            "SELECT * FROM resolved_events WHERE event_key = ?",
            (event_key,),
        ).fetchone()
        if existing:
            versions = sorted(
                set(filter(None, (existing["source_versions"] or "").split(",") + [source_version]))
            )
            connection.execute(
                """
                UPDATE resolved_events
                SET last_seen_at = ?,
                    customers_min = COALESCE(MIN(customers_min, ?), ?),
                    customers_max = COALESCE(MAX(customers_max, ?), ?),
                    record_count = record_count + 1,
                    status = ?,
                    source_versions = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE event_key = ?
                """,
                (
                    fetched_at,
                    customers,
                    customers,
                    customers,
                    customers,
                    status,
                    ",".join(versions),
                    event_key,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO resolved_events
                (outage_kind, event_key, first_seen_at, last_seen_at, start_time, end_time,
                 municipality_code, centroid_lon, centroid_lat, customers_min, customers_max,
                 record_count, interruption_type, status, source_versions)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    outage_kind,
                    event_key,
                    fetched_at,
                    fetched_at,
                    start_time,
                    safe_get(record, 2) if outage_kind == "planned" else safe_get(record, 2),
                    municipality,
                    centroid_lon,
                    centroid_lat,
                    customers,
                    customers,
                    1,
                    interruption_type,
                    status,
                    source_version,
                ),
            )

    def _ingest_polygons(self, snapshot: Snapshot, payload: bytes) -> None:
        snapshot_id = self._snapshot_id(snapshot.payload_path)
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            kml_name = next((name for name in archive.namelist() if name.endswith(".kml")), None)
            if not kml_name:
                return
            kml_text = archive.read(kml_name).decode("utf-8", errors="replace")
        features = parse_kml_polygons(kml_text)
        with open_db(self.settings.db_path) as connection:
            for index, feature in enumerate(features):
                bbox = feature["bbox"]
                connection.execute(
                    """
                    INSERT OR IGNORE INTO outage_geometries
                    (snapshot_id, source_version, polygon_id, name, centroid_lon, centroid_lat,
                     bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat, geometry_geojson, raw_kml)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        snapshot_id,
                        snapshot.version,
                        feature["polygon_id"] or str(index),
                        feature["name"],
                        feature["centroid_lon"],
                        feature["centroid_lat"],
                        bbox[0],
                        bbox[1],
                        bbox[2],
                        bbox[3],
                        json.dumps(feature["geometry"], ensure_ascii=True),
                        feature["raw_coordinates"],
                    ),
                )


def safe_get(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def maybe_int(value: Any) -> int | None:
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_centroid(raw: Any) -> tuple[float | None, float | None]:
    if not raw:
        return None, None
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        return float(raw[0]), float(raw[1])
    if isinstance(raw, str):
        cleaned = raw.strip().strip("[]")
        if not cleaned:
            return None, None
        parts = [part.strip() for part in cleaned.split(",")]
        if len(parts) >= 2:
            return float(parts[0]), float(parts[1])
    return None, None


def parse_kml_polygons(kml_text: str) -> list[dict[str, Any]]:
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    root = ET.fromstring(kml_text)
    features: list[dict[str, Any]] = []
    for placemark in root.findall(".//kml:Placemark", ns):
        name = placemark.findtext("kml:name", default="", namespaces=ns)
        polygon = placemark.find(".//kml:Polygon", ns)
        if polygon is None:
            continue
        coordinates = polygon.findtext(".//kml:coordinates", default="", namespaces=ns).strip()
        points: list[list[float]] = []
        for chunk in coordinates.split():
            parts = chunk.split(",")
            if len(parts) < 2:
                continue
            lon = float(parts[0])
            lat = float(parts[1])
            points.append([lon, lat])
        if len(points) < 3:
            continue
        lons = [pt[0] for pt in points]
        lats = [pt[1] for pt in points]
        features.append(
            {
                "polygon_id": name,
                "name": name,
                "centroid_lon": sum(lons) / len(lons),
                "centroid_lat": sum(lats) / len(lats),
                "bbox": [min(lons), min(lats), max(lons), max(lats)],
                "geometry": {"type": "Polygon", "coordinates": [points]},
                "raw_coordinates": coordinates,
            }
        )
    return features
