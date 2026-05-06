from __future__ import annotations

import hashlib
import html
import json
import math
import re
import subprocess
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
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


ADMIN_REGION_NAMES = (
    "Abitibi-Témiscamingue",
    "Bas-Saint-Laurent",
    "Capitale-Nationale",
    "Centre-du-Québec",
    "Chaudière-Appalaches",
    "Côte-Nord",
    "Estrie",
    "Gaspésie - Îles-de-la-Madeleine",
    "Lanaudière",
    "Laurentides",
    "Laval",
    "Mauricie",
    "Montérégie",
    "Montréal",
    "Nord-du-Québec",
    "Outaouais",
    "Saguenay - Lac-Saint-Jean",
)

ADMIN_REGION_CENTROIDS: dict[str, tuple[float, float]] = {
    "Abitibi-Témiscamingue": (48.1, -78.1),
    "Bas-Saint-Laurent": (48.3, -68.8),
    "Capitale-Nationale": (47.0, -71.5),
    "Centre-du-Québec": (46.2, -72.2),
    "Chaudière-Appalaches": (46.4, -70.9),
    "Côte-Nord": (50.5, -63.0),
    "Estrie": (45.4, -71.9),
    "Gaspésie - Îles-de-la-Madeleine": (48.6, -64.2),
    "Lanaudière": (46.4, -73.4),
    "Laurentides": (46.0, -74.2),
    "Laval": (45.58, -73.75),
    "Mauricie": (47.0, -73.0),
    "Montérégie": (45.4, -73.1),
    "Montréal": (45.55, -73.65),
    "Nord-du-Québec": (53.8, -75.0),
    "Outaouais": (46.3, -76.0),
    "Saguenay - Lac-Saint-Jean": (49.9, -71.5),
}


def administrative_region_targets() -> tuple[dict[str, Any], ...]:
    targets = []
    for label in ADMIN_REGION_NAMES:
        centroid_lat, centroid_lon = ADMIN_REGION_CENTROIDS[label]
        target = {
            "label": label,
            "type": "administrative_region",
            "query": f"{label}, Québec, Canada",
            "centroid_lat": centroid_lat,
            "centroid_lon": centroid_lon,
            "fallback_radius_degrees": 2.2 if label in {"Côte-Nord", "Nord-du-Québec"} else 1.1,
        }
        if label == "Montréal":
            target["query"] = "Agglomération de Montréal, Québec, Canada"
            target["osm_relation_id"] = 8508277
            target["force_geometry_refresh"] = True
        targets.append(target)
    return tuple(targets)


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
    DisclosureSource(
        dai_number="DAI-2026-0077",
        title="Pannes par région administrative - 2025",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2026-0077-document.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
        notes="Annual regional aggregate table with outage count, average duration, and gross continuity index.",
    ),
    DisclosureSource(
        dai_number="DAI-2025-0479-1",
        title="Pannes par région administrative - 1er janvier au 30 septembre 2025",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0479-document-1.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
        notes="Partial-year regional aggregate table for 2025.",
    ),
    DisclosureSource(
        dai_number="DAI-2025-0479-2",
        title="Pannes par région administrative - 2024",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0479-document-2.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
        notes="Annual regional aggregate table for 2024.",
    ),
    DisclosureSource(
        dai_number="DAI-2025-0305",
        title="Pannes par région administrative - 2024",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2025-0305-document.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
        notes="Annual regional aggregate table for 2024.",
    ),
    DisclosureSource(
        dai_number="DAI-2024-0012",
        title="Informations sur les pannes par régions administratives - 2019 à 2023",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0012-document-1.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
        notes="Multi-year regional aggregate tables for outage count, average duration, and continuity index.",
    ),
    DisclosureSource(
        dai_number="DAI-2024-0237",
        title="Nombre de pannes de plus de 8 heures par région administrative - 2019 à 2023",
        attachment_url="https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0237-document.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
        notes="Multi-year regional aggregate table for raw outages over eight continuous hours.",
    ),
)

DISCLOSURE_GEOMETRY_TARGETS: dict[str, tuple[dict[str, Any], ...]] = {
    "DAI-2022-0386": (
        {
            "label": "Cote Saint-Luc",
            "type": "municipality",
            "query": "Cote Saint-Luc, Quebec, Canada",
            "centroid_lat": 45.4687,
            "centroid_lon": -73.6659,
            "osm_relation_id": 5361655,
        },
    ),
    "DAI-2025-0275": (
        {
            "label": "Outremont",
            "type": "borough",
            "query": "Outremont, Montreal, Quebec, Canada",
            "centroid_lat": 45.5189,
            "centroid_lon": -73.6072,
        },
    ),
    "DAI-2026-0042": (
        {
            "label": "Sheenboro",
            "type": "municipality",
            "query": "Sheenboro, Quebec, Canada",
            "centroid_lat": 45.9669,
            "centroid_lon": -76.8169,
        },
        {
            "label": "Chichester",
            "type": "municipality",
            "query": "Chichester, Quebec, Canada",
            "centroid_lat": 45.9833,
            "centroid_lon": -76.8833,
        },
        {
            "label": "L'Isle-aux-Allumettes-Partie-Est",
            "type": "municipality",
            "query": "L'Isle-aux-Allumettes, Quebec, Canada",
            "centroid_lat": 45.875,
            "centroid_lon": -77.05,
        },
        {
            "label": "Waltham",
            "type": "municipality",
            "query": "Waltham, Quebec, Canada",
            "centroid_lat": 45.9167,
            "centroid_lon": -76.9167,
        },
    ),
    "DAI-2025-0333": (
        {
            "label": "Saint-Felix-de-Kingsey",
            "type": "municipality",
            "query": "Saint-Felix-de-Kingsey, Quebec, Canada",
            "centroid_lat": 45.8001,
            "centroid_lon": -72.1809,
            "osm_relation_id": 7932215,
        },
    ),
    "DAI-2026-0077": administrative_region_targets(),
    "DAI-2025-0479-1": administrative_region_targets(),
    "DAI-2025-0479-2": administrative_region_targets(),
    "DAI-2025-0305": administrative_region_targets(),
    "DAI-2024-0012": administrative_region_targets(),
    "DAI-2024-0237": administrative_region_targets(),
}

PDF_MUNICIPALITY_LABELS = tuple(
    sorted(
        {target["label"] for targets in DISCLOSURE_GEOMETRY_TARGETS.values() for target in targets},
        key=len,
        reverse=True,
    )
)

PDF_CAUSE_PREFIXES = (
    "Incendie / Fuite de gaz",
    "Manoeuvres sécuritaires",
    "Modification réseau",
    "Sécurité du public",
    "Travaux sécuritaires",
    "Équipement client(e)",
    "Contact accidentel",
    "Vétusté ( Usure temps)",
    "Défaillance",
    "Indéterminé",
    "Végétation",
    "Entretien",
    "Surcharge",
    "Véhicule",
    "Animal",
    "Foudre",
    "Pannes",
    "Vent",
)

DISCOVERY_KEYWORDS = (
    "panne",
    "pannes",
    "interruption",
    "interruptions",
    "continuite",
    "continuité",
    "info-pannes",
)


class AccessResponsePageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.articles: list[dict[str, Any]] = []
        self._article: dict[str, Any] | None = None
        self._depth = 0
        self._link: dict[str, Any] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "article":
            self._article = {
                "id": attributes.get("id") or "",
                "text_parts": [],
                "links": [],
            }
            self._depth = 1
            return
        if self._article is None:
            return
        self._depth += 1
        if tag == "a":
            self._link = {"href": attributes.get("href") or "", "text_parts": []}

    def handle_endtag(self, tag: str) -> None:
        if self._article is None:
            return
        if tag == "a" and self._link is not None:
            self._article["links"].append(self._link)
            self._link = None
        self._depth -= 1
        if tag == "article" or self._depth <= 0:
            self.articles.append(self._article)
            self._article = None
            self._depth = 0

    def handle_data(self, data: str) -> None:
        if self._article is None:
            return
        text = " ".join(html.unescape(data).split())
        if not text:
            return
        self._article["text_parts"].append(text)
        if self._link is not None:
            self._link["text_parts"].append(text)


def discover_disclosure_sources() -> list[DisclosureSource]:
    payload, status, _ = fetch_bytes(ACCESS_ROOT)
    if status != 200:
        return []
    parser = AccessResponsePageParser()
    parser.feed(payload.decode("utf-8", errors="replace"))
    sources = []
    for article in parser.articles:
        text = " ".join(article["text_parts"])
        if not is_outage_related_text(text):
            continue
        sources.extend(sources_from_discovered_article(article, text))
    return sources


def is_outage_related_text(value: str) -> bool:
    normalized = normalize_text(value)
    return any(keyword in normalized for keyword in DISCOVERY_KEYWORDS)


def sources_from_discovered_article(article: dict[str, Any], text: str) -> list[DisclosureSource]:
    title = clean_discovered_title(text)
    published_date = discovered_date(text, "Publié sur le site Web")
    transmitted_date = discovered_date(text, "Transmis au demandeur")
    attachments = []
    for link in article["links"]:
        href = urllib.parse.urljoin(ACCESS_ROOT, link["href"])
        if not re.search(r"\.(pdf|xlsx?|xls)(?:\?|$)", href, re.IGNORECASE):
            continue
        link_text = " ".join(link["text_parts"])
        if "lettre-reponse" in normalize_text(href) and has_non_letter_attachment(article["links"]):
            continue
        attachments.append((href, link_text))

    sources = []
    for index, (href, link_text) in enumerate(attachments, start=1):
        dai_number = discovered_dai_number(article, href, index)
        extraction_method = discovered_extraction_method(title, href)
        geography_label, geography_type, precision_label = discovered_geography(title)
        if extraction_method == "regional_metrics_pdf":
            geography_label = "Québec"
            geography_type = "administrative_region_set"
            precision_label = "administrative_region_aggregate"
        sources.append(
            DisclosureSource(
                dai_number=dai_number,
                title=title,
                attachment_url=href,
                format=discovered_format(href),
                geography_label=geography_label,
                geography_type=geography_type,
                extraction_method=extraction_method,
                precision_label=precision_label,
                notes=(
                    "Auto-discovered from Hydro-Québec access-to-information page. "
                    f"Link text: {link_text}"
                ),
                published_date=published_date,
                transmitted_date=transmitted_date,
                geometry_query=f"{geography_label}, Québec, Canada"
                if geography_type in {"municipality", "borough", "administrative_region"}
                else None,
            )
        )
    return sources


def has_non_letter_attachment(links: list[dict[str, Any]]) -> bool:
    for link in links:
        href = (link.get("href") or "").lower()
        if re.search(r"\.(pdf|xlsx?|xls)(?:\?|$)", href) and "lettre-reponse" not in href:
            return True
    return False


def clean_discovered_title(text: str) -> str:
    title = re.split(r"\bPublié sur le site Web\b", text, maxsplit=1)[0]
    title = title.replace("Objet :", "").strip(" :-")
    return title or "Auto-discovered access-to-information disclosure"


def discovered_date(text: str, label: str) -> str | None:
    normalized = text.replace("\u2011", "-").replace("‑", "-")
    match = re.search(rf"{re.escape(label)}\s*:\s*(\d{{4}}-\d{{2}}-\d{{2}})", normalized)
    if not match:
        return None
    return match.group(1)


def discovered_dai_number(article: dict[str, Any], href: str, index: int) -> str:
    for candidate in (href, article.get("id") or ""):
        match = re.search(r"DAI[-_](\d{4})[-_](\d{4})", candidate, re.IGNORECASE)
        if match:
            base = f"DAI-{match.group(1)}-{match.group(2)}"
            return base if index == 1 else f"{base}-{index}"
    return f"DAI-DISCOVERED-{index}"


def discovered_format(href: str) -> str:
    path = urllib.parse.urlparse(href).path.lower()
    if path.endswith(".xlsx") or path.endswith(".xls"):
        return "xlsx"
    return "pdf"


def discovered_extraction_method(title: str, href: str) -> str:
    normalized_title = normalize_text(title)
    normalized_href = normalize_text(href)
    if "region administrative" in normalized_title or "regions administratives" in normalized_title:
        return "regional_metrics_pdf"
    if "document" in normalized_href or "annexe" in normalized_href:
        return "pdf_rows" if discovered_format(href) == "pdf" else "xlsx_rows"
    return "discovered_pending_review"


def discovered_geography(title: str) -> tuple[str, str, str]:
    title = " ".join(title.split())
    patterns: tuple[tuple[str, str], ...] = (
        (r"\b(?:ville d'|ville de )(?P<label>[^,()–—]+)", "municipality"),
        (r"\bmunicipalit[eé]s? de (?P<label>[^,()–—]+)", "municipality"),
        (r"\barrondissement (?P<label>[^,()–—]+)", "borough"),
        (r"\bMRC de (?P<label>[^,()–—]+)", "mrc"),
        (
            r"\br[eé]gion (?:de |des |du )(?P<label>[A-ZÉÈÎÏÔÛÀÂÇ][^,()–—]+)",
            "administrative_region",
        ),
        (
            r"\b(?:à|a|dans|de|du|des|pour|sur|en) (?P<label>[A-ZÉÈÎÏÔÛÀÂÇ][^,()–—]+)",
            "municipality",
        ),
        (r"[–—-] (?P<label>[A-ZÉÈÎÏÔÛÀÂÇ][^–—-]+)$", "municipality"),
    )
    for pattern, geography_type in patterns:
        match = re.search(pattern, title)
        if not match:
            continue
        label = cleanup_geography_label(match.group("label"))
        if label and not looks_like_period(label):
            return label, geography_type, f"{geography_type}_context"
    return "Québec", "unknown", "discovered_pending_review"


def cleanup_geography_label(value: str) -> str:
    value = re.split(r"\b20\d{2}\b", value, maxsplit=1)[0]
    value = re.sub(r"\b(?:pour|entre|dans|sur|en)\b.*$", "", value, flags=re.IGNORECASE)
    return value.strip(" .:-–—\u2011")


def looks_like_period(value: str) -> bool:
    normalized = normalize_text(value)
    return bool(re.search(r"\b20\d{2}\b", normalized) or "janvier" in normalized)


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
        sources, discovered_count = self._sources_for_collection()
        return self.collect_sources(
            [source.attachment_url for source in sources],
            sources=sources,
            discovered_count=discovered_count,
        )

    def collect_sources(
        self,
        source_keys: list[str],
        *,
        sources: list[DisclosureSource] | None = None,
        discovered_count: int | None = None,
    ) -> dict[str, Any]:
        if sources is None:
            sources, resolved_discovered_count = self._sources_for_collection()
            if discovered_count is None:
                discovered_count = resolved_discovered_count
        requested = set(source_keys)
        results: dict[str, Any] = {
            "sources": [],
            "events": 0,
            "errors": [],
            "discovered_sources": discovered_count or 0,
            "requested_sources": len(requested),
        }
        for source in sources:
            if source.attachment_url not in requested:
                continue
            try:
                source_id = self._register_source(source)
                source_result = self._collect_source(source_id, source)
                results["sources"].append(source_result)
                results["events"] += source_result["events"]
            except Exception as exc:
                results["errors"].append({"source": source.dai_number, "error": str(exc)})
        return results

    def _sources_for_collection(self) -> tuple[list[DisclosureSource], int]:
        sources = list(DISCLOSURE_SOURCES)
        known_urls = {source.attachment_url for source in sources}
        try:
            discovered = discover_disclosure_sources()
        except Exception:
            discovered = []
        new_discovered = []
        for source in discovered:
            if source.attachment_url in known_urls:
                continue
            known_urls.add(source.attachment_url)
            new_discovered.append(source)
        return sources + new_discovered, len(new_discovered)

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

        geometry_loaded = self._ensure_source_geometries(source_id, source)
        events = 0
        if source.extraction_method == "discovered_pending_review":
            events = 0
        elif source.format == "xlsx":
            rows = parse_xlsx(payload)
            events = self._ingest_xlsx_rows(source_id, source, rows)
        elif source.extraction_method == "regional_metrics_pdf":
            rows = parse_annual_metrics_pdf(payload, source)
            events = self._ingest_annual_metrics(source_id, rows)
        elif source.format == "pdf":
            rows = parse_pdf_rows(payload, source)
            events = self._ingest_pdf_rows(source_id, source, rows)
        return {
            "dai_number": source.dai_number,
            "format": source.format,
            "content_type": content_type,
            "payload_path": payload_path,
            "geometry_loaded": geometry_loaded,
            "events": events,
        }

    def _ensure_source_geometries(self, source_id: int, source: DisclosureSource) -> bool:
        targets = DISCLOSURE_GEOMETRY_TARGETS.get(source.dai_number)
        if not targets and source.geometry_query:
            targets = (
                {
                    "label": source.geography_label,
                    "type": source.geography_type,
                    "query": source.geometry_query,
                    "centroid_lat": source.centroid_lat,
                    "centroid_lon": source.centroid_lon,
                    "osm_relation_id": source.osm_relation_id,
                },
            )
        if not targets:
            return False
        loaded_any = False
        for target in targets:
            loaded_any = self._ensure_target_geometry(source_id, source, target) or loaded_any
        return loaded_any

    def _ensure_target_geometry(
        self, source_id: int, source: DisclosureSource, target: dict[str, Any]
    ) -> bool:
        if target.get("geometry_geojson"):
            geometry_geojson = target["geometry_geojson"]
            centroid_lon, centroid_lat = geometry_centroid(geometry_geojson)
            bbox = geometry_bbox(geometry_geojson)
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
                        target["label"],
                        target["type"],
                        target.get("geometry_source") or "manual",
                        json.dumps(geometry_geojson, ensure_ascii=True),
                        centroid_lon,
                        centroid_lat,
                        bbox[0],
                        bbox[1],
                        bbox[2],
                        bbox[3],
                        json.dumps(
                            {"manual": True, "query": target["query"]},
                            ensure_ascii=True,
                        ),
                    ),
                )
            return True

        if not target.get("force_geometry_refresh"):
            with open_db(self.settings.db_path) as connection:
                existing = connection.execute(
                    """
                    SELECT id
                    FROM disclosure_geometries
                    WHERE source_id = ?
                      AND geography_label = ?
                      AND geography_type = ?
                      AND geometry_source = 'nominatim'
                    """,
                    (source_id, target["label"], target["type"]),
                ).fetchone()
            if existing:
                return True

            reused = self._copy_existing_geometry(source_id, target)
            if reused:
                return True

        geometry = fetch_boundary_geometry(target["query"], target.get("osm_relation_id"))
        geometry_geojson = None
        raw_json = None
        geometry_source = "nominatim"
        bbox = None
        centroid_lon = target.get("centroid_lon")
        centroid_lat = target.get("centroid_lat")
        if not geometry:
            geometry_geojson = fallback_circle_polygon(
                centroid_lon,
                centroid_lat,
                target.get("fallback_radius_degrees", 0.035),
            )
            raw_json = {"fallback": True, "query": target["query"]}
            geometry_source = "fallback_area"
        else:
            geometry_geojson = geometry["geometry"]
            raw_json = geometry["raw"]
            centroid_lon, centroid_lat = geometry_centroid(geometry_geojson)
        if not geometry_geojson:
            return False
        bbox = geometry_bbox(geometry_geojson)
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
                    target["label"],
                    target["type"],
                    geometry_source,
                    json.dumps(geometry_geojson, ensure_ascii=True),
                    centroid_lon,
                    centroid_lat,
                    bbox[0],
                    bbox[1],
                    bbox[2],
                    bbox[3],
                    json.dumps(raw_json, ensure_ascii=True),
                ),
            )
        return True

    def _copy_existing_geometry(self, source_id: int, target: dict[str, Any]) -> bool:
        with open_db(self.settings.db_path) as connection:
            existing = connection.execute(
                """
                SELECT geography_label, geography_type, geometry_source, geometry_geojson,
                       centroid_lon, centroid_lat, bbox_min_lon, bbox_min_lat, bbox_max_lon,
                       bbox_max_lat, raw_json
                FROM disclosure_geometries
                WHERE geography_label = ?
                  AND geography_type = ?
                ORDER BY CASE WHEN geometry_source = 'fallback_area' THEN 1 ELSE 0 END,
                         id DESC
                LIMIT 1
                """,
                (target["label"], target["type"]),
            ).fetchone()
            if not existing:
                return False
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
                    existing["geography_label"],
                    existing["geography_type"],
                    existing["geometry_source"],
                    existing["geometry_geojson"],
                    existing["centroid_lon"],
                    existing["centroid_lat"],
                    existing["bbox_min_lon"],
                    existing["bbox_min_lat"],
                    existing["bbox_max_lon"],
                    existing["bbox_max_lat"],
                    existing["raw_json"],
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

    def _ingest_pdf_rows(
        self, source_id: int, source: DisclosureSource, rows: list[dict[str, Any]]
    ) -> int:
        target_lookup = {
            normalize_text(target["label"]): target
            for target in DISCLOSURE_GEOMETRY_TARGETS.get(source.dai_number, ())
        }
        count = 0
        with open_db(self.settings.db_path) as connection:
            for row in rows:
                geography = row.get("geography_label") or source.geography_label
                target = target_lookup.get(normalize_text(str(geography)), {})
                source_row_id = f"pdf:{row['page']}:{row['row_index']}"
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
                        row["start_time"],
                        row["end_time"],
                        row["duration_seconds"],
                        round(row["duration_seconds"] / 3600, 4)
                        if row["duration_seconds"] is not None
                        else None,
                        None,
                        "historical_disclosure",
                        row["cause"],
                        row.get("row_area"),
                        None,
                        "Panne",
                        geography,
                        target.get("type") or source.geography_type,
                        target.get("centroid_lon") or source.centroid_lon,
                        target.get("centroid_lat") or source.centroid_lat,
                        source.precision_label,
                        json.dumps(row, ensure_ascii=True),
                    ),
                )
                count += 1
        return count

    def _ingest_annual_metrics(self, source_id: int, rows: list[dict[str, Any]]) -> int:
        count = 0
        with open_db(self.settings.db_path) as connection:
            for row in rows:
                connection.execute(
                    """
                    INSERT OR REPLACE INTO disclosure_annual_metrics
                    (source_id, year, period_label, geography_label, geography_type,
                     outage_count, average_duration_minutes, continuity_index_minutes,
                     long_outage_count, notes, raw_row_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        source_id,
                        row.get("year"),
                        row.get("period_label"),
                        row["geography_label"],
                        row.get("geography_type") or "administrative_region",
                        row.get("outage_count"),
                        row.get("average_duration_minutes"),
                        row.get("continuity_index_minutes"),
                        row.get("long_outage_count"),
                        row.get("notes"),
                        json.dumps(row, ensure_ascii=True),
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


def parse_pdf_rows(payload: bytes, source: DisclosureSource) -> list[dict[str, Any]]:
    from pypdf import PdfReader

    reader = PdfReader(PathLikeBytes(payload))
    rows: list[dict[str, Any]] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for line_index, line in enumerate(text.splitlines(), start=1):
            parsed = parse_pdf_row_line(line, source)
            if not parsed:
                continue
            parsed["page"] = page_index
            parsed["row_index"] = line_index
            rows.append(parsed)
    return rows


def parse_annual_metrics_pdf(payload: bytes, source: DisclosureSource) -> list[dict[str, Any]]:
    from pypdf import PdfReader

    reader = PdfReader(PathLikeBytes(payload))
    lines = [
        " ".join(line.split())
        for page in reader.pages
        for line in (page.extract_text() or "").splitlines()
        if line.strip()
    ]
    if source.dai_number == "DAI-2024-0012":
        return parse_multi_year_regional_metrics(lines, source)
    if source.dai_number == "DAI-2024-0237":
        return parse_long_outage_metrics(lines, source)
    return parse_single_period_regional_metrics(lines, source)


def parse_single_period_regional_metrics(
    lines: list[str], source: DisclosureSource
) -> list[dict[str, Any]]:
    text = "\n".join(lines)
    year = infer_year(source.title) or infer_year(text)
    period_label = str(year) if year else source.title
    if "30 septembre" in normalize_text(text):
        period_label = f"{year}-01-01 to {year}-09-30" if year else "Jan-Sep"
    rows = []
    for line in lines:
        label, values = parse_region_metric_line(line, expected_values=3)
        if not label or len(values) < 3:
            continue
        rows.append(
            {
                "year": year,
                "period_label": period_label,
                "geography_label": label,
                "geography_type": "province"
                if is_provincial_label(label)
                else "administrative_region",
                "outage_count": values[0],
                "average_duration_minutes": values[1],
                "continuity_index_minutes": values[2],
                "notes": source.title,
                "raw_text": line,
            }
        )
    return rows


def parse_multi_year_regional_metrics(
    lines: list[str], source: DisclosureSource
) -> list[dict[str, Any]]:
    years = [2019, 2020, 2021, 2022, 2023]
    rows: dict[tuple[str, int], dict[str, Any]] = {}
    table_index = 1
    for line in lines:
        label, values = parse_region_metric_line(line, expected_values=5)
        if not label or len(values) < 5 or table_index not in {1, 2, 3}:
            continue
        for year, value in zip(years, values[:5], strict=False):
            item = rows.setdefault(
                (label, year),
                {
                    "year": year,
                    "period_label": str(year),
                    "geography_label": label,
                    "geography_type": "province"
                    if is_provincial_label(label)
                    else "administrative_region",
                    "notes": source.title,
                    "raw_text": line,
                },
            )
            if table_index == 1:
                item["outage_count"] = value
            elif table_index == 2:
                item["average_duration_minutes"] = value
            elif table_index == 3:
                item["continuity_index_minutes"] = value
        if is_provincial_label(label):
            table_index += 1
    return list(rows.values())


def parse_long_outage_metrics(lines: list[str], source: DisclosureSource) -> list[dict[str, Any]]:
    years = [2019, 2020, 2021, 2022, 2023]
    rows = []
    for line in lines:
        label, values = parse_region_metric_line(line, expected_values=5)
        if not label or len(values) < 5:
            continue
        for year, value in zip(years, values[:5], strict=False):
            rows.append(
                {
                    "year": year,
                    "period_label": str(year),
                    "geography_label": label,
                    "geography_type": "province"
                    if is_provincial_label(label)
                    else "administrative_region",
                    "long_outage_count": value,
                    "notes": source.title,
                    "raw_text": line,
                }
            )
    return rows


def parse_region_metric_line(
    line: str, expected_values: int | None = None
) -> tuple[str | None, list[int]]:
    normalized_line = normalize_text(line)
    labels = (
        *ADMIN_REGION_NAMES,
        "Vue provinciale (somme)",
        "Vue provinciale",
        "Provincial",
        "Total Provincial",
    )
    for label in labels:
        normalized_label = normalize_text(label)
        if not normalized_line.startswith(normalized_label):
            continue
        suffix = line[len(label) :].strip()
        values = parse_integer_tokens(suffix, expected_values)
        return label, values
    return None, []


def parse_integer_tokens(value: str, expected_values: int | None = None) -> list[int]:
    raw_tokens = re.findall(r"\d+", value)
    if expected_values is not None and len(raw_tokens) == expected_values:
        return [int(token) for token in raw_tokens]
    if expected_values == 3 and len(raw_tokens) >= 3:
        tokens = raw_tokens[:]
        if len(tokens) > 3 and len(tokens[-2]) == 1 and len(tokens[-1]) == 3:
            continuity = int(tokens[-2] + tokens[-1])
            tokens = tokens[:-2]
        else:
            continuity = int(tokens.pop())
        average_duration = int(tokens.pop())
        outage_count = int("".join(tokens))
        return [outage_count, average_duration, continuity]
    tokens = []
    index = 0
    while index < len(raw_tokens):
        token = raw_tokens[index]
        merged = token
        index += 1
        while (
            index < len(raw_tokens)
            and len(merged.replace(" ", "")) <= 2
            and len(raw_tokens[index]) == 3
        ):
            merged += raw_tokens[index]
            index += 1
        tokens.append(int(merged))
    return tokens


def infer_year(*values: str) -> int | None:
    for value in values:
        years = [int(match.group(0)) for match in re.finditer(r"\b20\d{2}\b", value)]
        if years:
            return max(years)
    return None


def is_provincial_label(label: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", " ", normalize_text(label)).strip()
    return normalized in {
        "vue provinciale",
        "vue provinciale somme",
        "provincial",
        "total provincial",
    }


def parse_pdf_row_line(line: str, source: DisclosureSource) -> dict[str, Any] | None:
    cleaned = " ".join(line.split())
    match = re.match(
        r"^(?P<start>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) "
        r"(?P<end>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) "
        r"(?P<duration>\d+) (?P<tail>.+)$",
        cleaned,
    )
    if not match:
        return None
    tail = match.group("tail").strip()
    cause, row_area = split_pdf_cause_area(tail)
    geography = source.geography_label
    for label in PDF_MUNICIPALITY_LABELS:
        if normalize_text(row_area or tail) == normalize_text(label):
            geography = label
            break
        if normalize_text(tail).endswith(normalize_text(label)):
            geography = label
            if row_area is None:
                cause = tail[: -len(label)].strip()
                row_area = label
            break
    return {
        "start_time": match.group("start"),
        "end_time": match.group("end"),
        "duration_seconds": maybe_int(match.group("duration")),
        "cause": cause,
        "row_area": row_area,
        "geography_label": geography,
        "raw_text": line,
    }


def split_pdf_cause_area(tail: str) -> tuple[str, str | None]:
    normalized_tail = normalize_text(tail)
    for prefix in PDF_CAUSE_PREFIXES:
        normalized_prefix = normalize_text(prefix)
        if normalized_tail == normalized_prefix:
            return prefix, None
        if normalized_tail.startswith(f"{normalized_prefix} "):
            return prefix, tail[len(prefix) :].strip() or None
    return tail, None


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


def fetch_boundary_geometry(
    query: str, osm_relation_id: int | None = None
) -> dict[str, Any] | None:
    if osm_relation_id is not None:
        geometry = fetch_overpass_boundary_geometry(query, osm_relation_id)
        if geometry:
            return geometry

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


def fallback_circle_polygon(
    centroid_lon: float | None, centroid_lat: float | None, radius_degrees: float = 0.035
) -> dict[str, Any] | None:
    if centroid_lon is None or centroid_lat is None:
        return None
    points = []
    for index in range(24):
        angle = 2 * math.pi * index / 24
        lon = centroid_lon + radius_degrees * math.cos(angle)
        lat = centroid_lat + radius_degrees * math.sin(angle)
        points.append([lon, lat])
    points.append(points[0])
    return {"type": "Polygon", "coordinates": [points]}


def content_type_from_url(url: str) -> str:
    lowered = url.lower()
    if lowered.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lowered.endswith(".pdf"):
        return "application/pdf"
    return "application/octet-stream"
