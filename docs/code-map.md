# Code Map

Use this map before opening large files. Prefer targeted `rg` searches over reading whole modules, and avoid `app/static/vendor/` unless debugging vendored MapLibre itself.

## Start Here

- `PLANS.md`: active slice, roadmap, and current risks.
- `docs/current-snapshot.md`: quickest version/runtime orientation.
- `docs/architecture.md`: request flow, module boundaries, runtime ownership.
- `docs/contributing.md`: local setup and verification commands.
- `docs/cost-containment.md`: cost posture and architecture options.
- `docs/operations.md`: deployment and production smoke checks.

## Python Runtime

- `server.py`: local app entrypoint.
- `app/web.py`: Flask app factory and route registration.
- `app/views.py`: page and API route handlers.
- `app/services.py`: search/service orchestration.
- `app/sheet_views.py`: sheet fragment view-model construction.
- `app/durable_runtime.py`: private Worker durable-runtime client.
- `app/db.py`: SQLite/local database helpers.
- `app/hydro.py`: Hydro-Quebec feed parsing and change decisions.
- `app/disclosures.py`: DAI/access-to-information ingestion and parsing.
- `app/geocoding.py`: geocoder integration and cache behavior.
- `app/i18n.py`: UI labels and localization helpers.
- `app/perf.py`: request timing/log helpers.

## Templates And Browser

- `app/templates/index.html`: main shell.
- `app/templates/_sheet*.html`: sheet root, search, explore, and overview fragments.
- `app/templates/_domain_*.html`: current/planned/archive/context domain fragments.
- `app/templates/_macros.html`: shared Jinja UI macros.
- `app/static/app.js`: browser module bootstrap.
- `app/static/sheet.js`: sheet navigation, detents, detail cards, and row focus.
- `app/static/outage-map.js`: MapLibre custom element.
- `app/static/search.js`: autocomplete, comparison tray, browser history.
- `app/static/detail-panels.js`: disclosure/regional detail panel custom element.
- `app/static/map-utils.js`: pure map helper functions.
- `app/static/ui-format.js`: browser formatting/localization helpers.
- `app/static/vendor/`: vendored third-party assets; usually exclude from source search.

## Worker Runtime

- `src/worker.js`: Cloudflare Worker fetch/scheduled entrypoints and D1/R2 runtime behavior.
- `src/worker-routing.js`: public/private path classification.
- `src/runtime-policy.js`: private durable-runtime access policy.
- `src/container-proxy.js`: Worker-to-container forwarding.
- `src/container.js`: Cloudflare Container configuration.
- `src/archive-summary.js`: previous-outage archive summary shaping.
- `src/municipal-archive.js`: municipal geometry and archive-bin helpers.

## Data, Migrations, And Scripts

- `migrations/*.sql`: D1 schema changes.
- `data/README.md`: local data directory purpose.
- `scripts/check_module_boundaries.py`: enforced module-boundary checker.
- `scripts/maintenance/`: operator-driven maintenance and audit helpers.

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
