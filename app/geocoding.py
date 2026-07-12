from __future__ import annotations

import json
import math
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .addressing import NormalizedAddress, normalize_text
from .db import open_db
from .perf import current_timer

QUEBEC_CITY_CENTROIDS = {
    "montreal": (45.5019, -73.5674),
    "quebec": (46.8139, -71.2082),
    "quebec city": (46.8139, -71.2082),
    "laval": (45.6066, -73.7124),
    "gatineau": (45.4765, -75.7013),
    "longueuil": (45.5312, -73.5181),
    "sherbrooke": (45.4042, -71.8929),
    "trois-rivieres": (46.3430, -72.5430),
    "trois rivieres": (46.3430, -72.5430),
    "levis": (46.7388, -71.2466),
    "saguenay": (48.4281, -71.0681),
    "cote saint-luc": (45.4687, -73.6659),
    "cote saint luc": (45.4687, -73.6659),
    "outremont": (45.5189, -73.6072),
    "saint-felix-de-kingsey": (45.8001, -72.1809),
    "saint felix de kingsey": (45.8001, -72.1809),
    "sheenboro": (45.9669, -76.8169),
    "chichester": (45.9833, -76.8833),
    "waltham": (45.9167, -76.9167),
    "l'isle-aux-allumettes": (45.8750, -77.0500),
    "lisle aux allumettes": (45.8750, -77.0500),
    "isle aux allumettes": (45.8750, -77.0500),
}

QUEBEC_CARDINAL_VARIANTS = {
    " o ": " ouest ",
    " e ": " est ",
    " n ": " nord ",
    " s ": " sud ",
}

STREET_TOKEN_EQUIVALENTS = {
    "st": "saint",
    "ste": "sainte",
    "av": "avenue",
    "boul": "boulevard",
    "bd": "boulevard",
    "ch": "chemin",
    "rte": "route",
    "mtl": "montreal",
    "qc": "quebec",
}

QUEBEC_ADDRESS_TYPES = {"house", "residential", "building", "apartments", "terrace"}
QUEBEC_SETTLEMENT_TYPES = {"neighbourhood", "suburb", "quarter", "hamlet", "town", "village"}
QUEBEC_ABBREVIATION_RE = re.compile(
    r"\b(?:st|ste|av|boul|bd|ch|rte)\b|\b[OENS]\.\b|\b[OENS]\b$",
    re.IGNORECASE,
)
CIVIC_STREET_RE = re.compile(r"^\d+[a-z]?\s+\S+", re.IGNORECASE)
DEFAULT_CITY_CONTEXT = "montreal"
DEFAULT_CITY_LABEL = "Montreal"


@dataclass(frozen=True)
class GeocodeResult:
    provider: str
    confidence: float
    quality: str
    latitude: float
    longitude: float
    city: str
    province: str
    postal_code: str
    raw_json: dict[str, Any]


def _geocode_result_from_row(row: Any) -> GeocodeResult:
    """Build a GeocodeResult from a cache row (SQLite row or durable dict)."""
    return GeocodeResult(
        provider=row["provider"],
        confidence=row["confidence"],
        quality=row["quality"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        city=row["city"] or "",
        province=row["province"] or "",
        postal_code=row["postal_code"] or "",
        raw_json=json.loads(row["raw_json"]),
    )


class GeocodingService:
    def __init__(self, settings):
        self.settings = settings
        self._suggest_cache: dict[tuple[str, str, int], tuple[float, list[dict[str, Any]]]] = {}

    def geocode(self, normalized: NormalizedAddress) -> GeocodeResult | None:
        with current_timer().step("geocode.cache_lookup"):
            cached = self._from_cache(normalized.normalized_line)
        if cached:
            current_timer().set("geocode_cache_hit", True)
            current_timer().set("geocode_provider", cached.provider)
            return cached

        contextual = self._default_city_context(normalized)
        if contextual:
            with current_timer().step("geocode.context_cache_lookup"):
                contextual_cached = self._from_cache(contextual.normalized_line)
            if contextual_cached:
                current_timer().set("geocode_cache_hit", True)
                current_timer().set("geocode_provider", contextual_cached.provider)
                with current_timer().step("geocode.store_cache"):
                    self._store_cache(normalized.normalized_line, contextual_cached)
                return contextual_cached

        current_timer().set("geocode_cache_hit", False)
        with current_timer().step("geocode.nominatim"):
            live = self._nominatim(normalized)
        if live:
            current_timer().set("geocode_provider", live.provider)
            with current_timer().step("geocode.store_cache"):
                self._store_cache(normalized.normalized_line, live)
            return live

        if contextual:
            with current_timer().step("geocode.context_nominatim"):
                live = self._nominatim(contextual)
            if live:
                current_timer().set("geocode_provider", live.provider)
                with current_timer().step("geocode.store_cache"):
                    self._store_cache(normalized.normalized_line, live)
                    self._store_cache(contextual.normalized_line, live)
                return live

        with current_timer().step("geocode.fallback_city"):
            fallback = self._fallback_city(normalized)
        if fallback is None and contextual:
            with current_timer().step("geocode.context_fallback_city"):
                fallback = self._fallback_city(contextual)
        if fallback:
            current_timer().set("geocode_provider", fallback.provider)
            with current_timer().step("geocode.store_cache"):
                self._store_cache(normalized.normalized_line, fallback)
                if contextual:
                    self._store_cache(contextual.normalized_line, fallback)
        return fallback

    def suggest(self, query: str, language: str = "fr", limit: int = 5) -> list[dict[str, Any]]:
        cleaned = " ".join(query.strip().split())
        if len(cleaned) < 3:
            return []

        cache_key = (cleaned.lower(), language, limit)
        cached = self._suggest_cache.get(cache_key)
        if cached and (time.time() - cached[0]) < 300:
            return cached[1]

        suggestions: list[dict[str, Any]] = []
        seen: set[str] = set()
        candidate_queries = self._autocomplete_queries(cleaned)
        for candidate in candidate_queries:
            payload = self._nominatim_search(candidate, language=language, limit=max(limit, 8))
            for item in payload:
                suggestion = self._suggestion_from_item(item)
                key = suggestion["value"].lower()
                if key in seen:
                    continue
                seen.add(key)
                suggestion["_score"] = self._suggestion_score(
                    cleaned, suggestion, candidate_queries
                )
                suggestions.append(suggestion)
        ranked = [item for item in suggestions if item["_score"] > 0]
        ranked.sort(
            key=lambda item: (
                item["_score"],
                item.get("_importance", 0.0),
                item["label"],
            ),
            reverse=True,
        )
        results = [{k: v for k, v in item.items() if k != "_score"} for item in ranked[:limit]]
        self._suggest_cache[cache_key] = (time.time(), results)
        return results

    def _from_cache(self, normalized_query: str) -> GeocodeResult | None:
        if self.settings.durable_runtime_url:
            durable = self._from_durable_cache(normalized_query)
            if durable is not None:
                return durable
            return None
        with open_db(self.settings.db_path) as connection:
            row = connection.execute(
                """
                SELECT provider, confidence, quality, latitude, longitude, city, province, postal_code, raw_json
                FROM geocode_cache
                WHERE normalized_query = ?
                """,
                (normalized_query,),
            ).fetchone()
        if not row:
            return None
        return _geocode_result_from_row(row)

    def _store_cache(self, normalized_query: str, result: GeocodeResult) -> None:
        if self.settings.durable_runtime_url:
            self._store_durable_cache(normalized_query, result)
            return
        with open_db(self.settings.db_path) as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO geocode_cache
                (normalized_query, provider, confidence, quality, latitude, longitude, city, province, postal_code, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_query,
                    result.provider,
                    result.confidence,
                    result.quality,
                    result.latitude,
                    result.longitude,
                    result.city,
                    result.province,
                    result.postal_code,
                    json.dumps(result.raw_json, ensure_ascii=True),
                ),
            )

    def _from_durable_cache(self, normalized_query: str) -> GeocodeResult | None:
        url = (
            f"{self.settings.durable_runtime_url}/geocode-cache?"
            f"{urllib.parse.urlencode({'normalized_query': normalized_query})}"
        )
        request = urllib.request.Request(
            url,
            headers={"User-Agent": self.settings.nominatim_user_agent},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            return None
        row = payload.get("item")
        if not row:
            return None
        return _geocode_result_from_row(row)

    def _store_durable_cache(self, normalized_query: str, result: GeocodeResult) -> None:
        payload = {
            "normalized_query": normalized_query,
            "provider": result.provider,
            "confidence": result.confidence,
            "quality": result.quality,
            "latitude": result.latitude,
            "longitude": result.longitude,
            "city": result.city,
            "province": result.province,
            "postal_code": result.postal_code,
            "raw_json": result.raw_json,
        }
        request = urllib.request.Request(
            f"{self.settings.durable_runtime_url}/geocode-cache",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": self.settings.nominatim_user_agent,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=5):
                return
        except Exception:
            return

    def _nominatim(self, normalized: NormalizedAddress) -> GeocodeResult | None:
        for query in self._candidate_queries(normalized):
            payload = self._nominatim_search(query, language="fr", limit=1)
            if not payload:
                continue
            item = payload[0]
            return self._result_from_item(item, query=query, normalized=normalized)
        return None

    def _nominatim_search(self, query: str, *, language: str, limit: int) -> list[dict[str, Any]]:
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": limit,
            "countrycodes": "ca",
            "addressdetails": 1,
        }
        url = f"{self.settings.nominatim_url}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.settings.nominatim_user_agent,
                "Accept-Language": "fr,en" if language == "fr" else "en,fr",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            return []

    def _candidate_queries(self, normalized: NormalizedAddress) -> list[str]:
        candidates: list[str] = []
        province = "Quebec"
        if normalized.original:
            candidates.append(f"{normalized.original}, {province}, Canada")
            if self._needs_query_expansion(normalized.original):
                candidates.extend(
                    f"{variant}, {province}, Canada"
                    for variant in self._query_variants(normalized.original)
                    if variant != normalized.original
                )
        canonical_parts = [normalized.street_line]
        if normalized.city:
            canonical_parts.append(normalized.city)
        canonical_parts.extend([province, "Canada"])
        candidates.append(", ".join(part for part in canonical_parts if part))
        if normalized.postal_code:
            postal_parts = [normalized.street_line, normalized.postal_code, province, "Canada"]
            candidates.append(", ".join(part for part in postal_parts if part))
        seen: set[str] = set()
        unique_candidates: list[str] = []
        for candidate in candidates:
            cleaned = " ".join(candidate.split())
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                unique_candidates.append(cleaned)
        return unique_candidates

    def _autocomplete_queries(self, query: str) -> list[str]:
        lowered = normalize_text(query)
        base_variants = self._query_variants(query)
        candidates = list(base_variants)
        if "montreal" not in lowered and "quebec" not in lowered:
            candidates.extend(f"{variant}, Montreal, Quebec, Canada" for variant in base_variants)
            candidates.extend(f"{variant}, Quebec, Canada" for variant in base_variants)
        else:
            candidates.extend(f"{variant}, Canada" for variant in base_variants)
        seen: set[str] = set()
        unique_candidates: list[str] = []
        for candidate in candidates:
            cleaned = " ".join(candidate.split())
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                unique_candidates.append(cleaned)
        return unique_candidates

    def _result_from_item(
        self,
        item: dict[str, Any],
        *,
        query: str,
        normalized: NormalizedAddress,
    ) -> GeocodeResult:
        address = item.get("address", {})
        quality = (
            "address" if item.get("type") in {"house", "residential", "building"} else "locality"
        )
        importance = float(item.get("importance", 0.4))
        return GeocodeResult(
            provider="nominatim",
            confidence=max(0.35, min(0.99, importance)),
            quality=quality,
            latitude=float(item["lat"]),
            longitude=float(item["lon"]),
            city=address.get("city")
            or address.get("town")
            or address.get("village")
            or normalized.city,
            province=address.get("state", "Quebec"),
            postal_code=address.get("postcode", normalized.postal_code),
            raw_json={"query": query, "result": item},
        )

    def _suggestion_from_item(self, item: dict[str, Any]) -> dict[str, Any]:
        address = item.get("address", {})
        house_number = address.get("house_number", "")
        road = address.get("road", "") or item.get("name", "")
        line = " ".join(part for part in [house_number, road] if part).strip() or item.get(
            "display_name", ""
        )
        city = address.get("city") or address.get("town") or address.get("village") or ""
        province = address.get("state", "")
        postal_code = address.get("postcode", "")
        display = ", ".join(part for part in [line, city, province, postal_code] if part)
        return {
            "label": display or item.get("display_name", ""),
            "value": line or item.get("display_name", ""),
            "latitude": float(item["lat"]),
            "longitude": float(item["lon"]),
            "city": city,
            "province": province,
            "postal_code": postal_code,
            "display_name": item.get("display_name", ""),
            "_type": item.get("type", ""),
            "_class": item.get("class", ""),
            "_importance": float(item.get("importance", 0.0)),
        }

    def _suggestion_score(
        self,
        query: str,
        suggestion: dict[str, Any],
        candidate_queries: list[str],
    ) -> int:
        normalized_query = normalize_text(query)
        normalized_label = normalize_text(
            " ".join(
                part
                for part in [
                    suggestion.get("value", ""),
                    suggestion.get("label", ""),
                    suggestion.get("display_name", ""),
                ]
                if part
            )
        )
        query_tokens = [token for token in normalized_query.split() if len(token) > 1]
        label_tokens = normalized_label.split()
        if not query_tokens:
            return 0

        score = 0
        numeric_tokens = [token for token in query_tokens if token.isdigit()]
        query_has_cardinal = any(
            token in normalized_query.split() for token in {"ouest", "est", "nord", "sud"}
        )
        for token in query_tokens:
            if token.isdigit():
                if any(label_token == token for label_token in label_tokens):
                    score += 8
                else:
                    return 0
                continue
            if token in {"rue", "avenue", "boulevard", "chemin", "route"}:
                if token in label_tokens:
                    score += 2
                continue
            if any(label_token.startswith(token) for label_token in label_tokens):
                score += 4
            elif token in normalized_label:
                score += 2
            else:
                return 0
        if numeric_tokens and not suggestion.get("value", "").strip().split()[0:1]:
            return 0
        if suggestion.get("_type") in QUEBEC_ADDRESS_TYPES:
            score += 6
        elif suggestion.get("_type") in QUEBEC_SETTLEMENT_TYPES:
            score -= 4
        if suggestion.get("_class") == "building":
            score += 2
        if suggestion.get("postal_code"):
            score += 2
        if query_has_cardinal and any(
            token in label_tokens for token in {"ouest", "est", "nord", "sud"}
        ):
            score += 3
        if any("montreal" in normalize_text(candidate) for candidate in candidate_queries) and (
            "montreal" in normalized_label
        ):
            score += 2
        if "montreal" in normalized_label or "montreal" in normalized_query:
            score += 1
        return score

    def _query_variants(self, query: str) -> list[str]:
        variants = [query]
        expanded = self._expand_quebec_terms(query)
        raw_cleaned = " ".join(query.split()).strip(" ,").lower()
        if expanded.lower() != raw_cleaned:
            variants.append(expanded)
        seen: set[str] = set()
        unique: list[str] = []
        for variant in variants:
            cleaned = " ".join(variant.split()).strip(" ,")
            if cleaned and cleaned.lower() not in seen:
                seen.add(cleaned.lower())
                unique.append(cleaned)
        return unique

    def _expand_quebec_terms(self, query: str) -> str:
        value = f" {normalize_text(query)} "
        for source, target in QUEBEC_CARDINAL_VARIANTS.items():
            value = value.replace(source, target)
        for source, target in STREET_TOKEN_EQUIVALENTS.items():
            value = re.sub(rf"\b{re.escape(source)}\b", target, value)
        return " ".join(value.split())

    def _needs_query_expansion(self, query: str) -> bool:
        return bool(QUEBEC_ABBREVIATION_RE.search(query))

    def _default_city_context(self, normalized: NormalizedAddress) -> NormalizedAddress | None:
        if normalized.city or normalized.postal_code:
            return None
        if not CIVIC_STREET_RE.search(normalized.street_line):
            return None
        return NormalizedAddress(
            original=f"{normalized.original}, {DEFAULT_CITY_LABEL}, QC",
            normalized_line=", ".join([normalized.street_line, DEFAULT_CITY_CONTEXT, "QUEBEC"]),
            street_line=normalized.street_line,
            city=DEFAULT_CITY_CONTEXT,
            province="QUEBEC",
            postal_code="",
            unit=normalized.unit,
        )

    def _fallback_city(self, normalized: NormalizedAddress) -> GeocodeResult | None:
        key = normalized.city.strip().lower()
        if not key or key not in QUEBEC_CITY_CENTROIDS:
            return None
        latitude, longitude = QUEBEC_CITY_CENTROIDS[key]
        # Slightly spread addresses within the city so repeated searches do not stack on one pixel.
        jitter = (sum(ord(ch) for ch in normalized.street_line) % 250) / 100000.0
        latitude += jitter
        longitude -= jitter
        return GeocodeResult(
            provider="fallback_city_centroid",
            confidence=0.42,
            quality="municipality",
            latitude=latitude,
            longitude=longitude,
            city=normalized.city.title(),
            province="Quebec",
            postal_code=normalized.postal_code,
            raw_json={"fallback": True, "city": normalized.city},
        )


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))
