from __future__ import annotations

import json
from html import escape

from .i18n import t


def render_page(
    lang: str,
    settings,
    initial_query: str = "",
    result_html: str = "",
    radius_m: int = 5000,
    days: int = 365,
    include_planned: bool = True,
) -> str:
    return f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(t(lang, "app_title"))}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script type="module" src="/static/app.js"></script>
</head>
<body class="min-h-screen bg-stone-100 text-slate-900">
  <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-8 rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_#fef3c7,_transparent_35%),linear-gradient(135deg,_#1f2937,_#334155)] p-6 text-white shadow-xl">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl">
          <p class="mb-3 text-xs uppercase tracking-[0.3em] text-amber-200">{escape(settings.app_name)}</p>
          <h1 class="text-3xl font-semibold sm:text-4xl">{escape(t(lang, "hero_title"))}</h1>
          <p class="mt-3 max-w-2xl text-sm text-slate-200 sm:text-base">{escape(t(lang, "hero_body"))}</p>
        </div>
        <form id="language-form" class="rounded-2xl bg-white/10 p-3 backdrop-blur" method="get" action="/">
          <label class="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-200">{escape(t(lang, "language"))}</label>
          <div class="flex gap-2">
            <button name="lang" value="fr" class="rounded-full px-4 py-2 text-sm {'bg-amber-300 text-slate-900' if lang == 'fr' else 'bg-white/10 text-white'}">{escape(t(lang, "french"))}</button>
            <button name="lang" value="en" class="rounded-full px-4 py-2 text-sm {'bg-amber-300 text-slate-900' if lang == 'en' else 'bg-white/10 text-white'}">{escape(t(lang, "english"))}</button>
          </div>
          <input type="hidden" name="q" value="{escape(initial_query)}" data-sync="q">
          <input type="hidden" name="radius_m" value="{radius_m}" data-sync="radius_m">
          <input type="hidden" name="days" value="{days}" data-sync="days">
          <input type="hidden" name="include_planned" value="{'1' if include_planned else '0'}" data-sync="include_planned">
        </form>
      </div>
    </header>

    <section class="mb-6 rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <form
        id="search-form"
        class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_140px_auto]"
        hx-post="/search"
        hx-target="#results"
        hx-swap="innerHTML"
      >
        <input type="hidden" name="lang" value="{escape(lang)}">
        <label class="block">
          <span class="mb-2 block text-sm font-medium text-slate-700">{escape(t(lang, "search_label"))}</span>
          <div class="relative">
            <input
              id="address-input"
              name="q"
              value="{escape(initial_query)}"
              required
              autocomplete="off"
              data-autocomplete-url="/autocomplete"
              data-lang="{escape(lang)}"
              placeholder="{escape(t(lang, "search_placeholder"))}"
              class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm shadow-sm outline-none ring-0 focus:border-amber-500"
            >
            <div id="address-suggestions" class="absolute left-0 right-0 top-full z-20 mt-2 hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"></div>
          </div>
        </label>
        <label class="block">
          <span class="mb-2 block text-sm font-medium text-slate-700">{escape(t(lang, "radius_label"))}</span>
          <select name="radius_m" class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm shadow-sm">
            <option value="500">500 m</option>
            <option value="1200" {"selected" if radius_m == 1200 else ""}>1.2 km</option>
            <option value="2500" {"selected" if radius_m == 2500 else ""}>2.5 km</option>
            <option value="5000" {"selected" if radius_m == 5000 else ""}>5 km</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-2 block text-sm font-medium text-slate-700">{escape(t(lang, "days_label"))}</span>
          <select name="days" class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm shadow-sm">
            <option value="7">7 d</option>
            <option value="30" {"selected" if days == 30 else ""}>30 d</option>
            <option value="180" {"selected" if days == 180 else ""}>180 d</option>
            <option value="365" {"selected" if days == 365 else ""}>365 d</option>
            <option value="1825" {"selected" if days == 1825 else ""}>5 y (requested)</option>
          </select>
        </label>
        <div class="flex flex-col justify-end gap-3">
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="include_planned" value="1" {"checked" if include_planned else ""} class="rounded border-slate-300 text-amber-500">
            <span>{escape(t(lang, "include_planned"))}</span>
          </label>
          <button class="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700">{escape(t(lang, "search_button"))}</button>
        </div>
      </form>
    </section>

    <section id="results">{result_html or render_empty_state(lang)}</section>
    <footer class="mt-8 px-2 text-sm text-slate-600">{escape(t(lang, "footer_note"))}</footer>
  </main>
</body>
</html>"""


def render_empty_state(lang: str) -> str:
    return f"""
    <div class="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-600">
      {escape(t(lang, "no_address"))}
    </div>
    """


def render_result(lang: str, result) -> str:
    if result.error:
        return f"""
        <div class="rounded-[2rem] bg-rose-50 p-6 text-rose-800 ring-1 ring-rose-200">
          {escape(t(lang, "search_error"))}
        </div>
        """

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
    outage_json = json.dumps(result.outage_matches, ensure_ascii=True)
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
        ],
    }
    archive_span = f"{result.coverage['outage_min_time'] or t(lang, 'unknown')} -> {result.coverage['outage_max_time'] or t(lang, 'unknown')}"
    planned_span = f"{result.coverage['planned_min_time'] or t(lang, 'unknown')} -> {result.coverage['planned_max_time'] or t(lang, 'unknown')}"
    return f"""
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div class="space-y-6">
        <section class="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p class="text-xs uppercase tracking-[0.2em]">{escape(t(lang, "service_scope"))}</p>
          <p class="mt-2 text-sm font-medium">{escape(t(lang, "historic_limit"))}</p>
        </section>

        <section class="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.2em] text-slate-500">{escape(t(lang, "summary"))}</p>
              <h2 class="mt-2 text-2xl font-semibold text-slate-900">{escape(result.normalized.original)}</h2>
              <p class="mt-2 text-sm text-slate-600">{escape(t(lang, "normalized_address"))}: {escape(display_address or result.normalized.normalized_line)}</p>
            </div>
            <cache-freshness-badge
              label="{escape(t(lang, 'freshness'))}"
              latest="{escape(result.collector_summary['latest']['fetched_at'] if result.collector_summary['latest'] else '')}"
            ></cache-freshness-badge>
          </div>
          <dl class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stat_card(t(lang, "geocoder"), f"{result.geocode['provider']} ({result.geocode['quality']})")}
            {stat_card(t(lang, "events_found"), str(len(result.matches)))}
            {stat_card(t(lang, "query_history"), str(result.query_count))}
            {stat_card(t(lang, "coverage"), f"{result.coverage['event_count']} events / {result.coverage['geometry_count']} geometries")}
          </dl>
          <dl class="mt-4 grid gap-4 sm:grid-cols-2">
            {stat_card(t(lang, "archive_span"), archive_span)}
            {stat_card(t(lang, "planned_panel"), planned_span)}
          </dl>
        </section>

        <section class="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">{escape(t(lang, "outage_archive"))}</h3>
            <p class="text-sm text-slate-500">{escape(t(lang, "coverage_note"))}</p>
          </div>
          <outage-timeline data-items='{escape(outage_json)}'></outage-timeline>
          <div class="mt-4 space-y-3">
            {render_match_rows(lang, result.outage_matches, t(lang, "outage_archive_empty"))}
          </div>
        </section>

        <section class="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">{escape(t(lang, "planned_panel"))}</h3>
            <p class="text-sm text-slate-500">{escape(t(lang, "requested_window"))}</p>
          </div>
          <div class="space-y-3">
            {render_match_rows(lang, result.planned_matches, t(lang, "planned_empty"))}
          </div>
        </section>
      </div>

      <div class="space-y-6">
        <section class="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 class="text-lg font-semibold text-slate-900">{escape(t(lang, "map_panel"))}</h3>
          <p class="mt-2 text-sm text-slate-600">{escape(t(lang, "confidence_note"))}</p>
          <outage-map class="mt-4 block h-[28rem] overflow-hidden rounded-[1.5rem]" data-map='{escape(json.dumps(map_payload, ensure_ascii=True))}'></outage-map>
          <p class="mt-3 text-sm text-slate-500">{escape(t(lang, "map_empty")) if not map_payload["matches"] else ""}</p>
        </section>

        <section class="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 class="text-lg font-semibold text-slate-900">{escape(t(lang, "quality_panel"))}</h3>
          <div class="mt-4 grid gap-3">
            {info_line(t(lang, "last_snapshot"), result.collector_summary["latest"]["fetched_at"] if result.collector_summary["latest"] else t(lang, "unknown"))}
            {info_line(t(lang, "first_snapshot"), result.collector_summary["earliest"]["fetched_at"] if result.collector_summary["earliest"] else t(lang, "unknown"))}
            {info_line(t(lang, "nearby_radius"), f"{max((item['distance_m'] or 0) for item in result.matches):.1f} m" if result.matches else t(lang, "unknown"))}
            {info_line(t(lang, "service_scope"), t(lang, "current_feed_only"))}
          </div>
          <div class="mt-5 rounded-2xl bg-stone-100 p-4 text-sm text-slate-700">
            <p>{escape(t(lang, "confidence_note"))}</p>
            <p class="mt-2">{escape(t(lang, "refresh_hint"))}</p>
          </div>
        </section>
      </div>
    </div>
    """


def stat_card(label: str, value: str) -> str:
    return f"""
    <div class="rounded-[1.5rem] bg-stone-100 p-4">
      <dt class="text-xs uppercase tracking-[0.2em] text-slate-500">{escape(label)}</dt>
      <dd class="mt-2 text-lg font-semibold text-slate-900">{escape(value)}</dd>
    </div>
    """


def render_match_rows(lang: str, matches: list[dict], empty_message: str) -> str:
    if not matches:
        return f'<p class="rounded-2xl bg-stone-100 p-4 text-sm text-slate-600">{escape(empty_message)}</p>'
    rows = []
    for item in matches[:24]:
        rows.append(
            f"""
            <article class="rounded-[1.5rem] border border-slate-200 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-slate-900">{escape(t(lang, item['outage_kind']))} · {escape(t(lang, item['match_type']))}</p>
                  <p class="mt-1 text-sm text-slate-600">{escape(item['start_time'] or t(lang, 'unknown'))}</p>
                </div>
                <div class="text-right text-sm text-slate-600">
                  <p>{escape(str(item['customers_affected'] or 0))} clients</p>
                  <p>{escape(str(item['distance_m'])) if item['distance_m'] is not None else escape(t(lang, 'unknown'))} m</p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span class="rounded-full bg-amber-100 px-3 py-1">{escape(item['municipality_code'] or t(lang, 'unknown'))}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1">confidence {escape(str(item['confidence']))}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1">{escape(item['status'] or t(lang, 'unknown'))}</span>
              </div>
            </article>
            """
        )
    return "".join(rows)


def info_line(label: str, value: str) -> str:
    return f"""
    <div class="flex items-center justify-between rounded-2xl bg-stone-100 px-4 py-3 text-sm">
      <span class="text-slate-600">{escape(label)}</span>
      <span class="font-medium text-slate-900">{escape(value)}</span>
    </div>
    """
