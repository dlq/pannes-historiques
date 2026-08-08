# Pannes Historiques

Independent Hydro-Quebec outage archive with live and planned outage maps, retained observations,
and public-data context. The site is available at [pannes.ca](https://pannes.ca).

## Quick start

You need Python 3.12 or later with [uv](https://docs.astral.sh/uv/). Node.js 22 and npm are needed
only for JavaScript checks and browser tests.

```bash
uv sync --locked
uv run python server.py serve
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). A fresh local database is created
automatically. Searching an address may fetch the live public Hydro-Quebec feed; see
[data/README.md](data/README.md) for local data details.

Want to help? Start with [the contribution guide](docs/contributing.md) and the repository's
[open issues](https://github.com/dlq/pannes-historiques/issues).

## Development acknowledgement

Development of Pannes Historiques has been supplemented by the use of large language models for
code generation, review, testing, documentation, and research assistance. All resulting
contributions remain subject to human review and the project's automated correctness and quality
checks. Responsibility for the project and its releases rests with its maintainer.

## What is implemented

- Local server app
  - Flask app factory with Jinja templates, static assets, and bilingual server-rendered UI
  - a `/sheet` fragment route driven by a small vanilla `sheet.js` controller (no HTMX) plus plain Web Components for the map and detail panels
  - SQLite persistence plus raw Hydro-Quebec snapshot archival on local disk
  - Hydro feed parsing, address normalization, cached geocoding, spatial matching, and first-pass resolved-event deduplication
- Map-first sheet interface
  - one full-bleed MapLibre GL v6 map (vendored ESM modules and worker, OpenFreeMap Liberty vector style) with semantic domain colors: red current, amber planned, violet archive, teal published context
  - a single sheet with peek/half/full detents on mobile and a floating panel on desktop; the search field lives in the sheet
  - a segmented `En cours / Planifiées / Archive / Contexte` control that drives both the sheet content and the visible map layer
  - explore-mode domain views: sorted current rows, a date-grouped planned schedule with calendar tiles, an archive report with 24 h/7 j/30 j/1 an windows counting retained outages, alongside cumulative customer-interruption totals, and a disclosure-document list framed as regional context
  - address-mode overview answer stack: current/planned status lines with nearest-distance and next-window wording, a local-history hero card with a 14-month chart, a radius control (1/2/5/10 km, 2 km default for typed addresses), a `Local / Québec` scope toggle on pushed domain views, in-sheet detail cards, and a browser-local comparison tray
- Historical disclosure and map context
  - access-to-information disclosure source registry plus XLSX and supported PDF extraction
  - DAI region outlines from OSM/Nominatim/Overpass with conservative fallback areas
  - domain-specific disclosure context with simplified geometry assets for regional and local overlays
- Municipal archive bins
  - D1 schema and Worker runtime endpoints for derived municipal/TNO/Indigenous-territory previous-outage archive bins
  - pure geometry helpers and tests for territory assignment and display simplification
  - maintenance script for resumable municipal archive backfills
- Deployed Cloudflare path
  - Worker + container deployment for `pannes.ca`
  - durable D1/R2-backed ingestion for current-feed rows, previous-outage rows, and raw archives
  - Worker-backed lookup/runtime map-layer endpoints and scheduled refresh/disclosure archival

## Local development

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

Typed-address searches default to a 2 km local radius; coordinate and explore flows default to 5 km.
The sheet offers 1, 2, 5, and 10 km choices and preserves a non-default radius in the `radius_m`
URL parameter. Time window and planned-interruption flags are not public URL parameters.

## Deploy

Production is currently served at `pannes.ca` with Cloudflare Workers + Containers, D1, and R2.

Current deployment status:

- Current tagged release: `v0.4.7` (regional reliability framing and archive-summary coherence
  checks), released and deployed 2026-08-08. The same-day search/performance follow-up is also
  deployed; see `CHANGELOG.md` for exact Worker versions and release evidence.
- The current interface uses vendored MapLibre GL JS v6 ESM modules with the OpenFreeMap Liberty style, a
  full-bleed map, and one responsive sheet for current, planned, archive, and context views.
- Production is served through Cloudflare Workers + Containers with D1 and R2 durable storage.
- Exact deployment identifiers, smoke-check evidence, and current follow-up work are tracked in
  `CHANGELOG.md`, `NOTES.md`, and `PLANS.md`.

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
- `GET /api/durable/runtime/map-context` is a public Worker read containing only published
  disclosure/regional context. Protected runtime endpoints remain operator-only; the container
  currently falls back to public durable reads or its local-compatible paths when it cannot reach one.
- Operational-only Worker runtime endpoints import official territories, backfill municipal archive
  bins, and report municipal archive status.
- Debug, collection, cron, internal file/export, direct status, and protected durable runtime
  endpoints are not public entry points; `GET /api/durable/runtime/map-context` is the published
  context exception. Use the CLI locally and Worker scheduled/internal paths in production.

Production disables automatic Hydro-Quebec refreshes during address search (`AUTO_REFRESH_ON_SEARCH=0`).
The Worker cron handles changed-feed ingestion and calls the container refresh endpoint so user
searches do not refresh Hydro data at request time. Run collection manually only for local
development, one-off backfills, or rebuilding a bundled SQLite snapshot.

## Collect live Hydro-Quebec data

```bash
uv run python server.py collect
```

This stores raw files under `data/raw/hydro_quebec/` and ingests normalized records into `data/app.db`.
The `data/` directory is local/generated runtime state and is ignored by git except for
`data/README.md`; do not commit local SQLite snapshots or raw source downloads.

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

- red: current outage API records from Hydro-Quebec's latest public feed
- amber: planned interruption API records
- violet: retained previous-outage records and derived municipal/TNO/Indigenous-territory archive bins
- teal: DAI/access-to-information disclosure areas and administrative-region context

The active sheet domain controls the visible map evidence. Address overview mode can summarize
multiple evidence types, while pushed Current, Planned, Archive, and Context views show their
matching layer. Click a disclosure area or regional context row to open its published source and
metrics in an in-sheet detail card.

Sheet fragments are served through `GET /sheet`; each fragment embeds the map data for its domain,
so the persistent MapLibre element updates without a page reload.
Regional and DAI/disclosure context geometries are served through `/map-context-geometries` and the
precomputed static assets in `app/static/regional_metric_geometries.json` and
`app/static/disclosure_geometries.json`. In production, current outages, planned interruptions, and
default previous-outage context use private D1-backed Worker runtime map-layer endpoints before
falling back to local SQLite-derived layers. Previous outages without polygon geometry are rendered
as centroid markers instead of older outage polygons.

For searched addresses, previous local evidence is capped to the nearest retained outage records
within the selected local radius (2 km by default for typed addresses). The current code summarizes that evidence in a plain-language
local stability card before the pushed domain views, including retained-record count, nearest retained
record, most recent retained record, distance-band counts, and restrained source/coverage caveats.
The mobile sheet keeps this local answer ahead of broader layer context and can store a small
client-side comparison list in browser local storage.

For the regional summary layer, `Montréal` is treated as the administrative region used by the DAI
tables, not only the municipal City of Montréal, so its background area includes island
municipalities outside the city boundary.

To rebuild the static map context assets from `data/app.db`, run:

```bash
uv run python scripts/build_region_geometry_asset.py
```

## DAI test addresses

Typed-address searches start at 2 km and can use 1, 2, 5, or 10 km; coordinate and explore flows
start at 5 km. Searches use a fixed 5-year history window and include current planned interruptions.

Useful test queries:

- `1 Avenue Westminster, Cote Saint-Luc, QC`
- `1 Avenue Davaar, Outremont, QC`
- `1 Rue Principale, Saint-Felix-de-Kingsey, QC`
- `1 Rue Principale, Waltham, QC`
- `1 Rue Principale, Sheenboro, QC`
- `1 Rue Principale, Chichester, QC`
- `1 Chemin Pembroke, L'Isle-aux-Allumettes, QC`

## Tooling

For a repo map and contributor workflow, see [docs/architecture.md](docs/architecture.md) and
[docs/contributing.md](docs/contributing.md).

```bash
uv sync --locked
uv run pytest -q
npx playwright install chromium
npm run test:unit
npm run test:e2e
npm run test:e2e:mobile
uv run ruff check . --fix
uv run ruff format .
uv run djlint app/templates --lint
uv run djlint app/templates --reformat
npm ci
npm run format
npm run check
npx wrangler deploy --dry-run
uv run pre-commit install
uv run pre-commit run --all-files
```

Python dependencies and commands are managed by `uv`. Automated Python tests run with `pytest`.
Repo-owned browser regression tests run with Playwright against a deterministic local fixture
server. Python linting and formatting use Ruff. Jinja template linting and formatting use djLint.
JavaScript linting and formatting for `app/static/` use Biome. Pre-commit runs formatters and
linters only; it does not run tests.

Run the relevant Python, Node, and Playwright suites separately; they cover different layers. Any
service method, route, template, or browser-JavaScript change needs `npm run test:e2e` before
handoff. GitHub Quality enforces a 61.9% combined Python line/branch coverage floor across `app/`
and runs on pull requests and pushes to `main`; the full Playwright suite also runs on pull requests,
pushes to `main`, and manual dispatch. Release verification evidence and dated coverage measurements
belong in `CHANGELOG.md` and `NOTES.md`.

## Notes

- The app preserves raw evidence and derives address views from it.
- "Current feed" outage rows mean records present in Hydro-Quebec's latest public outage feed; they are not necessarily newly started outages.
- The live collector depends on outbound network access.
- Geocoding first tries Nominatim. If that fails, the app falls back to municipality centroids for a small set of Quebec cities so the UX can still function during early development.
