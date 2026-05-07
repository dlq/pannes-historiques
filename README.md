# Pannes Historiques

Hydro-Quebec outage history prototype built from the `plan.md` direction.

## What is implemented

- Local server app
  - Flask app factory with Jinja templates, static assets, and bilingual server-rendered UI
  - HTMX search flow and plain Web Components for timeline, cache freshness, and the map shell
  - SQLite persistence plus raw Hydro-Quebec snapshot archival on local disk
  - Hydro feed parsing, address normalization, cached geocoding, spatial matching, and first-pass resolved-event deduplication
- Historical disclosure and map context
  - access-to-information disclosure source registry plus XLSX and supported PDF extraction
  - DAI region outlines from OSM/Nominatim/Overpass with conservative fallback areas
  - always-on disclosure context, lazy Leaflet loading, and simplified geometry assets for regional and local overlays
- Deployed Cloudflare path
  - Worker + container deployment for `pannes.ca`
  - durable D1/R2-backed ingestion for current-feed rows, previous-outage rows, and raw archives
  - Worker-backed lookup endpoints and scheduled refresh/disclosure archival

## Run

```bash
uv run python server.py serve
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

You can also run the Flask app directly:

```bash
uv run flask --app app run --debug --host 127.0.0.1 --port 8000
```

## Deploy

Production is currently served at `pannes.ca` with Cloudflare Workers + Containers, D1, and R2.

```bash
npx wrangler deploy
```

The deployed container image still includes a baked-in SQLite snapshot for the Flask/container search
path and disclosure/regional context. Writes inside the running container are ephemeral and should
not be treated as durable production storage.

D1/R2 are now used for durable production ingestion:

- D1 stores normalized feed versions, current outage rows, planned-interruption rows, resolved
  previous-outage rows, disclosure metadata, event rows, annual metrics, and geometry metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information source files.
- The Worker exposes D1-backed lookup endpoints for current nearby matches and accumulated
  previous-outage nearby matches.

Production disables automatic Hydro-Quebec refreshes during address search (`AUTO_REFRESH_ON_SEARCH=0`).
The Worker cron handles changed-feed ingestion and calls the container refresh endpoint so user
searches do not refresh Hydro data at request time. Run collection manually only for local
development, one-off backfills, or rebuilding a bundled SQLite snapshot.

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

In production, the Worker also runs a bounded two-week disclosure archival job. It asks the
container to export already-parsed disclosure data source-by-source, mirrors normalized rows into D1,
and archives reachable raw source files in R2. Slow or unreachable sources are deferred so one source
does not block the rest of the catch-up.

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

Search result cards are rendered first and map overlays are lazy-loaded through `/search-map`.
Regional and DAI/disclosure context geometries are served through `/map-context-geometries` and the
precomputed static assets in `app/static/regional_metric_geometries.json` and
`app/static/disclosure_geometries.json`. Previous outages without polygon geometry are rendered as
centroid markers instead of older outage polygons.

For the regional summary layer, `Montréal` is treated as the administrative region used by the DAI
tables, not only the municipal City of Montréal, so its background area includes island
municipalities outside the city boundary.

To rebuild the static map context assets from `data/app.db`, run:

```bash
uv run python scripts/build_region_geometry_asset.py
```

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
npm run format
npm run check
npx wrangler deploy --dry-run
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
