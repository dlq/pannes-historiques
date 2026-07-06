"""Template context builders for the sheet-based interface.

Each builder returns a plain dict consumed by ``_sheet.html`` and its domain
includes. Map data rides along in ``map_update`` so the client can feed the
persistent MapLibre element without re-rendering it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .i18n import t
from .views import (
    FIXED_RADIUS_M,
    _format_distance_km,
    _sort_by_distance,
    build_map_payload,
    default_map_payload,
)

HISTORY_MONTHS = 14
EXPLORE_ROW_LIMIT = 40

SHEET_DOMAINS = ("overview", "current", "planned", "archive", "context")
EXPLORE_DOMAINS = ("current", "planned", "archive", "context")

MONTHS_SHORT = {
    "fr": [
        "janv",
        "févr",
        "mars",
        "avr",
        "mai",
        "juin",
        "juil",
        "août",
        "sept",
        "oct",
        "nov",
        "déc",
    ],
    "en": [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ],
}
WEEKDAYS = {
    "fr": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
}


def _parse_feed_time(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(value[: len("2026-01-01 00:00:00")].replace("T", " "), fmt)
        except ValueError:
            continue
    return None


def _format_clock(lang: str, moment: datetime) -> str:
    if lang == "fr":
        if moment.minute:
            return f"{moment.hour} h {moment.minute:02d}"
        return f"{moment.hour} h"
    return moment.strftime("%-H:%M") if hasattr(moment, "strftime") else str(moment)


def _format_day_month(lang: str, moment: datetime) -> str:
    month = MONTHS_SHORT[lang if lang in MONTHS_SHORT else "fr"][moment.month - 1]
    if lang == "fr":
        day = "1er" if moment.day == 1 else str(moment.day)
        return f"{day} {month}."
    return f"{month} {moment.day}"


def _format_date_label(lang: str, value: str | None) -> str:
    moment = _parse_feed_time(value)
    if moment is None:
        return ""
    return _format_day_month(lang, moment)


def _format_window(lang: str, start: str | None, end: str | None) -> str:
    start_moment = _parse_feed_time(start)
    end_moment = _parse_feed_time(end)
    if start_moment and end_moment:
        if start_moment.date() == end_moment.date():
            return f"{_format_clock(lang, start_moment)} – {_format_clock(lang, end_moment)}"
        return (
            f"{_format_day_month(lang, start_moment)} {_format_clock(lang, start_moment)}"
            f" – {_format_day_month(lang, end_moment)} {_format_clock(lang, end_moment)}"
        )
    if start_moment:
        return _format_clock(lang, start_moment)
    return ""


def _format_customers(value: int | float | None) -> str:
    count = int(value or 0)
    return f"{count:,}".replace(",", " ")


def _map_update(
    domain: str,
    matches: list[dict[str, Any]],
    *,
    center: list[float] | None = None,
    radius_m: int | None = None,
    address_label: str = "",
    zoom: int | None = None,
) -> dict[str, Any]:
    return {
        "domain": domain,
        "matches": matches,
        "center": center,
        "radiusM": radius_m,
        "addressLabel": address_label,
        "zoom": zoom,
    }


def _local_items(items: list[dict[str, Any]], radius_m: int) -> list[dict[str, Any]]:
    return [
        item
        for item in items
        if item.get("distanceM") is not None and item["distanceM"] <= radius_m
    ]


def _monthly_buckets(lang: str, items: list[dict[str, Any]], months: int) -> list[dict[str, Any]]:
    now = datetime.now(UTC).replace(tzinfo=None)
    keys: list[tuple[int, int]] = []
    year, month = now.year, now.month
    for _ in range(months):
        keys.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    keys.reverse()
    counts = dict.fromkeys(keys, 0)
    for item in items:
        moment = _parse_feed_time(item.get("startTime"))
        if moment is None:
            continue
        key = (moment.year, moment.month)
        if key in counts:
            counts[key] += 1
    month_names = MONTHS_SHORT[lang if lang in MONTHS_SHORT else "fr"]
    return [
        {
            "label": f"{month_names[key[1] - 1]} {key[0]}",
            "count": counts[key],
        }
        for key in keys
    ]


def _current_rows(
    lang: str, items: list[dict[str, Any]], *, with_distance: bool
) -> list[dict[str, Any]]:
    rows = sorted(items, key=lambda item: -(int(item.get("customersAffected") or 0)))
    return [
        {
            "kind": "outage",
            "startTime": item.get("startTime") or "",
            "statusLabel": item.get("statusLabel") or t(lang, "unknown"),
            "status": item.get("status") or "",
            "customers": _format_customers(item.get("customersAffected")),
            "distanceKm": _format_distance_km(item.get("distanceM")) if with_distance else "",
            "focus": _focus_payload(item),
        }
        for item in rows[:EXPLORE_ROW_LIMIT]
    ]


def _planned_groups(
    lang: str, items: list[dict[str, Any]], *, with_distance: bool
) -> list[dict[str, Any]]:
    def sort_key(item: dict[str, Any]) -> str:
        return item.get("startTime") or "9999"

    groups: dict[str, dict[str, Any]] = {}
    for item in sorted(items, key=sort_key)[: EXPLORE_ROW_LIMIT * 2]:
        moment = _parse_feed_time(item.get("startTime"))
        if moment is None:
            date_key = "unknown"
            heading = t(lang, "unknown")
            tile_day, tile_month = "?", ""
        else:
            date_key = moment.strftime("%Y-%m-%d")
            weekday = WEEKDAYS[lang if lang in WEEKDAYS else "fr"][moment.weekday()]
            heading = f"{weekday} {_format_day_month(lang, moment)}"
            tile_day = str(moment.day)
            tile_month = MONTHS_SHORT[lang if lang in MONTHS_SHORT else "fr"][moment.month - 1]
        group = groups.setdefault(
            date_key, {"heading": heading, "tileDay": tile_day, "tileMonth": tile_month, "rows": []}
        )
        group["rows"].append(
            {
                "kind": "planned",
                "window": _format_window(lang, item.get("startTime"), item.get("endTime")),
                "customers": _format_customers(item.get("customersAffected")),
                "distanceKm": _format_distance_km(item.get("distanceM")) if with_distance else "",
                "tileDay": group["tileDay"],
                "tileMonth": group["tileMonth"],
                "focus": _focus_payload(item),
            }
        )
    return [groups[key] for key in sorted(groups)]


def _previous_rows(
    lang: str, items: list[dict[str, Any]], *, with_distance: bool
) -> list[dict[str, Any]]:
    def sort_key(item: dict[str, Any]) -> str:
        return item.get("startTime") or ""

    rows = sorted(items, key=sort_key, reverse=True)
    grouped: list[dict[str, Any]] = []
    current_month = None
    month_names = MONTHS_SHORT[lang if lang in MONTHS_SHORT else "fr"]
    for item in rows[:EXPLORE_ROW_LIMIT]:
        moment = _parse_feed_time(item.get("startTime"))
        month_key = (moment.year, moment.month) if moment else None
        if month_key != current_month:
            current_month = month_key
            grouped.append(
                {
                    "isHeading": True,
                    "heading": f"{month_names[month_key[1] - 1]} {month_key[0]}"
                    if month_key
                    else t(lang, "unknown"),
                }
            )
        grouped.append(
            {
                "isHeading": False,
                "kind": "previous_outage",
                "startTime": item.get("startTime") or "",
                "dateLabel": _format_date_label(lang, item.get("startTime")),
                "statusLabel": item.get("statusLabel") or "",
                "customers": _format_customers(item.get("customersAffected")),
                "distanceKm": _format_distance_km(item.get("distanceM")) if with_distance else "",
                "eventCount": item.get("eventCount"),
                "focus": _focus_payload(item),
            }
        )
    return grouped


def _context_rows(lang: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for item in items:
        if item.get("kind") == "regional_metric":
            if (
                not item.get("outageCount")
                and item.get("matchType") == "administrative_region_context"
            ):
                continue
            rows.append(
                {
                    "kind": "regional_metric",
                    "title": item.get("label") or t(lang, "unknown"),
                    "subtitle": item.get("periodLabel") or "",
                    "count": item.get("outageCount"),
                    "countLabel": t(lang, "outages"),
                    "focus": _focus_payload(item),
                }
            )
        elif item.get("kind") == "disclosure":
            period = ""
            if item.get("startMin") and item.get("startMax"):
                period = f"{str(item['startMin'])[:4]}–{str(item['startMax'])[:4]}"
            rows.append(
                {
                    "kind": "disclosure",
                    "title": item.get("label") or t(lang, "unknown"),
                    "subtitle": " · ".join(
                        part for part in [period, item.get("precisionLabel") or ""] if part
                    ),
                    "count": item.get("recordCount"),
                    "countLabel": t(lang, "rows"),
                    "focus": _focus_payload(item),
                }
            )
    rows.sort(key=lambda row: -(row["count"] or 0))
    return rows


def _focus_payload(item: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "kind": item.get("kind"),
        "lat": item.get("lat"),
        "lon": item.get("lon"),
        "label": item.get("label"),
        "startTime": item.get("startTime"),
        "endTime": item.get("endTime"),
        "customersAffected": item.get("customersAffected"),
        "distanceM": item.get("distanceM"),
        "status": item.get("status"),
        "statusLabel": item.get("statusLabel"),
    }
    if item.get("geometryKey"):
        payload["geometryKey"] = item["geometryKey"]
    return {key: value for key, value in payload.items() if value is not None}


def explore_sheet_context(
    lang: str,
    domain: str,
    *,
    current_layers: list[dict[str, Any]] | None = None,
    planned_layers: list[dict[str, Any]] | None = None,
    previous_layers: list[dict[str, Any]] | None = None,
    archive_summary: dict[str, Any] | None = None,
    regional_layers: list[dict[str, Any]] | None = None,
    disclosure_layers: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build the sheet context for explore mode (no address)."""
    if domain == "current":
        payload = default_map_payload(lang, current_map_layers=current_layers or [])
        items = [item for item in payload["matches"] if item["kind"] == "outage"]
        total_customers = sum(int(item.get("customersAffected") or 0) for item in items)
        body = {
            "summary": t(lang, "explore_current_summary", count=len(items)),
            "customers": t(
                lang, "explore_current_customers", customers=_format_customers(total_customers)
            ),
            "rows": _current_rows(lang, items, with_distance=False),
            "empty": t(lang, "domain_current_empty"),
        }
    elif domain == "planned":
        payload = default_map_payload(lang, current_map_layers=planned_layers or [])
        items = [item for item in payload["matches"] if item["kind"] == "planned"]
        body = {
            "summary": t(lang, "explore_planned_summary", count=len(items)),
            "customers": t(lang, "explore_planned_window"),
            "groups": _planned_groups(lang, items, with_distance=False),
            "empty": t(lang, "domain_planned_empty"),
        }
    elif domain == "archive":
        payload = default_map_payload(
            lang,
            previous_map_layers=previous_layers or [],
            previous_archive_summary=archive_summary,
        )
        items = [item for item in payload["matches"] if item["kind"] == "previous_outage"]
        summary = archive_summary or {}
        windows = summary.get("windows") or []
        largest = summary.get("largest")
        body = {
            "windows": [
                {
                    "key": window.get("key"),
                    "label": t(lang, window.get("key", "unknown")),
                    "areas": window.get("areas", 0),
                    "customers": _format_customers(window.get("totalCustomers")),
                }
                for window in windows
            ],
            "largestLabel": t(
                lang,
                "archive_largest_label",
                date=_format_date_label(lang, largest.get("startTime")),
                customers=_format_customers(largest.get("customersAffected")),
            )
            if largest
            else "",
            "territories": (summary.get("territories") or [])[:12],
            "latest": [
                {
                    "dateLabel": _format_date_label(lang, item.get("startTime")),
                    "startTime": item.get("startTime") or "",
                    "customers": _format_customers(item.get("customersAffected")),
                    "focus": {
                        "kind": "previous_outage",
                        "lat": item.get("centroidLat"),
                        "lon": item.get("centroidLon"),
                        "startTime": item.get("startTime"),
                        "customersAffected": item.get("customersAffected"),
                    },
                }
                for item in (summary.get("latest") or [])[:20]
            ],
            "empty": t(lang, "domain_archive_empty"),
        }
    elif domain == "context":
        payload = default_map_payload(
            lang,
            regional_metric_layers=regional_layers or [],
            disclosure_layers=disclosure_layers or [],
        )
        published = [
            item for item in payload["matches"] if item["kind"] in {"disclosure", "regional_metric"}
        ]
        body = {
            "intro": t(lang, "explore_context_intro"),
            "rows": _context_rows(lang, published),
            "empty": t(lang, "domain_context_empty"),
        }
    else:
        raise ValueError(f"unsupported explore domain: {domain}")
    return {
        "mode": "explore",
        "domain": domain,
        "scope": "province",
        "body": body,
        "map_update": _map_update(domain, payload["matches"]),
        "map_labels": payload.get("labels") or {},
    }


def overview_sheet_context(lang: str, result: Any, display_address: str) -> dict[str, Any]:
    """Build the address-mode overview (answer stack)."""
    payload = build_map_payload(lang, result, display_address)
    matches = payload["matches"]
    radius_m = result.radius_m or FIXED_RADIUS_M
    radius_km = str(int(radius_m / 1000))
    current_items = [item for item in matches if item["kind"] == "outage"]
    planned_items = [item for item in matches if item["kind"] == "planned"]
    previous_items = payload.get("previousSidebarMatches") or []

    local_current = _local_items(current_items, radius_m)
    local_planned = _local_items(planned_items, radius_m)
    nearest_current = next(
        (item for item in _sort_by_distance(current_items) if item.get("distanceM") is not None),
        None,
    )
    next_planned = min(
        (item for item in local_planned if item.get("startTime")),
        key=lambda item: item["startTime"],
        default=None,
    )

    sorted_by_time = sorted(
        [item for item in previous_items if item.get("startTime")],
        key=lambda item: item["startTime"],
        reverse=True,
    )
    nearest_previous = next(
        (item for item in _sort_by_distance(previous_items) if item.get("distanceM") is not None),
        None,
    )
    buckets = _monthly_buckets(lang, previous_items, HISTORY_MONTHS)
    max_bucket = max((bucket["count"] for bucket in buckets), default=0)

    current_line = {
        "state": "alert" if local_current else "ok",
        "title": t(lang, "overview_current_count", count=len(local_current), radius_km=radius_km)
        if local_current
        else t(lang, "overview_no_current"),
        "subtitle": t(
            lang,
            "overview_nearest_current",
            distance_km=_format_distance_km(nearest_current.get("distanceM")),
        )
        if nearest_current
        else t(lang, "overview_no_current_anywhere"),
    }
    planned_line = {
        "state": "planned" if local_planned else "ok",
        "title": t(lang, "overview_planned_count", count=len(local_planned), radius_km=radius_km)
        if local_planned
        else t(lang, "overview_no_planned", radius_km=radius_km),
        "subtitle": t(
            lang,
            "overview_planned_next",
            window=(
                f"{_format_date_label(lang, next_planned.get('startTime'))} · "
                f"{_format_window(lang, next_planned.get('startTime'), next_planned.get('endTime'))}"
            ),
        )
        if next_planned
        else "",
    }
    history = {
        "count": len(previous_items),
        "months": HISTORY_MONTHS,
        "heroSub": t(lang, "history_hero_sub", months=HISTORY_MONTHS),
        "buckets": buckets,
        "maxBucket": max_bucket,
        "bucketStartLabel": buckets[0]["label"] if buckets else "",
        "bucketEndLabel": buckets[-1]["label"] if buckets else "",
        "facts": " · ".join(
            part
            for part in [
                t(
                    lang,
                    "history_nearest_fact",
                    distance_km=_format_distance_km(nearest_previous.get("distanceM")),
                )
                if nearest_previous
                else "",
                t(
                    lang,
                    "history_latest_fact",
                    date=_format_date_label(lang, sorted_by_time[0].get("startTime")),
                )
                if sorted_by_time
                else "",
            ]
            if part
        ),
        "caveat": t(lang, "history_caveat"),
        "emptyBody": t(lang, "history_empty_body", radius_km=radius_km),
        "viewAllLabel": t(lang, "history_view_all", count=len(previous_items))
        if previous_items
        else t(lang, "history_view_zero"),
    }
    center = payload.get("center")
    return {
        "mode": "address",
        "domain": "overview",
        "scope": "local",
        "display_address": display_address,
        "radius_label": t(lang, "overview_radius_label", radius_km=radius_km),
        "current_line": current_line,
        "planned_line": planned_line,
        "history": history,
        "map_update": _map_update(
            "overview",
            matches,
            center=center,
            radius_m=radius_m,
            address_label=display_address,
            zoom=payload.get("zoom"),
        ),
        "map_labels": payload.get("labels") or {},
    }


def address_domain_sheet_context(
    lang: str,
    domain: str,
    result: Any,
    display_address: str,
    *,
    scope: str = "local",
    explore_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an address-mode domain view (pushed from the overview)."""
    if scope == "province" and explore_context is not None:
        return {
            **explore_context,
            "mode": "address",
            "scope": "province",
            "display_address": display_address,
        }
    payload = build_map_payload(lang, result, display_address)
    matches = payload["matches"]
    radius_m = result.radius_m or FIXED_RADIUS_M
    if domain == "current":
        items = _local_items([item for item in matches if item["kind"] == "outage"], radius_m)
        body = {
            "summary": t(lang, "explore_current_summary", count=len(items)),
            "customers": "",
            "rows": _current_rows(lang, items, with_distance=True),
            "empty": t(lang, "domain_current_empty"),
        }
    elif domain == "planned":
        items = _local_items([item for item in matches if item["kind"] == "planned"], radius_m)
        body = {
            "summary": t(lang, "explore_planned_summary", count=len(items)),
            "customers": "",
            "groups": _planned_groups(lang, items, with_distance=True),
            "empty": t(lang, "domain_planned_empty"),
        }
    elif domain == "archive":
        items = payload.get("previousSidebarMatches") or []
        body = {
            "windows": [],
            "largestLabel": "",
            "territories": [],
            "latest": [],
            "rows": _previous_rows(lang, items, with_distance=True),
            "summary": t(
                lang,
                "local_reliability_summary_body" if items else "local_reliability_summary_empty",
                count=len(items),
                radius_km=str(int(radius_m / 1000)),
            ),
            "empty": t(lang, "domain_archive_empty"),
        }
    else:
        raise ValueError(f"unsupported address domain: {domain}")
    scoped_matches = [
        item
        for item in matches
        if (
            (domain == "current" and item["kind"] == "outage")
            or (domain == "planned" and item["kind"] == "planned")
            or (domain == "archive" and item["kind"] == "previous_outage")
        )
    ]
    center = payload.get("center")
    return {
        "mode": "address",
        "domain": domain,
        "scope": "local",
        "display_address": display_address,
        "radius_label": t(lang, "overview_radius_label", radius_km=str(int(radius_m / 1000))),
        "body": body,
        "map_update": _map_update(
            domain,
            scoped_matches,
            center=center,
            radius_m=radius_m,
            address_label=display_address,
            zoom=payload.get("zoom"),
        ),
        "map_labels": payload.get("labels") or {},
    }
