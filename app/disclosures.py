from __future__ import annotations

import hashlib
import json
import re
import subprocess
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .addressing import normalize_text
from .db import open_db
from .hydro import maybe_int

ACCESS_ROOT = "https://www.hydroquebec.com/documents-donnees/loi-sur-acces/diffusion-informations/reponses-acces-information.html"


@dataclass(frozen=True)
class DisclosureSource:
    dai_number: str
    title: str
    attachment_url: str
    format: str
    geography_label: str
    geography_type: str
    extraction_method: str
    precision_label: str
    notes: str = ""
    source_url: str = ACCESS_ROOT
    published_date: str | None = None
    transmitted_date: str | None = None
    centroid_lat: float | None = None
    centroid_lon: float | None = None
    geometry_query: str | None = None
    osm_relation_id: int | None = None


DISCLOSURE_SOURCES = (
    DisclosureSource(
        dai_number="DAI-2022-0386",
        title="Pannes a Cote Saint-Luc - 2020-2022",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/xls/dai-2022-0386-document.xlsx",
        format="xlsx",
        geography_label="Cote Saint-Luc",
        geography_type="municipality",
        extraction_method="xlsx_rows",
        precision_label="municipality_context",
        notes="Native workbook extract with outage rows, causes, equipment, and customer counts.",
        centroid_lat=45.4687,
        centroid_lon=-73.6659,
        geometry_query="Cote Saint-Luc, Quebec, Canada",
        osm_relation_id=5361655,
    ),
    DisclosureSource(
        dai_number="DAI-2025-0275",
        title="Pannes dans l'arrondissement Outremont - 2023-2025",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0275-document.pdf",
        format="pdf",
        geography_label="Outremont",
        geography_type="borough",
        extraction_method="registered_pdf_pending_extraction",
        precision_label="borough_context",
        notes="PDF table with start, end, duration, and cause. Registered for provenance; row extraction is pending.",
        centroid_lat=45.5189,
        centroid_lon=-73.6072,
        geometry_query="Outremont, Montreal, Quebec, Canada",
    ),
    DisclosureSource(
        dai_number="DAI-2026-0042",
        title="Pannes 2024-2025 - Sheenboro, Chichester, Allumettes et Waltham",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2026-0042-document.pdf",
        format="pdf",
        geography_label="Sheenboro; Chichester; L'Isle-aux-Allumettes-Partie-Est; Waltham",
        geography_type="municipality_group",
        extraction_method="registered_pdf_pending_extraction",
        precision_label="municipality_context",
        notes="PDF table with row-level events for multiple municipalities. Registered for provenance; row extraction is pending.",
        centroid_lat=45.95,
        centroid_lon=-76.7,
    ),
    DisclosureSource(
        dai_number="DAI-2025-0333",
        title="Pannes a Saint-Felix-de-Kingsey - 2022-2024",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0333-document.pdf",
        format="pdf",
        geography_label="Saint-Felix-de-Kingsey",
        geography_type="municipality",
        extraction_method="registered_pdf_pending_extraction",
        precision_label="municipality_context",
        notes="PDF table with start, end, duration, cause, and municipality. Registered for provenance; row extraction is pending.",
        centroid_lat=45.8001,
        centroid_lon=-72.1809,
        geometry_query="Saint-Felix-de-Kingsey, Quebec, Canada",
    ),
)


def fetch_bytes(url: str) -> tuple[bytes, int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "pannes-historiques/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read(), response.getcode(), response.headers.get_content_type()
    except Exception:
        completed = subprocess.run(
            ["curl", "-fsSL", url],
            check=True,
            capture_output=True,
            timeout=45,
        )
        return completed.stdout, 200, content_type_from_url(url)


class DisclosureCollector:
    def __init__(self, settings):
        self.settings = settings

    def collect_all(self) -> dict[str, Any]:
        results: dict[str, Any] = {"sources": [], "events": 0, "errors": []}
        for source in DISCLOSURE_SOURCES:
            try:
                source_id = self._register_source(source)
                source_result = self._collect_source(source_id, source)
                results["sources"].append(source_result)
                results["events"] += source_result["events"]
            except Exception as exc:
                results["errors"].append({"source": source.dai_number, "error": str(exc)})
        return results

    def _collect_source(self, source_id: int, source: DisclosureSource) -> dict[str, Any]:
        payload, status, content_type = fetch_bytes(source.attachment_url)
        if status != 200:
            raise RuntimeError(f"{source.dai_number} fetch failed: HTTP {status}")
        payload_path = self._store_payload(source, payload)
        fetched_at = datetime.now(UTC).replace(microsecond=0).isoformat()
        sha256 = hashlib.sha256(payload).hexdigest()
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                UPDATE disclosure_sources
                SET payload_path = ?, sha256 = ?, fetched_at = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (str(payload_path), sha256, fetched_at, source_id),
            )

        geometry_loaded = self._ensure_source_geometry(source_id, source)
        events = 0
        if source.format == "xlsx":
            rows = parse_xlsx(payload)
            events = self._ingest_xlsx_rows(source_id, source, rows)
        return {
            "dai_number": source.dai_number,
            "format": source.format,
            "content_type": content_type,
            "payload_path": payload_path,
            "geometry_loaded": geometry_loaded,
            "events": events,
        }

    def _ensure_source_geometry(self, source_id: int, source: DisclosureSource) -> bool:
        if not source.geometry_query:
            return False
        with open_db(self.settings.db_path) as connection:
            existing = connection.execute(
                """
                SELECT id
                FROM disclosure_geometries
                WHERE source_id = ? AND geography_label = ? AND geometry_source = 'nominatim'
                """,
                (source_id, source.geography_label),
            ).fetchone()
        if existing:
            return True

        geometry = fetch_boundary_geometry(source.geometry_query, source.osm_relation_id)
        if not geometry:
            return False
        bbox = geometry_bbox(geometry["geometry"])
        centroid_lon, centroid_lat = geometry_centroid(geometry["geometry"])
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO disclosure_geometries
                (source_id, geography_label, geography_type, geometry_source, geometry_geojson,
                 centroid_lon, centroid_lat, bbox_min_lon, bbox_min_lat, bbox_max_lon,
                 bbox_max_lat, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    source_id,
                    source.geography_label,
                    source.geography_type,
                    "nominatim",
                    json.dumps(geometry["geometry"], ensure_ascii=True),
                    centroid_lon,
                    centroid_lat,
                    bbox[0],
                    bbox[1],
                    bbox[2],
                    bbox[3],
                    json.dumps(geometry["raw"], ensure_ascii=True),
                ),
            )
        return True

    def _store_payload(self, source: DisclosureSource, payload: bytes) -> Path:
        file_name = source.attachment_url.rsplit("/", 1)[-1]
        path = (
            self.settings.raw_dir
            / "hydro_quebec"
            / "access_disclosures"
            / source.dai_number
            / file_name
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        return path

    def _register_source(self, source: DisclosureSource) -> int:
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                INSERT INTO disclosure_sources
                (dai_number, title, source_url, attachment_url, format, published_date,
                 transmitted_date, geography_label, geography_type, extraction_method,
                 precision_label, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(attachment_url) DO UPDATE SET
                    dai_number = excluded.dai_number,
                    title = excluded.title,
                    source_url = excluded.source_url,
                    format = excluded.format,
                    geography_label = excluded.geography_label,
                    geography_type = excluded.geography_type,
                    extraction_method = excluded.extraction_method,
                    precision_label = excluded.precision_label,
                    notes = excluded.notes,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    source.dai_number,
                    source.title,
                    source.source_url,
                    source.attachment_url,
                    source.format,
                    source.published_date,
                    source.transmitted_date,
                    source.geography_label,
                    source.geography_type,
                    source.extraction_method,
                    source.precision_label,
                    source.notes,
                ),
            )
            row = connection.execute(
                "SELECT id FROM disclosure_sources WHERE attachment_url = ?",
                (source.attachment_url,),
            ).fetchone()
        return int(row["id"])

    def _ingest_xlsx_rows(
        self, source_id: int, source: DisclosureSource, sheets: dict[str, list[dict[str, Any]]]
    ) -> int:
        count = 0
        with open_db(self.settings.db_path) as connection:
            for sheet_name, rows in sheets.items():
                for row_index, row in enumerate(rows, start=1):
                    normalized = normalize_row_keys(row)
                    start_time = first_value(
                        normalized, "date_debut_interruption", "date_debut", "debut"
                    )
                    if not start_time:
                        continue
                    end_time = first_value(
                        normalized, "int_date_fin_interruption", "date_fin_interruption", "fin"
                    )
                    duration_seconds = maybe_int(first_value(normalized, "duree_sec", "duree"))
                    duration_hours = maybe_float(first_value(normalized, "duree_heure"))
                    customers = maybe_int(
                        first_value(normalized, "clients", "nombre_clients", "client")
                    )
                    geography = (
                        first_value(normalized, "municipalite", "ville", "territoire")
                        or source.geography_label
                    )
                    source_row_id = f"{sheet_name}:{row_index}"
                    connection.execute(
                        """
                        INSERT OR REPLACE INTO disclosure_outage_events
                        (source_id, source_row_id, start_time, end_time, duration_seconds,
                         duration_hours, customers_affected, interruption_type, cause, equipment,
                         cause_group, category, geography_label, geography_type, centroid_lon,
                         centroid_lat, precision_label, raw_row_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            source_id,
                            source_row_id,
                            normalize_datetime(start_time),
                            normalize_datetime(end_time),
                            duration_seconds,
                            duration_hours,
                            customers,
                            first_value(normalized, "type_dinterruption", "type_interruption"),
                            first_value(
                                normalized, "description_cause_detaillee", "cause", "description"
                            ),
                            first_value(normalized, "description_equipement", "equipement"),
                            first_value(normalized, "groupecause", "groupe_cause"),
                            first_value(normalized, "categorie"),
                            str(geography),
                            source.geography_type,
                            source.centroid_lon,
                            source.centroid_lat,
                            source.precision_label,
                            json.dumps(
                                {"sheet": sheet_name, "row": row},
                                ensure_ascii=True,
                                default=str,
                            ),
                        ),
                    )
                    count += 1
        return count


def parse_xlsx(payload: bytes) -> dict[str, list[dict[str, Any]]]:
    with zipfile.ZipFile(PathLikeBytes(payload)) as archive:
        shared_strings = read_shared_strings(archive)
        workbook = read_workbook(archive)
        relationships = read_workbook_relationships(archive)
        sheets: dict[str, list[dict[str, Any]]] = {}
        for sheet_name, relationship_id in workbook:
            target = relationships.get(relationship_id)
            if not target:
                continue
            sheet_path = "xl/" + target.lstrip("/")
            rows = read_sheet_rows(archive, sheet_path, shared_strings)
            table = rows_to_dicts(rows)
            if table:
                sheets[sheet_name] = table
        return sheets


class PathLikeBytes:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            size = len(self.payload) - self.offset
        chunk = self.payload[self.offset : self.offset + size]
        self.offset += len(chunk)
        return chunk

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            self.offset = offset
        elif whence == 1:
            self.offset += offset
        elif whence == 2:
            self.offset = len(self.payload) + offset
        return self.offset

    def tell(self) -> int:
        return self.offset

    def seekable(self) -> bool:
        return True


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values = []
    for item in root.findall("s:si", ns):
        texts = [node.text or "" for node in item.findall(".//s:t", ns)]
        values.append("".join(texts))
    return values


def read_workbook(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    ns = {
        "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    sheets = []
    for sheet in root.findall(".//s:sheet", ns):
        sheets.append((sheet.attrib["name"], sheet.attrib[f"{{{ns['r']}}}id"]))
    return sheets


def read_workbook_relationships(archive: zipfile.ZipFile) -> dict[str, str]:
    root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    relationships = {}
    for relationship in root.findall("r:Relationship", ns):
        relationships[relationship.attrib["Id"]] = relationship.attrib["Target"]
    return relationships


def read_sheet_rows(
    archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]
) -> list[list[Any]]:
    root = ET.fromstring(archive.read(sheet_path))
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows = []
    for row in root.findall(".//s:sheetData/s:row", ns):
        values: dict[int, Any] = {}
        for cell in row.findall("s:c", ns):
            ref = cell.attrib.get("r", "")
            column = column_index(ref)
            value_node = cell.find("s:v", ns)
            inline_node = cell.find("s:is/s:t", ns)
            if inline_node is not None:
                value = inline_node.text or ""
            elif value_node is None:
                value = ""
            elif cell.attrib.get("t") == "s":
                value = shared_strings[int(value_node.text or 0)]
            else:
                value = value_node.text or ""
            values[column] = clean_cell(value)
        if values:
            max_column = max(values)
            rows.append([values.get(index, "") for index in range(max_column + 1)])
    return rows


def rows_to_dicts(rows: list[list[Any]]) -> list[dict[str, Any]]:
    header_index = None
    for index, row in enumerate(rows):
        normalized = [normalize_key(str(value)) for value in row]
        if "date_debut_interruption" in normalized or "clients" in normalized:
            header_index = index
            break
    if header_index is None:
        return []
    headers = [str(value).strip() for value in rows[header_index]]
    records = []
    for row in rows[header_index + 1 :]:
        record = {}
        for index, header in enumerate(headers):
            if not header:
                continue
            value = row[index] if index < len(row) else ""
            if value not in ("", None):
                record[header] = value
        if record:
            records.append(record)
    return records


def column_index(ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", ref.upper())
    index = 0
    for letter in letters:
        index = index * 26 + (ord(letter) - ord("A") + 1)
    return max(index - 1, 0)


def clean_cell(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", stripped):
        number = float(stripped)
        if 20000 < number < 80000:
            return excel_datetime(number)
        if number.is_integer():
            return int(number)
        return number
    return stripped


def excel_datetime(serial: float) -> str:
    # Excel's Windows epoch includes the 1900 leap-year bug; 25569 maps to 1970-01-01.
    seconds = int(round((serial - 25569) * 86400))
    return datetime.fromtimestamp(seconds, UTC).replace(tzinfo=None).isoformat(sep=" ")


def normalize_row_keys(row: dict[str, Any]) -> dict[str, Any]:
    return {normalize_key(key): value for key, value in row.items()}


def normalize_key(value: str) -> str:
    normalized = normalize_text(value)
    normalized = normalized.replace("'", "")
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return normalized


def first_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in ("", None):
            return value
    return None


def maybe_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_datetime(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text.replace("T", " ")[:19]


def fetch_boundary_geometry(query: str, osm_relation_id: int | None = None) -> dict[str, Any] | None:
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": 3,
        "countrycodes": "ca",
        "polygon_geojson": 1,
        "addressdetails": 1,
    }
    url = f"https://nominatim.openstreetmap.org/search?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "pannes-historiques/0.1 (+https://example.invalid)",
            "Accept-Language": "fr,en",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return fetch_overpass_boundary_geometry(query, osm_relation_id)

    for item in payload:
        geojson = item.get("geojson")
        if not geojson or geojson.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        return {"geometry": geojson, "raw": item}
    return fetch_overpass_boundary_geometry(query, osm_relation_id)


def fetch_overpass_boundary_geometry(
    query: str, osm_relation_id: int | None = None
) -> dict[str, Any] | None:
    if osm_relation_id is None:
        osm_relation_id = find_overpass_relation_id(query)
    if osm_relation_id is None:
        return None
    overpass_query = f"[out:json][timeout:25];relation({osm_relation_id});out geom;"
    url = f"https://overpass-api.de/api/interpreter?data={urllib.parse.quote(overpass_query)}"
    try:
        payload, _, _ = fetch_bytes(url)
        data = json.loads(payload.decode("utf-8"))
    except Exception:
        return None
    for element in data.get("elements", []):
        if element.get("type") != "relation":
            continue
        geometry = relation_to_geojson(element)
        if geometry:
            return {"geometry": geometry, "raw": element}
    return None


def find_overpass_relation_id(query: str) -> int | None:
    name = query.split(",", 1)[0].strip()
    if not name:
        return None
    overpass_query = (
        '[out:json][timeout:25];area["ISO3166-1"="CA"]->.ca;'
        f'relation["boundary"="administrative"]["name"="{name}"](area.ca);out ids tags;'
    )
    url = f"https://overpass-api.de/api/interpreter?data={urllib.parse.quote(overpass_query)}"
    try:
        payload, _, _ = fetch_bytes(url)
        data = json.loads(payload.decode("utf-8"))
    except Exception:
        return None
    for element in data.get("elements", []):
        if element.get("type") == "relation":
            return int(element["id"])
    return None


def relation_to_geojson(relation: dict[str, Any]) -> dict[str, Any] | None:
    segments = []
    for member in relation.get("members", []):
        if member.get("role") != "outer" or "geometry" not in member:
            continue
        points = [[point["lon"], point["lat"]] for point in member["geometry"]]
        if len(points) > 1:
            segments.append(points)
    rings = stitch_segments(segments)
    rings = [ring for ring in rings if len(ring) >= 4]
    if not rings:
        return None
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": rings}
    return {"type": "MultiPolygon", "coordinates": [[ring] for ring in rings]}


def stitch_segments(segments: list[list[list[float]]]) -> list[list[list[float]]]:
    remaining = [segment[:] for segment in segments]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        changed = True
        while changed and remaining:
            changed = False
            for index, segment in enumerate(remaining):
                if same_point(ring[-1], segment[0]):
                    ring.extend(segment[1:])
                elif same_point(ring[-1], segment[-1]):
                    ring.extend(reversed(segment[:-1]))
                elif same_point(ring[0], segment[-1]):
                    ring = segment[:-1] + ring
                elif same_point(ring[0], segment[0]):
                    ring = list(reversed(segment[1:])) + ring
                else:
                    continue
                remaining.pop(index)
                changed = True
                break
        if not same_point(ring[0], ring[-1]):
            ring.append(ring[0])
        rings.append(ring)
    return rings


def same_point(left: list[float], right: list[float]) -> bool:
    return round(left[0], 7) == round(right[0], 7) and round(left[1], 7) == round(right[1], 7)


def geometry_bbox(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    points = geometry_points(geometry)
    lons = [point[0] for point in points]
    lats = [point[1] for point in points]
    return min(lons), min(lats), max(lons), max(lats)


def geometry_centroid(geometry: dict[str, Any]) -> tuple[float | None, float | None]:
    points = geometry_points(geometry)
    if not points:
        return None, None
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def geometry_points(geometry: dict[str, Any]) -> list[list[float]]:
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        return [point for ring in coordinates for point in ring]
    if geometry.get("type") == "MultiPolygon":
        return [point for polygon in coordinates for ring in polygon for point in ring]
    return []


def content_type_from_url(url: str) -> str:
    lowered = url.lower()
    if lowered.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lowered.endswith(".pdf"):
        return "application/pdf"
    return "application/octet-stream"
