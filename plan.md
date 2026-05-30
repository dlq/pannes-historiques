# Plan: Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-05-30

This file is the active execution plan. Keep durable evidence, source notes, and long historical reasoning in `research.md`; keep completed release and implementation history in `roadmap-history.md`; keep completed detail here only when it affects current decisions.

## Current State

- Current release: `v0.2.3` on `main`.
- Current product shape: map-first address/current-location lookup with server-rendered Flask/Jinja fragments, HTMX, Leaflet, vanilla JavaScript modules, and a Cloudflare Workers + Containers production deployment.
- Production data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Québec payloads, disclosure metadata, and runtime map-context layers.
- Container role: still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible/container fallback paths.
- Important architecture caveat: runtime writes inside the container are ephemeral; durable production state belongs in D1/R2 or another durable store.
- User-facing URL contract: clean root URL with `lang`, `q`, or current-location coordinate parameters; obsolete public `radius_m`, `days`, and `include_planned` parameters were removed from the main interface.
- Debug timing route: available only when `ENABLE_DEBUG_ROUTES=1`; production returns `404` by default.
- Current deployed release: `v0.2.3` at commit `fea6a8d`; Worker version `03727124-ff45-4d9c-905c-97f59d94ca68`; container image `03727124`.
- Current test baseline: Python tests, deterministic service/geocoding tests, route smoke coverage, Playwright desktop/mobile Chromium coverage, and production-shaped UI regression fixtures.

## Release Roadmap

### `0.1.x`: Stabilization Baseline

Complete.

- `v0.1.3`: formal `pytest` baseline, deterministic service/geocoding tests, route smoke coverage.
- `v0.1.4`: browser-regression setup, Nominatim hardening, operational/docs cleanup, verified status-code decoding, and small UI consistency fixes.

### `0.2.x`: Map-First UI And Interaction Redesign

In progress.

- `v0.2.0`: map-first responsive shell for desktop and mobile. Complete.
- `v0.2.1`: result/detail interaction refinement and selected-state behavior. Complete.
- `v0.2.2`: mobile installability, search entry, current-location, history/back-forward, lightweight region-entry improvements, and frontend module split. Complete.
- `v0.2.3`: map hierarchy, side-rail layer explanation, local Leaflet assets, and production-shaped map regression coverage. Complete.
- `v0.2.4`: panel/layout polish, copy cleanup, and accessibility/usability hardening.
- `v0.2.5`: performance measurement, deployment hygiene, and production hardening.

### `0.3.x`: Architecture And Product Expansion

Candidate work after the map-first UI is stable:

- move more production reads off container SQLite/static assets toward D1-backed or R2-backed paths
- reduce initial/lazy map payload size with on-demand geometry endpoints, simplified assets, or R2-backed context payloads
- broaden province/region analytics and `Bilan par région`-style views
- expand disclosure ingestion, geometry enrichment, and geocoder-provider options
- explore opt-in web notifications after PWA installability, based on saved watch areas rather than requiring a literal home address
- replace the Tailwind CDN path with a production build pipeline if it is not handled in `0.2.5`

## Current Focus: `v0.2.3`

Goal: make the map answer "what matters near this searched place right now?" more quickly and clearly.

Status: released and deployed to production.

Current implementation notes:

- Leaflet is now served from local static assets instead of `unpkg`, because Safari/PWA/offline sessions can otherwise render the server-side rows and legend while failing to initialize the map library.
- The disclosure/detail panel starts hidden and opens only after selecting a map/list item, avoiding an empty overlay over the map.

Scope:

- tune map-layer visual hierarchy so the searched address and relevant nearby current/planned outages dominate
- make broad disclosure/regional context quieter by default
- rely on side-rail section headings/counts for layer explanation instead of a persistent floating map legend
- keep selected map/list states easy to follow when clicking rows, clicking geometries, and opening detail context
- add browser regression coverage for production-shaped map context:
  - current outage
  - planned interruption
  - previous outage
  - disclosure area
  - regional layer
  - desktop panel
  - mobile bottom sheet

Acceptance criteria:

- after an address search, the user can visually identify the searched address and the most relevant nearby current/planned outage context without decoding the whole map
- current, planned, previous, disclosure, and regional layers have distinguishable visual treatment backed by side-rail headings/counts
- broad context layers do not visually compete with direct local outage information
- row-to-map and map-to-row selection remains obvious on desktop and mobile
- Playwright coverage protects the representative layer/selection states

## Next Release Slices

### `v0.2.4`: Panel, Copy, And Accessibility Polish

- give the desktop side panel more room, stronger compaction, or a clear collapse/minimize affordance
- polish mobile header and sheet details that still feel awkward after the `v0.2.2` sheet changes
- improve keyboard/focus behaviour for sheet controls, map-result selection, and detail overlays
- review the UI against W3C/WCAG basics for contrast, focus visibility, labels, and non-pointer access
- clean up French labels/status text and avoid exposing unclear raw source codes such as `N` as primary UI

### `v0.2.5`: Performance And Production Hygiene

- revisit real-user Core Web Vitals, especially Cloudflare Observatory LCP findings
- separate likely causes: container/TTFB, initial HTML size, lazy map payload, tile loading, image/static assets, and client rendering
- decide whether replacing the Tailwind CDN path belongs in `v0.2.5` or moves to broader `0.3.x` frontend/tooling cleanup
- keep debug/operational endpoints private by default and decide whether any debug route should remain available through explicit configuration
- document or automate the deployment/health-check sequence enough to avoid repeating stale-container/image deployment issues

## Completed `0.2.x` Summary

`v0.2.0` delivered the map-first shell:

- full-viewport map surface with desktop side panel and mobile bottom sheet
- lazy map-context loading retained so result cards/search feedback can appear before heavy geometry
- runtime map layers can use D1-backed Worker endpoints when `DURABLE_RUNTIME_URL` is configured

`v0.2.1` improved result/detail interaction:

- stronger selected row state after row clicks, keyboard activation, and map-feature selection
- reduced duplicate searched-place summary information
- fixed stacked map-context result sections in the side panel
- added browser coverage for selected-row behaviour

`v0.2.2` improved mobile/search/installability:

- added manifest, icons, mobile app metadata, root-scoped service worker, and offline fallback
- made address and current-location URLs reloadable/shareable with clean query state
- removed obsolete public radius/days/include-planned query controls from the primary URL contract
- improved mobile sheet layout and detail overlay behaviour
- split shared frontend helpers into `app/static/ui-format.js` and map styling/rendering helpers into `app/static/map-layers.js`
- updated service-worker/static-version handling for the new ES modules

## Testing Strategy

- `0.1.x`: baseline unit/service/route coverage is established.
- `0.2.3`: revisit browser coverage while changing the map hierarchy; protect current, planned, previous, disclosure, regional, desktop panel, and mobile bottom-sheet states.
- `0.2.4`: revisit accessibility-oriented tests while polishing keyboard/focus behaviour, non-pointer flows, labels, and language switching.
- `0.2.5`: revisit production/integration coverage around private debug routes, deployment checks, and performance-sensitive response-size/latency paths.
- `0.3.x`: add more architecture/data-pipeline coverage for D1/R2-backed reads, ingestion/export/mirroring paths, disclosure parser fixtures, and Worker runtime routes.

Before handing off code changes:

- Python: `uv run ruff check . --fix` and `uv run ruff format .`
- Templates: `uv run djlint app/templates --reformat` and `uv run djlint app/templates --lint`
- Static JS/CSS: `npm run format` and `npm run check`
- Broad changes: prefer `uv run pre-commit run --all-files`
- UI changes: run the local app and inspect desktop and mobile browser states

## Operational Notes

- Local app command: `uv run python server.py serve`.
- Production deploy command: `npx wrangler deploy`.
- Do not deploy unless explicitly asked.
- Prefer `npx wrangler deploy --dry-run` for deployment-related changes before a real deploy.
- After every production deploy, verify the container image/version changed, not just the Worker version.
- Production health checks should include:
  - `/healthz`
  - homepage in English/French
  - representative address search
  - `/api/durable/status`
  - static app assets and service worker
  - container status/image if the deploy touched container code

## Current Risks And Open Questions

- The debug/timing endpoint is private by default; decide in `v0.2.5` whether to keep it as an explicitly enabled operational tool or remove it.
- The desktop side panel can still feel cramped with multiple context sections; handle in `v0.2.4`.
- Map layer hierarchy is implemented locally; review visually before tagging `v0.2.3`.
- Accessibility needs a dedicated pass against W3C/WCAG basics; handle in `v0.2.4`.
- Performance should be measured before broad architecture work; handle in `v0.2.5`, then decide what belongs in `0.3.x`.
- Do not speculate about Hydro-Québec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Do not append long implementation narratives for completed releases.
- Move durable findings, source URLs, command evidence, and longer reasoning to `research.md`.
- Move completed release summaries and implementation checkpoints to `roadmap-history.md`.
- If this file grows past roughly 300-400 lines again, compact completed sections before adding more plan detail.
