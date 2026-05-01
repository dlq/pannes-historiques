from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

POSTAL_RE = re.compile(r"\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b", re.IGNORECASE)


STREET_REPLACEMENTS = {
    "st ": "saint ",
    "ste ": "sainte ",
    "av ": "avenue ",
    "boul ": "boulevard ",
    "bd ": "boulevard ",
    "ch ": "chemin ",
    "rte ": "route ",
    "mtl": "montreal",
    "qc": "quebec",
}

CARDINAL_REPLACEMENTS = (
    (r"\bo\.\b", "ouest"),
    (r"\bo\b$", "ouest"),
    (r"\be\.\b", "est"),
    (r"\be\b$", "est"),
    (r"\bn\.\b", "nord"),
    (r"\bn\b$", "nord"),
    (r"\bs\.\b", "sud"),
    (r"\bs\b$", "sud"),
)


@dataclass(frozen=True)
class NormalizedAddress:
    original: str
    normalized_line: str
    street_line: str
    city: str
    province: str
    postal_code: str
    unit: str


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(value: str) -> str:
    lowered = strip_accents(value).lower()
    lowered = lowered.replace("québec", "quebec")
    lowered = lowered.replace(".", " ")
    lowered = re.sub(r"[#]", " apt ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    for source, target in STREET_REPLACEMENTS.items():
        lowered = lowered.replace(source, target)
    for pattern, replacement in CARDINAL_REPLACEMENTS:
        lowered = re.sub(pattern, replacement, lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def normalize_address(query: str) -> NormalizedAddress:
    original = query.strip()
    cleaned = normalize_text(original)
    postal_match = POSTAL_RE.search(original.upper())
    postal_code = postal_match.group(1).replace(" ", "") if postal_match else ""

    parts = [part.strip(" ,") for part in cleaned.split(",") if part.strip(" ,")]
    street_line = parts[0] if parts else cleaned
    city = parts[1] if len(parts) > 1 else ""
    province = parts[2] if len(parts) > 2 else "qc"
    unit = ""

    unit_match = re.search(r"\b(?:apt|app|suite|bureau|unit|unite)\s+([a-z0-9-]+)\b", cleaned)
    if unit_match:
        unit = unit_match.group(1)

    normalized_line = ", ".join(
        part for part in [street_line, city, province.upper(), postal_code] if part
    )
    return NormalizedAddress(
        original=original,
        normalized_line=normalized_line,
        street_line=street_line,
        city=city,
        province=province.upper() if province else "QC",
        postal_code=postal_code,
        unit=unit,
    )
