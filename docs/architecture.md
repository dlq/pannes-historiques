# Architecture

Pannes Historiques is a Flask application deployed behind a Cloudflare Worker and Container. The current design keeps the browser-facing app stable while moving durable production state into D1 and R2.

## Request Flow

- `container-needed`: `/`, `/about`, `GET /sheet`, static assets, and the POST `/search`/`/search-location` compatibility aliases enter the Worker and are forwarded to Flask. They report `X-Pannes-Runtime: container`; forwarded responses also report `worker-container` in `Server-Timing`.
- `edge-safe`: `/api/durable/hydro`, `/api/durable/nearby`, and `/api/durable/history-nearby` are served directly from D1/R2 and report `X-Pannes-Runtime: worker-d1`.
- `internal-only`: `/api/durable/status`, `/api/ops/cost-health`, private `/api/durable/runtime/*` operations, and `/internal/*`, `/cron/*`, `/collect*`, and `/debug/*` stay private or are blocked at the Worker edge. The operation token or the configured trusted container Worker host is required where applicable.
- Obvious framework probes, including PHP, WordPress, Joomla, `.env`, `.git`, CGI, and PHPUnit paths, are rejected at the Worker edge.

`PANNES_LOW_COST_MODE=1` is an emergency container-wake kill switch. Durable public data APIs keep serving last-known D1/R2 data; container-needed page routes return a marked `503` instead of waking Flask. It is deliberately not a substitute for a static browser shell.

## Cost Decision

The near-term architecture is **hybrid renderer with Worker-first durable reads**. D1/R2 remain canonical for production data and the Worker serves the data APIs and materialized runtime reads; Flask/Jinja remains the browser shell while its interaction model is still changing. A Worker-rendered or static shell is deferred until production markers show that shell requests, rather than durable reads, are the material source of recurring container cost.

## Browser Interface

The interface is one full-bleed MapLibre GL map (OpenFreeMap Liberty vector style, vendored `maplibre-gl` under `app/static/vendor/maplibre/`) plus a single sheet: a bottom sheet with peek/half/full detents on mobile, a floating left panel on desktop. The search field lives in the sheet. A four-way segmented control (`current`, `planned`, `archive`, `context`) selects the active domain; the sheet content and the visible map layer always match, each domain with its own semantic color (red current, amber planned, violet archive, teal published context).

- Explore mode (no address): the segmented control is the root navigation; each domain renders a purpose-built fragment (sorted current rows, date-grouped planned schedule, archive report with time windows, disclosure document list).
- Address mode: the root is an overview answer stack (current/planned status lines, local-history hero card with a 14-month chart, comparison entry). Domain views are pushed pages with a back control and a `5 km / Québec` scope toggle. Detail cards open inside the sheet at half detent so the focused map geometry stays visible.
- `GET /sheet` returns any sheet fragment; each fragment embeds a JSON map update that `sheet.js` fans out to the persistent `<outage-map>` element via `map-layer-items` / `map-address` events. `/` renders the shell with the initial fragment and map payload inline.

## Runtime Ownership

- `app/` owns Flask routes, search orchestration, Jinja rendering, local SQLite fallback paths, and Python collectors. `app/sheet_views.py` builds the sheet fragment contexts. `app/durable_runtime.py` owns the `DurableRuntimeClient` that talks to the Worker's private durable-runtime endpoints.
- `app/static/` owns browser behavior as plain ES modules: `sheet.js` (detents, domain navigation, detail cards), `outage-map.js` (MapLibre element), `map-utils.js` (pure helpers), `search.js` (autocomplete, comparison tray, history), `detail-panels.js` (disclosure/regional detail rendering).
- `src/worker.js` owns Worker fetch/scheduled entrypoints and D1/R2 runtime behavior.
- `src/container.js` owns Cloudflare Container configuration.
- `src/worker-routing.js` owns top-level Worker path classification.
- `src/runtime-policy.js` owns private durable-runtime endpoint policy.
- `src/municipal-archive.js` owns pure municipal geometry helpers shared by Worker code and maintenance scripts.
- `src/archive-summary.js` owns pure row-shaping helpers for the previous-outage archive summary.
- `src/container-proxy.js` owns forwarding browser requests from the Worker to the Cloudflare Container instance.
- `/api/ops/cost-health` reports the live container state, latest scheduled ingestion, archive materialization state, D1 table counts, and optional dashboard-measured D1/R2 size values. It is private; configure `PANNES_D1_SIZE_BYTES`, `PANNES_R2_OBJECT_COUNT`, and `PANNES_R2_STORAGE_BYTES` only from a dated dashboard check.
- `scripts/maintenance/` owns one-off or operator-driven maintenance scripts.

## Enforced Module Boundaries

`uv run python scripts/check_module_boundaries.py` enforces the core runtime boundaries:

- Python runtime modules under `app/` must not import from `scripts/`, `src/`, or `tests/`.
- Browser modules under `app/static/` may only use relative imports that stay inside `app/static/`.
- Worker modules under `src/` may only use relative imports that stay inside `src/`; package imports remain allowed.
- Tests and maintenance scripts may depend on production modules, but production modules must not depend back on tests or scripts.

The checker runs in pre-commit and has focused regression coverage in `tests/test_module_boundaries.py`.

## Verification Topology

- Pytest covers Flask routes, sheet/view-model construction, geocoding and service decisions, disclosure normalization, and data helpers.
- Node's test runner covers pure browser/Worker helpers, runtime policy, route classification, archive summaries, municipal geometry, and selected source-level UI contracts.
- Playwright runs the production-shaped fixture app in desktop and mobile Chromium for search, domain navigation, map focus, details, comparison, provenance, history state, and simulated current location.

The GitHub Quality workflow runs pre-commit formatting, linting, and module-boundary checks plus
pytest and Node unit tests on pull requests and pushes to `main`. Playwright and coverage reporting/
enforcement remain local release checks until the planned `v0.4.3` CI hardening. The dated measured
baseline is recorded in `NOTES.md`.

## Data Stores

- D1 stores normalized feed versions, current outage rows, planned interruption rows, resolved previous-outage rows, disclosure metadata, municipal archive bins, and geometry metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information source files.
- The container image still includes a baked SQLite snapshot for local-compatible fallback paths. Runtime writes inside the container are ephemeral.

## Generated Evidence

Playwright screenshots, JSON snapshots, and other temporary test or audit outputs belong under the ignored repository-local `tmp/` directory. The live UI audit writes to `tmp/live-ui-audit/` by default. Commit durable conclusions to `NOTES.md`, `PLANS.md`, or release notes instead of committing raw generated artifacts.
