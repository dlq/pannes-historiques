# Architecture

Pannes Historiques is a Flask application deployed behind a Cloudflare Worker and Container. The current design keeps the browser-facing app stable while moving durable production state into D1 and R2.

## Request Flow

- Public page requests (`/`, `/about`, `GET /sheet`, and the POST `/search`/`/search-location` compat aliases) enter the Worker and are forwarded to the Flask container.
- Public read APIs under `/api/durable/hydro`, `/api/durable/nearby`, and `/api/durable/history-nearby` are served directly by the Worker from D1/R2.
- Private runtime APIs under `/api/durable/runtime/*` are Worker endpoints used by the container. They require `X-Pannes-Operation-Token`.
- Private operational paths (`/internal/*`, `/cron/*`, `/collect*`, `/debug/*`) are blocked at the Worker edge unless they are reached through scheduled/internal flows.

## Browser Interface

The interface is one full-bleed MapLibre GL map (OpenFreeMap Liberty vector style, vendored `maplibre-gl` under `app/static/vendor/maplibre/`) plus a single sheet: a bottom sheet with peek/half/full detents on mobile, a floating left panel on desktop. The search field lives in the sheet. A four-way segmented control (`current`, `planned`, `archive`, `context`) selects the active domain; the sheet content and the visible map layer always match, each domain with its own semantic color (red current, amber planned, violet archive, teal published context).

- Explore mode (no address): the segmented control is the root navigation; each domain renders a purpose-built fragment (sorted current rows, date-grouped planned schedule, archive report with time windows, disclosure document list).
- Address mode: the root is an overview answer stack (current/planned status lines, local-history hero card with a 14-month chart, comparison entry). Domain views are pushed pages with a back control and a `5 km / Québec` scope toggle. Detail cards open inside the sheet at half detent so the focused map geometry stays visible.
- `GET /sheet` returns any sheet fragment; each fragment embeds a JSON map update that `sheet.js` fans out to the persistent `<outage-map>` element via `map-layer-items` / `map-address` events. `/` renders the shell with the initial fragment and map payload inline.

## Runtime Ownership

- `app/` owns Flask routes, search orchestration, Jinja rendering, local SQLite fallback paths, and Python collectors. `app/sheet_views.py` builds the sheet fragment contexts.
- `app/static/` owns browser behavior as plain ES modules: `sheet.js` (detents, domain navigation, detail cards), `outage-map.js` (MapLibre element), `map-utils.js` (pure helpers), `search.js` (autocomplete, comparison tray, history), `detail-panels.js` (disclosure/regional detail rendering).
- `src/worker.js` owns Worker fetch/scheduled entrypoints and D1/R2 runtime behavior.
- `src/container.js` owns Cloudflare Container configuration.
- `src/worker-routing.js` owns top-level Worker path classification.
- `src/runtime-policy.js` owns private durable-runtime endpoint policy.
- `src/municipal-archive.js` owns pure municipal geometry helpers shared by Worker code and maintenance scripts.
- `scripts/maintenance/` owns one-off or operator-driven maintenance scripts.

## Enforced Module Boundaries

`uv run python scripts/check_module_boundaries.py` enforces the core runtime boundaries:

- Python runtime modules under `app/` must not import from `scripts/`, `src/`, or `tests/`.
- Browser modules under `app/static/` may only use relative imports that stay inside `app/static/`.
- Worker modules under `src/` may only use relative imports that stay inside `src/`; package imports remain allowed.
- Tests and maintenance scripts may depend on production modules, but production modules must not depend back on tests or scripts.

The checker runs in pre-commit and has focused regression coverage in `tests/test_module_boundaries.py`.

## Data Stores

- D1 stores normalized feed versions, current outage rows, planned interruption rows, resolved previous-outage rows, disclosure metadata, municipal archive bins, and geometry metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information source files.
- The container image still includes a baked SQLite snapshot for local-compatible fallback paths. Runtime writes inside the container are ephemeral.

## Generated Evidence

Playwright screenshots, JSON snapshots, and other large run outputs belong under ignored `output/` paths. Commit durable conclusions to `NOTES.md`, `PLANS.md`, or release notes instead of committing raw generated artifacts.
