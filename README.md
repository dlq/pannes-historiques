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
- DAI region outline loading from OSM/Nominatim/Overpass with conservative fallback areas
- separate display of disclosed area-level historical context alongside live/API-derived matches
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

This stores raw disclosure files under `data/raw/hydro_quebec/access_disclosures/`,
registers sources for provenance, extracts supported row-level XLSX and PDF tables into
`disclosure_outage_events`, and stores disclosed-area outlines in `disclosure_geometries`.

Currently supported published DAI extracts include:

- `DAI-2022-0386`: Cote Saint-Luc XLSX extract
- `DAI-2025-0275`: Outremont PDF table
- `DAI-2026-0042`: Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF table
- `DAI-2025-0333`: Saint-Felix-de-Kingsey PDF table

## Map layers

The map uses separate colors and draw order for each evidence type:

- green dashed areas: DAI / access-to-information historical area context
- amber/orange: live outage API records from archived Hydro-Quebec snapshots
- blue: planned interruption API records

DAI areas are drawn first as broad background context. Live/API-derived outage and planned
interruption geometries are drawn after them so their smaller, more granular shapes remain visible.

## DAI test addresses

Use the `5 y (requested)` time range when testing DAI records, because many published DAI rows are
older than the default 365-day search window.

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
