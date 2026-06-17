# Pannes Historiques

Hydro-Quebec outage history prototype built from the `plan.md` direction.

## What is implemented

- Local server app
  - Flask app factory with Jinja templates, static assets, and bilingual server-rendered UI
  - HTMX search flow plus plain Web Components for the map shell and detail panels
  - SQLite persistence plus raw Hydro-Quebec snapshot archival on local disk
  - Hydro feed parsing, address normalization, cached geocoding, spatial matching, and first-pass resolved-event deduplication
- Address and sidebar UI
  - map-first desktop panel and mobile bottom sheet
  - current, planned, previous/archive, and disclosure sections with icon-backed rows
  - local previous-outage evidence for searched addresses, including the `Seen Before Here` mode
  - a merged frontend-stability slice with an address-level local stability evidence card, explicit local/province scope labels, visible row labels, and row/polygon detail feedback
- Historical disclosure and map context
  - access-to-information disclosure source registry plus XLSX and supported PDF extraction
  - DAI region outlines from OSM/Nominatim/Overpass with conservative fallback areas
  - always-on disclosure context, lazy Leaflet loading, and simplified geometry assets for regional and local overlays
- Municipal archive bins
  - D1 schema and Worker runtime endpoints for derived municipal/TNO/Indigenous-territory previous-outage archive bins
  - pure geometry helpers and tests for territory assignment and display simplification
  - maintenance script for resumable municipal archive backfills
- Deployed Cloudflare path
  - Worker + container deployment for `pannes.ca`
  - durable D1/R2-backed ingestion for current-feed rows, previous-outage rows, and raw archives
  - Worker-backed lookup/runtime map-layer endpoints and scheduled refresh/disclosure archival

## Run

```bash
uv run python server.py serve
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

You can also run the Flask app directly:

```bash
uv run flask --app app run --debug --host 127.0.0.1 --port 8000
```

## URL interface

User-facing URLs are intentionally small:

- `/` opens the default map context.
- `/?lang=en` or `/?lang=fr` sets the interface language.
- `/?lang=en&q=5220+Rue+Jeanne-Mance` opens an address search.
- `/?lang=en&lat=45.5186&lon=-73.6027&accuracy_m=20` opens a coordinate/current-location search.

Search scope is currently fixed server-side. Radius, time-window, and planned-interruption flags are
not public URL parameters unless a future UI makes them user-controlled.

## Deploy

Production is currently served at `pannes.ca` with Cloudflare Workers + Containers, D1, and R2.

Current deployment status:

- Deployed release: `v0.2.7` plus the frontend-stability slice now merged into `main`
- Public service-worker marker checked on 2026-06-17: `pannes-historiques-v0.2.7-outage-pin-icon`
- Public smoke check on 2026-06-17: `/`, `/healthz`, `/service-worker.js`, and representative `/search-map` requests returned `200`
- Production includes the local stability answer card, outage-location favicon/app icon, and explicit Show/Hide layer controls from `codex/frontend-stability-summary`, which is merged into `main` at `c7fe3cb`

```bash
npx wrangler deploy
```

For a quick post-deploy timing check:

```bash
uv run python scripts/check_production_perf.py
```

The deployed container image still includes a baked-in SQLite snapshot for the Flask/container search
path and disclosure/regional context. Writes inside the running container are ephemeral and should
not be treated as durable production storage.

D1/R2 are now used for durable production ingestion:

- D1 stores normalized feed versions, current outage rows, planned-interruption rows, resolved
  previous-outage rows, disclosure metadata, event rows, annual metrics, municipal archive bins,
  and geometry metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information source files.
- The Worker exposes D1-backed lookup endpoints for current nearby matches and accumulated
  previous-outage nearby matches.
- The Worker also exposes runtime map-layer endpoints for current/planned operational layers and
  previous-outage context layers with Hydro polygon geometry when available.
- Operational-only Worker runtime endpoints import official territories, backfill municipal archive
  bins, and report municipal archive status.
- Debug, collection, cron, internal file/export, and direct status endpoints are not public entry
  points; use the CLI locally and Worker scheduled/internal paths in production.

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
- gray dashed territory outlines: derived previous-outage archive bins for municipalities, TNOs,
  and Indigenous territories when the runtime archive has populated bins
- yellow/orange/red background: latest DAI administrative-region summary, colored by gross continuity index when available
- blue dashed areas: DAI / access-to-information local historical area context

Regional DAI summaries and local DAI areas are always shown on the map as broad background context,
while the map opens centered on the searched address or coordinates. Click a
colored region or blue DAI area to populate the scrollable details panel with the published source
and metrics. Live/API-derived outage and planned interruption geometries are drawn after DAI areas so
their smaller, more granular shapes remain visible on top.

Search result cards are rendered first and map overlays are lazy-loaded through `/search-map`.
Regional and DAI/disclosure context geometries are served through `/map-context-geometries` and the
precomputed static assets in `app/static/regional_metric_geometries.json` and
`app/static/disclosure_geometries.json`. In production, current outages, planned interruptions, and
default previous-outage context use D1-backed Worker runtime map-layer endpoints before falling back
to local SQLite-derived layers. Previous outages without polygon geometry are rendered as centroid
markers instead of older outage polygons.

For searched addresses, previous local evidence is capped to the nearest retained outage records
within the fixed 5 km search radius. On the current frontend feature branch, that evidence is also
summarized in a plain-language local stability card before the layer accordions.

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
uv run pytest
npx playwright install chromium
npm run test:e2e
npm run test:e2e:mobile
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

Python dependencies and commands are managed by `uv`. Automated Python tests run with `pytest`.
Repo-owned browser regression tests run with Playwright against a deterministic local fixture
server. Python linting and formatting use Ruff. Jinja template linting and formatting use djLint.
JavaScript linting and formatting for `app/static/` use Biome. Pre-commit runs the same local
checks before commits once installed.

Current automated coverage is intentionally still lightweight. The suite covers address and
geocoding helpers, disclosure normalization helpers, service-layer decision paths, route smoke
tests, payload serialization, and browser-level search/map regressions without making live network
calls or using production credentials.

## Notes

- The app preserves raw evidence and derives address views from it.
- "Current feed" outage rows mean records present in Hydro-Quebec's latest public outage feed; they are not necessarily newly started outages.
- The live collector depends on outbound network access.
- Geocoding first tries Nominatim. If that fails, the app falls back to municipality centroids for a small set of Quebec cities so the UX can still function during early development.
