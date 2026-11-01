# Code Map

Use this map before opening large files. Prefer targeted `rg` searches over reading whole modules, and avoid `app/static/vendor/` unless debugging vendored MapLibre itself.

## Start Here

- `PLANS.md`: compact active slice, roadmap, and current risks; `docs/plans/` holds the four detailed proposed plans.
- `docs/current-snapshot.md`: quickest version/runtime orientation.
- `docs/architecture.md`: request flow, module boundaries, runtime ownership.
- `docs/contributing.md`: local setup and verification commands.
- `docs/cost-containment.md`: cost posture and architecture options.
- `docs/operations.md`: deployment, production smoke checks and verified Cloudflare RUM configuration.
- `docs/archive-storage-dependencies.md`: archive readers/writers, replay dependencies and storage gates.
- `docs/accessibility-audit.md`: repeatable axe scan, fixes and remaining manual checks.

## Python Runtime

- `server.py`: local app entrypoint.
- `app/web.py`: Flask app factory and route registration.
- `app/views.py`: page and API route handlers.
- `app/services.py`: search/service orchestration.
- `app/sheet_views.py`: sheet fragment view-model construction.
- `app/durable_runtime.py`: public materialized-read-only Worker client (`map-context`, `previous-archive-summary`); no protected runtime dependency.
- `app/db.py`: SQLite/local database helpers.
- `app/hydro.py`: Hydro-Quebec feed parsing and change decisions.
- `app/disclosures.py`: DAI/access-to-information ingestion and parsing.
- `app/geocoding.py`: geocoder integration and cache behavior.
- `app/i18n.py`: UI labels and localization helpers.
- `app/perf.py`: request timing/log helpers.
- `app/safe_files.py`: path validation for retained raw-source files.

## Templates And Browser

- `app/templates/index.html`: main shell.
- `app/templates/_sheet*.html`: sheet root, search, explore, and overview fragments.
- `app/templates/_domain_*.html`: current/planned/archive/context domain fragments.
- `app/templates/_macros.html`: shared Jinja UI macros.
- `app/static/app.js`: browser module bootstrap.
- `app/static/sheet.js`: sheet navigation, detents, detail cards, and row focus.
- `app/static/outage-map.js`: MapLibre custom element.
- `app/static/map-events.js`: named event contract and pending map focus state shared by sheet/map modules.
- `app/static/search.js`: autocomplete, location recovery, comparison tray and browser history.
- `app/static/service-worker.js` and `offline.js`: offline-only fallback cache and bilingual exact-URL retry.
- `app/static/usage-evidence.js`: allowlisted GPC/DNT-aware interaction reporting.
- `app/static/detail-panels.js`: disclosure/regional detail panel custom element.
- `app/static/map-utils.js`: pure map helper functions.
- `app/static/ui-format.js`: browser formatting/localization helpers.
- `app/static/vendor/`: vendored third-party assets; MapLibre v6 ships as ESM entry, shared module, and worker files. Usually exclude this directory from source search.

## Worker Runtime

- `src/worker.js`: Cloudflare Worker fetch/scheduled entrypoints and D1/R2 runtime behavior.
- `src/http-response.js`: shared Worker JSON response defaults and caller overrides.
- `src/durable-read-handlers.js`: public durable read handlers and spatial query helpers.
- `src/worker-routing.js`: public/private path classification.
- `src/runtime-policy.js`: private durable-runtime access policy.
- `src/container-proxy.js`: Worker-to-container forwarding.
- `src/container.js`: Cloudflare Container configuration.
- `src/archive-summary.js`: previous-outage archive summary shaping, plus the stored-payload shape guard and the cross-field coherence checks the health probe runs.
- `src/archive-health.js`: pure retention cutoffs and archive-completeness shaping.
- `src/usage-evidence.js`: bounded daily aggregates, retention, classification and private readout.
- `src/ingestion-health.js`: pure snapshot freshness and failure-streak health decisions.
- `src/municipal-archive.js`: municipal geometry and archive-bin helpers.

## Data, Migrations, And Scripts

- `migrations/*.sql`: D1 schema changes.
- `data/README.md`: local data directory purpose.
- `scripts/check_module_boundaries.py`: enforced module-boundary checker.
- `scripts/maintenance/`: operator-driven maintenance and audit helpers, including `browser-module-baseline.mjs` for document-resource timing/bytes.
- `docs/browser-module-baseline.md`: dated production measurements and measurement limits.

## Tests

- `tests/test_*.py`: Python route/service/parser/runtime tests.
- `tests/*.test.js`: Node tests for browser/Worker helpers and source-level contracts.
- `tests/e2e/*.spec.ts`: Playwright desktop/mobile browser flows.
- `tests/e2e_server.py`: fixture server used by Playwright.

## Search Tips

- Use `rg "symbol" app src tests` for code.
- Use `rg "route" src app tests` for Worker/Flask boundary questions.
- Use `rg "data-attribute" app/templates app/static tests/e2e` for UI wiring.
- Use `rg --hidden "pattern" -g '!app/static/vendor/**'` only when hidden files are genuinely needed.

## Naming Contracts

These names describe different layers, rather than aliases to replace globally:

| Concept | Names | Meaning |
| --- | --- | --- |
| Sheet domain | `overview`, `current`, `planned`, `archive`, `context` | User-facing navigation and answer shape |
| Map layer scope | `current`, `planned`, `previous`, `published` | Service/browser data selection |
| Record kind | `outage`, `planned`, `previous_outage`, `disclosure`, `regional_metric` | Individual evidence classification |

Browser `mapLayerForKind` maps record kinds to layer scopes; `MAP_COLORS` supplies marker colors. Its `context` color key is a display palette entry, not a `published` scope identifier.

`AppService.search` resolves typed addresses and `search_location` accepts device coordinates. Both delegate evidence loading, grouping and optional history persistence to `_search_at_location`. `_fetch_public_durable_json` shares only transport for selected public data URLs; it does not widen the protected runtime client's endpoint policy.

Legacy `resolved_events` rows retain observed history; the table name does not prove a confirmed restoration. Do not cosmetically rename storage/API fields, source identifiers or the persisted container instance name. Event identity/count contracts and migrations belong to their dedicated plan.
