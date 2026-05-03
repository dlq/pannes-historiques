# Pannes Historiques

Address-first Hydro-Quebec outage history prototype built from the `plan.md` direction.

## What is implemented

- Flask app factory with Jinja templates and static assets
- bilingual French/English server-rendered UI
- HTMX search flow
- plain Web Components for timeline, cache freshness, and map shell
- SQLite persistence for addresses, queries, raw snapshots, parsed outages, planned interruptions, geometries, and derived matches
- raw Hydro-Quebec snapshot archival on local disk
- normalization and parsing pipeline for marker and KMZ/KML polygon feeds
- address normalization and cached geocoding with Nominatim plus a Quebec city-centroid fallback
- address-to-outage matching using polygon containment, centroid radius, and municipality fallback
- first-pass resolved event deduplication across repeated snapshots
- access-to-information disclosure source registry
- XLSX ingestion for published historical outage extracts
- PDF table extraction for supported published DAI outage files
- PDF table extraction for regional DAI summary metrics
- DAI region outline loading from OSM/Nominatim/Overpass with conservative fallback areas
- always-on DAI area context with page-level details for selected disclosed regions
- Leaflet map layering that keeps broad DAI areas in the background and live/API outage layers on top

## Run

```bash
uv run python server.py serve
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

You can also run the Flask app directly:

```bash
uv run flask --app app run --debug --host 127.0.0.1 --port 8000
```

## Collect live Hydro-Quebec data

```bash
uv run python server.py collect
```

This stores raw files under `data/raw/hydro_quebec/` and ingests normalized records into `data/app.db`.

## Collect published access-to-information disclosures

```bash
uv run python server.py collect-disclosures
```

This first checks Hydro-Quebec's published access-to-information response page for outage-related
attachments, then combines those auto-discovered sources with the curated sources below. It stores
raw disclosure files under `data/raw/hydro_quebec/access_disclosures/`, registers sources for
provenance, extracts supported row-level XLSX and PDF tables into `disclosure_outage_events`,
regional aggregate tables into `disclosure_annual_metrics`, and stores disclosed-area outlines in
`disclosure_geometries`.

The discovery pass looks for response titles mentioning outages, interruptions, continuity, or
Info-pannes, prefers `document`/`annexe` files over response letters, and classifies
administrative-region summaries automatically. Newly discovered files that do not match a known
table pattern are still fetched and registered as `discovered_pending_review` so they can be promoted
to a richer parser/geometry later.

Currently supported published DAI extracts include:

- `DAI-2022-0386`: Cote Saint-Luc XLSX extract
- `DAI-2025-0275`: Outremont PDF table
- `DAI-2026-0042`: Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF table
- `DAI-2025-0333`: Saint-Felix-de-Kingsey PDF table
- `DAI-2026-0077`: 2025 administrative-region outage count, average duration, and gross continuity index
- `DAI-2025-0479`: 2025 partial-year and 2024 administrative-region summaries
- `DAI-2025-0305`: 2024 administrative-region summary
- `DAI-2024-0012`: 2019-2023 administrative-region summaries
- `DAI-2024-0237`: 2019-2023 administrative-region outages over 8 hours

## Map layers

The map uses separate colors and draw order for each evidence type:

- amber/orange: live outage API records from archived Hydro-Quebec snapshots
- cyan/blue: planned interruption API records
- yellow/orange/red background: latest DAI administrative-region summary, colored by gross continuity index when available
- blue dashed areas: DAI / access-to-information local historical area context

Regional DAI summaries and local DAI areas are always shown on the map as broad background context,
while the map opens centered on the searched address at a zoom based on the selected radius. Click a
colored region or blue DAI area to populate the scrollable details panel with the published source
and metrics. Live/API-derived outage and planned interruption geometries are drawn after DAI areas so
their smaller, more granular shapes remain visible on top.

For the regional summary layer, `Montréal` is treated as the administrative region used by the DAI
tables, not only the municipal City of Montréal, so its background area includes island
municipalities outside the city boundary.

## DAI test addresses

Searches use a fixed 5 km radius, a fixed 5-year window, and always include current planned
interruptions.

Useful test queries:

- `1 Avenue Westminster, Cote Saint-Luc, QC`
- `1 Avenue Davaar, Outremont, QC`
- `1 Rue Principale, Saint-Felix-de-Kingsey, QC`
- `1 Rue Principale, Waltham, QC`
- `1 Rue Principale, Sheenboro, QC`
- `1 Rue Principale, Chichester, QC`
- `1 Chemin Pembroke, L'Isle-aux-Allumettes, QC`

## Tooling

```bash
uv sync
uv run ruff check .
uv run ruff format .
uv run djlint app/templates --lint
uv run djlint app/templates --reformat
npm install
npm run check
uv run pre-commit install
uv run pre-commit run --all-files
```

Python dependencies and commands are managed by `uv`. Python linting and formatting use Ruff.
Jinja template linting and formatting use djLint. JavaScript linting and formatting for
`app/static/` use Biome. Pre-commit runs the same local checks before commits once installed.

## Notes

- The app preserves raw evidence and derives address views from it.
- The live collector depends on outbound network access.
- Geocoding first tries Nominatim. If that fails, the app falls back to municipality centroids for a small set of Quebec cities so the UX can still function during early development.
