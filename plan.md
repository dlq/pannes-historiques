# Plan: Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-05-30

This file is the active execution plan. Keep durable evidence, source notes, and long historical reasoning in `research.md`; keep completed release and implementation history in `roadmap-history.md`; keep completed detail here only when it affects current decisions.

## Current State

- Current release in progress: `v0.2.5` on `main`.
- Current product shape: map-first address/current-location lookup with server-rendered Flask/Jinja fragments, HTMX, Leaflet, vanilla JavaScript modules, and a Cloudflare Workers + Containers production deployment.
- Production data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Québec payloads, disclosure metadata, and runtime map-context layers.
- Container role: still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible/container fallback paths.
- Important architecture caveat: runtime writes inside the container are ephemeral; durable production state belongs in D1/R2 or another durable store.
- User-facing URL contract: clean root URL with `lang`, `q`, or current-location coordinate parameters; obsolete public `radius_m`, `days`, and `include_planned` parameters were removed from the main interface.
- Debug timing route: available only when `ENABLE_DEBUG_ROUTES=1`; production returns `404` by default.
- Current deployed release: `v0.2.4` at commit `932f78c`; Worker version `acf1eb43-1ca2-4afb-afc1-161c276541b5`; container image `acf1eb43`.
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
- `v0.2.4`: scoped copy/data-truth cleanup, safer status labels, side-panel width/focus polish, and accessibility-oriented regression checks. Complete.
- `v0.2.5`: performance measurement, deployment hygiene, and production hardening. Next.

### `0.3.x`: Architecture And Product Expansion

Candidate work after the map-first UI is stable:

- move more production reads off container SQLite/static assets toward D1-backed or R2-backed paths
- reduce initial/lazy map payload size with on-demand geometry endpoints, simplified assets, or R2-backed context payloads
- broaden province/region analytics and `Bilan par région`-style views
- expand disclosure ingestion, geometry enrichment, and geocoder-provider options
- explore opt-in web notifications after PWA installability, based on saved watch areas rather than requiring a literal home address
- replace the Tailwind CDN path with a production build pipeline if it is not handled in `0.2.5`

## Current Focus: `v0.2.5`

Goal: measure and improve production performance and deployment hygiene before larger product work resumes.

Status: implementation in progress.

Current implementation notes:

- `v0.2.4` deployed successfully after local unit/e2e checks, Playwright desktop/mobile visual verification, Wrangler dry-run, and production smoke checks.
- Production smoke check after `v0.2.4`: `/healthz`, `/`, `/search-map`, `/static/service-worker.js`, and `/api/durable/status` returned `200`.
- Warm post-deploy homepage/search responses were still several seconds because rendered pages and embedded payloads are large; treat this as a `v0.2.5` measurement target.
- D1 durable status after deploy showed fresh `bis` and `aip` versions checked at `2026-05-30T21:07-21:08Z`.
- `v0.2.5` baseline measurement found the slow path was mostly container/app time, not network transfer: production `Server-Timing` was around 5s for `/` and 8-10s for `/search-map`.
- Direct durable runtime endpoints were much faster: operational map layers were sub-second, map context was sub-second, and previous map layers were the main cold endpoint at roughly 2-8s depending on sample.
- Production-shaped local testing showed short-lived durable runtime caching reduces repeated search service time from roughly 10-12s to roughly 1.2-1.4s.
- Previous map context is now capped at 48 recent layers for default/search map context to reduce cold endpoint cost and initial payload weight.

Scope:

- establish repeatable production timing checks
- identify whether TTFB, payload size, lazy geometry, tile loading, or client rendering dominates the current delay
- decide whether to reduce initial HTML/data payloads before deeper frontend/tooling work
- keep deployment health checks explicit enough to avoid stale Worker/container state
- avoid recording query history or saving matches for shareable/reloadable `GET /?q=...` page loads

Acceptance criteria:

- production timing data is captured with clear cold/warm measurements
- at least one high-confidence performance bottleneck has an implementation plan or fix
- deployment notes remain current after any release or hotfix
- representative local and production-shaped timings improve without changing the visible map interaction model

## Next Release Slices

### `v0.2.4`: Panel, Copy, And Accessibility Polish

- scoped for this release: current-feed copy, undocumented status labels, slightly wider desktop side rail, visible summary focus states, and regression coverage
- defer broader mobile sheet redesign, collapse/minimize affordance, and full WCAG audit to later `0.2.x`

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
- The desktop side panel can still feel cramped with multiple context sections; `v0.2.4` gives it more width, but broader collapse/minimize design can still wait.
- Accessibility needs a dedicated pass against W3C/WCAG basics; handle in `v0.2.4`.
- Performance should be measured before broad architecture work; handle in `v0.2.5`, then decide what belongs in `0.3.x`.
- Do not speculate about Hydro-Québec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Do not append long implementation narratives for completed releases.
- Move durable findings, source URLs, command evidence, and longer reasoning to `research.md`.
- Move completed release summaries and implementation checkpoints to `roadmap-history.md`.
- If this file grows past roughly 300-400 lines again, compact completed sections before adding more plan detail.
