# Plan: Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-06-05

This file is the active execution plan. Keep durable evidence, source notes, and long historical reasoning in `research.md`; keep completed release and implementation history in `roadmap-history.md`; keep completed detail here only when it affects current decisions.

## Current State

- Current release in progress: none; `v0.2.6` planning is next.
- Current product shape: map-first address/current-location lookup with server-rendered Flask/Jinja fragments, HTMX, Leaflet, vanilla JavaScript modules, and a Cloudflare Workers + Containers production deployment.
- Production data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Québec payloads, disclosure metadata, and runtime map-context layers.
- Container role: still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible/container fallback paths.
- Important architecture caveat: runtime writes inside the container are ephemeral; durable production state belongs in D1/R2 or another durable store.
- Cost caveat: the June 2026 Cloudflare invoice was driven mostly by Workers Paid baseline plus Durable Object/container runtime costs; D1 and R2 were not material cost drivers on that bill.
- User-facing URL contract: clean root URL with `lang`, `q`, or current-location coordinate parameters; obsolete public `radius_m`, `days`, and `include_planned` parameters were removed from the main interface.
- Debug, collection, cron, internal export/file, and direct durable-status endpoints are private by default; production returns `404` unless the expected debug flag, Worker block, scheduled header, internal header, or operation token is present.
- Current deployed release: `v0.2.5` at commit `1249acf`; Worker version `43b7a4dc-bb09-4249-92b8-9ad231ad58ae`; container image `43b7a4dc`.
- Current test baseline: Python tests, deterministic service/geocoding tests, route smoke coverage, Playwright desktop/mobile Chromium coverage, and production-shaped UI regression fixtures.
- Previous-outage accumulation is working in D1, but visible map grouping needs review: on 2026-06-02 D1 had `9,542` resolved events and `333,117` sightings, with repeated spatial buckets present, while `/api/durable/runtime/previous-map-layers?limit=120` returned 120 single-event layers and zero multi-event groups.

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
- `v0.2.5`: performance measurement, deployment hygiene, and production hardening. Complete.
- `v0.2.6`: sidebar rhythm, layer hierarchy, row-language consistency, and mobile drawer polish. Planned.

### `0.3.x`: Architecture And Product Expansion

Candidate work after the map-first UI is stable:

- move more production reads off container SQLite/static assets toward D1-backed or R2-backed paths
- reduce initial/lazy map payload size with on-demand geometry endpoints, simplified assets, or R2-backed context payloads
- contain Cloudflare runtime cost by moving ordinary user-facing traffic off the Cloudflare Container path toward Worker/static/D1/R2 responses, leaving the Python container only for bounded internal parser/batch work where Python is actually needed
- expose the gathered historical outage/disclosure data through a deliberate API, including clear public/private boundaries, rate limits, data freshness metadata, and stable query shapes
- broaden province/region analytics and `Bilan par région`-style views
- expand disclosure ingestion, geometry enrichment, and geocoder-provider options
- explore opt-in web notifications after PWA installability, based on saved watch areas rather than requiring a literal home address
- replace the Tailwind CDN path with a production build pipeline
- add web-quality fundamentals from the specification.website checklist: page descriptions, canonical/social metadata, `robots.txt`, `sitemap.xml`, cache/resource-hint review, and stronger asset versioning
- complete the practical WCAG/accessibility pass: skip link or equivalent navigation affordance, landmarks, keyboard traps, live-region status messages, contrast, reduced-motion behavior, and screen-reader spot checks
- add production security headers once CDN dependencies are removed or explicitly allowed: Content Security Policy, HSTS, Referrer Policy, Permissions Policy, frame protections, and MIME-sniffing protection

### `0.4.x`: Public Maturity And Machine-Readable Readiness

Candidate work after core UI and production architecture are more settled:

- define public privacy/legal posture: privacy policy, data-retention notes, cookie/local-storage statement, and clear geolocation/address-use language
- add well-known/public-contact files where appropriate: `/.well-known/security.txt`, `humans.txt`, and project/contact metadata
- add agent/AI-reader affordances if useful: `llms.txt`, concise API/data-source documentation, and machine-readable route/schema notes
- evaluate structured data only where it genuinely helps discovery; avoid adding schema markup that overstates the app's authority or data completeness
- revisit observability and incident-response practices once production usage warrants it

## Current Focus: Post-`v0.2.5` Planning

Goal: decide the next small `0.2.x` UI/UX and accessibility polish slice before larger `0.3.x` architecture/product work resumes.

Status: `v0.2.5` is tagged, deployed, smoke-tested, and closed.

Current implementation notes:

- `v0.2.4` deployed successfully after local unit/e2e checks, Playwright desktop/mobile visual verification, Wrangler dry-run, and production smoke checks.
- Production smoke check after `v0.2.4`: `/healthz`, `/`, `/search-map`, `/static/service-worker.js`, and `/api/durable/status` returned `200`.
- Warm post-deploy homepage/search responses were still several seconds because rendered pages and embedded payloads are large; treat this as a `v0.2.5` measurement target.
- D1 durable status after deploy showed fresh `bis` and `aip` versions checked at `2026-05-30T21:07-21:08Z`.
- `v0.2.5` baseline measurement found the slow path was mostly container/app time, not network transfer: production `Server-Timing` was around 5s for `/` and 8-10s for `/search-map`.
- Direct durable runtime endpoints were much faster: operational map layers were sub-second, map context was sub-second, and previous map layers were the main cold endpoint at roughly 2-8s depending on sample.
- Production-shaped local testing showed short-lived durable runtime caching reduces repeated search service time from roughly 10-12s to roughly 1.2-1.4s.
- Previous map context is now capped at 48 recent layers for default/search map context to reduce cold endpoint cost and initial payload weight.
- Sidebar layer toggles are implemented locally: current outages render first; planned, previous, and published disclosure/regional context are opt-in `/map-layer` fetches and can be hidden again without reloading.
- Public operational hardening is implemented locally: collection and cron routes are hidden by default in Flask, the Worker blocks public `/collect`, `/cron`, `/internal`, and `/debug` paths, and direct durable status now requires an operation token.
- Tailwind CDN replacement is deferred to `0.3.x` frontend/tooling work.
- `v0.2.5` deployed on 2026-05-31 with Worker version `43b7a4dc-bb09-4249-92b8-9ad231ad58ae` and container image `43b7a4dc`.
- Post-deploy production sample: homepage `200` in about 2.8s total, address map `200` in about 3.2s total, planned layer `/map-layer` `200` in about 1.3s total.
- Post-deploy privacy checks: public `/api/durable/status`, `/debug/timing/search`, `/collect`, `/cron/hydro`, and `/internal/disclosures/export` returned `404`; `/healthz` and `/service-worker.js` returned `200`.
- June 2 UI/UX review found the current interface is calmer and coherent, but the default Current sidebar still overwhelms the map, the mobile header/drawer combination squeezes the map, the pill system treats too many fields with equal weight, Disclosures still use a different row language, and section-to-map colour linkage is too implicit.
- Desktop and mobile detail cards are much improved; detail-card placement and mobile detail-as-drawer behavior remain useful follow-up work but can be deferred unless they naturally fit into the next small UI slice.

Scope:

- establish repeatable production timing checks
- identify whether TTFB, payload size, lazy geometry, tile loading, or client rendering dominates the current delay
- decide whether to reduce initial HTML/data payloads before deeper frontend/tooling work
- keep deployment health checks explicit enough to avoid stale Worker/container state
- avoid recording query history or saving matches for shareable/reloadable `GET /?q=...` page loads
- add sidebar-driven layer toggles for current outages, planned interruptions, previously seen outages, and disclosure/regional context
- default initial map render to current outages only, then lazy-load secondary layer payloads when toggled on
- keep debug, collection, cron, internal, and direct durable-status endpoints private by default
- keep the next `0.2.x` slice focused on hierarchy/rhythm polish rather than starting the larger historical-data API work

Acceptance criteria:

- production timing data is captured with clear cold/warm measurements
- at least one high-confidence performance bottleneck has an implementation plan or fix
- deployment notes remain current after any release or hotfix
- representative local and production-shaped timings improve without changing the visible map interaction model
- initial address render does not fetch/render planned, previous, disclosure, or regional context until the user enables those layers
- sidebar layer state is clear enough that users can tell what evidence is currently visible on the map
- public operational endpoints return `404` by default, while scheduled/internal/debug-enabled paths still work in tests
- previous-outage layer review: make the displayed "previously seen" layer group by stable historical area buckets, such as municipality plus rounded centroid or derived stable area, rather than exact/current polygon identity, so accumulated history clumps into meaningful repeated-outage areas
- `v0.2.6` scope is small enough to verify with desktop and mobile visual passes without broad architecture changes

Verification so far:

- `uv run pytest -q`: `80 passed` after private operational route hardening
- `npm run test:e2e`: `26 passed`
- `uv run pre-commit run --all-files`: passed
- `npx biome check src/worker.js`: passed
- `npx wrangler deploy --dry-run`: passed
- `npx wrangler deploy`: deployed Worker `43b7a4dc-bb09-4249-92b8-9ad231ad58ae` and container image `43b7a4dc`
- Production smoke/timing checks: passed, with intermittent local `curl` DNS failures worked around by Python `urllib` checks
- Local browser check confirmed initial search payload contains only `outage`, secondary toggles start off, and planned/previous/published layers load on demand.

## Next Release Slices

### `v0.2.4`: Panel, Copy, And Accessibility Polish

- scoped for this release: current-feed copy, undocumented status labels, slightly wider desktop side rail, visible summary focus states, and regression coverage
- defer broader mobile sheet redesign, collapse/minimize affordance, and full WCAG audit to later `0.2.x`

### `v0.2.5`: Performance And Production Hygiene

- deployed 2026-05-31: production timing improvements, sidebar opt-in lazy map layers, and private operational/debug endpoint hardening
- tagged `v0.2.5` at `1249acf`

### `v0.2.6`: Sidebar Rhythm, Layer Hierarchy, And Mobile Drawer Polish

- reduce default Current sidebar dominance so the product reads as map-first, not table-first
- add quiet section-level colour swatches or accents so Current, Planned, Previous, and Disclosures visibly relate to map layer colours
- normalize Disclosures/Published context rows toward the same row language as Current, Planned, and Previous
- tune pill hierarchy so primary time/schedule information, low-information status labels, and client/row counts do not all carry equal visual weight
- recheck mobile header and bottom-drawer proportions so the map retains a clear inspection area
- defer desktop detail-card placement and mobile detail-as-drawer behavior unless they fall naturally out of drawer/panel work
- verify with local browser screenshots at desktop and mobile widths, including default, expanded layer, selected-row, and detail-card states

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
  - private durable status through an authorized operational check, not a public unauthenticated URL
  - static app assets and service worker
  - container status/image if the deploy touched container code

## Current Risks And Open Questions

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
