# Architecture

Pannes Historiques is a Flask application deployed behind a Cloudflare Worker and Container. The current design keeps the browser-facing app stable while moving durable production state into D1 and R2.

Long-lived architectural choices are recorded in the [ADR index](adr/README.md). This document describes the current implementation; ADRs explain why consequential choices were made and when to revisit them.

## Worker Route Boundaries

The Worker classifies every request before it can wake the container. The route rules live in [worker-routing.js](../src/worker-routing.js); [runtime-policy.js](../src/runtime-policy.js) owns the authorization policy for private durable-runtime operations.

| Route group | Examples | Access | Owning runtime |
| --- | --- | --- | --- |
| Public page routes | `/`, `/about`, `GET /sheet`, static assets, `POST /search`, `POST /search-location` | Public; forwarded to Flask when needed | Worker and container |
| Public durable APIs | `/api/durable/hydro`, `/api/durable/nearby`, `/api/durable/history-nearby`, `/api/health/ingestion` | Public read-only responses | Worker with D1/R2 |
| Public published context | `GET /api/durable/runtime/map-context` | Public read-only published disclosure/regional context | Worker with D1/R2 |
| Private runtime APIs | `/api/durable/status`, `/api/ops/cost-health`, protected `/api/durable/runtime/*` endpoints | Authorized operations only | Worker with D1/R2 |
| Blocked operational paths | `/internal/*`, `/cron/*`, `/collect*`, `/debug/*`, common framework probes | Rejected at the edge | Worker |

Forwarded page responses report `X-Pannes-Runtime: container` and `worker-container` in `Server-Timing`; Worker-first durable reads report `X-Pannes-Runtime: worker-d1`.

`PANNES_LOW_COST_MODE=1` is an emergency container-wake kill switch. Durable public data APIs keep serving last-known D1/R2 data; container-needed page routes return a marked `503` instead of waking Flask. It is deliberately not a substitute for a static browser shell.

## Cost Decision

The near-term architecture is **hybrid renderer with Worker-first durable reads**. D1/R2 remain canonical for production data and the Worker serves the data APIs and materialized runtime reads; Flask/Jinja remains the browser shell while its interaction model is still changing. A Worker-rendered or static shell is deferred until production markers show that shell requests, rather than durable reads, are the material source of recurring container cost. See [ADR 0001](adr/0001-hybrid-renderer-worker-first-reads.md).

## Browser Interface

The interface is one full-bleed MapLibre GL v6 map (OpenFreeMap Liberty vector style, vendored ESM entry, shared module, and worker under `app/static/vendor/maplibre/`) plus a single sheet: a bottom sheet with peek/half/full detents on mobile, a floating left panel on desktop. The search field lives in the sheet. A four-way segmented control (`current`, `planned`, `archive`, `context`) selects the active domain; the sheet content and the visible map layer always match, each domain with its own semantic color (red current, amber planned, violet archive, teal published context).

- Explore mode (no address): the segmented control is the root navigation; each domain renders a purpose-built fragment (sorted current rows, date-grouped planned schedule, archive report with time windows, disclosure document list).
- Address mode: the root is an overview answer stack (current/planned status lines, local-history hero card with a 14-month chart, comparison entry). Typed-address searches default to 2 km and offer 1/2/5/10 km radius choices; coordinate and explore flows default to 5 km. Domain views are pushed pages with a back control and a `Local / Québec` scope toggle. Detail cards open inside the sheet at half detent so the focused map geometry stays visible.
- `GET /sheet` returns any sheet fragment; each fragment embeds a JSON map update that `sheet.js` fans out to the persistent `<outage-map>` element via `map-layer-items` / `map-address` events. `/` renders the shell with the initial fragment and map payload inline.

## Runtime Ownership

- `app/` owns Flask routes, search orchestration, Jinja rendering, local SQLite fallback paths, and Python collectors. `app/sheet_views.py` builds the sheet fragment contexts. `app/durable_runtime.py` owns the `DurableRuntimeClient` for Worker runtime reads; `map-context` is public, while protected calls currently fall back when the container cannot authenticate.
- `app/static/` owns browser behavior as plain ES modules: `sheet.js` (detents, domain navigation, detail cards), `outage-map.js` (MapLibre element), `map-events.js` (map/sheet event contract), `map-utils.js` (pure helpers), `search.js` (autocomplete, comparison tray, history), `detail-panels.js` (disclosure/regional detail rendering).
- `src/worker.js` owns Worker fetch/scheduled entrypoints and D1/R2 runtime behavior.
- `src/container.js` owns Cloudflare Container configuration.
- `src/worker-routing.js` owns top-level Worker path classification.
- `src/runtime-policy.js` owns private durable-runtime endpoint policy.
- `src/durable-read-handlers.js` owns public D1-backed durable read responses and their spatial query helpers.
- `src/ingestion-health.js` owns the pure freshness and failure-streak decision used by the public ingestion-health probe.
- `src/archive-health.js` owns pure archive-run retention cutoffs and archive-completeness shaping.
- `src/municipal-archive.js` owns pure municipal geometry helpers shared by Worker code and maintenance scripts.
- `src/archive-summary.js` owns pure helpers for the previous-outage archive summary: row shaping, the stored-payload shape guard that turns an unrecognised summary into a cache miss, and the coherence checks that compare a summary's figures against each other.
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

The GitHub Quality workflow runs pre-commit formatting, linting, module-boundary checks, Python
branch coverage with a non-regressing floor, and Node unit tests on pull requests and pushes to
`main`. The full Playwright desktop/mobile suite runs on pull requests, after pushes to `main`, and
by manual dispatch; browser-facing pull requests still require focused local browser verification.
The measured baseline is recorded in `NOTES.md`.

## Data Stores

- D1 stores normalized feed versions, current outage rows, planned interruption rows, resolved previous-outage rows, disclosure metadata, municipal archive bins, and geometry metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information source files.
- The container image still includes a baked SQLite snapshot for local-compatible fallback paths. Runtime writes inside the container are ephemeral.

See [ADR 0002](adr/0002-d1-r2-canonical-production-state.md) for the durable-store boundary, [ADR 0003](adr/0003-preserve-raw-source-inputs.md) for source-data provenance, and [ADR 0005](adr/0005-d1-archive-retention-and-compaction.md) for retention and compaction guardrails.

## Generated Evidence

Playwright screenshots, JSON snapshots, and other temporary test or audit outputs belong under the ignored repository-local `tmp/` directory. The live UI audit writes to `tmp/live-ui-audit/` by default. Commit durable conclusions to `NOTES.md`, `PLANS.md`, or release notes instead of committing raw generated artifacts.
