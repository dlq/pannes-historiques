# Plan: Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-06-20

This file is the active execution plan. Keep durable evidence, source notes, and long historical reasoning in `NOTES.md`; keep completed release and implementation history in `CHANGELOG.md`; keep completed detail here only when it affects current decisions.

## Current State

- Current deployed release: `v0.3.0`, the architecture-transition baseline after the post-`v0.2.8` municipal archive materialization, runtime/container fix, production health sweep, and operational follow-up notes.
- Current release in progress: none; `v0.3.1` frontend/web-quality foundation is next.
- Current frontend slice: `codex/frontend-stability-summary` is pushed to origin, deployed, smoke-tested, and merged into `main`. It adds an address-level local stability answer card, makes local previous-outage evidence the default address-search section, adds row/scope labels, removes the zero-size current-layer toggle, labels optional layer visibility controls as explicit Show/Hide actions, makes map/row selection populate an operational detail panel, and replaces the `PH` favicon/app icon with an outage-location mark.
- Current product shape: map-first address/current-location lookup with server-rendered Flask/Jinja fragments, HTMX, Leaflet, decomposed vanilla JavaScript ES modules, icon-backed sidebar/detail rows, local previous-outage evidence, municipal archive bins, and a Cloudflare Workers + Containers production deployment.
- Production data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Québec payloads, disclosure metadata, and runtime map-context layers.
- Container role: still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible/container fallback paths.
- Important architecture caveat: runtime writes inside the container are ephemeral; durable production state belongs in D1/R2 or another durable store.
- Cost caveat: the June 2026 Cloudflare invoice was driven mostly by Workers Paid baseline plus Durable Object/container runtime costs; D1 and R2 were not material cost drivers on that bill.
- User-facing URL contract: clean root URL with `lang`, `q`, or current-location coordinate parameters; obsolete public `radius_m`, `days`, and `include_planned` parameters were removed from the main interface.
- Debug, collection, cron, internal export/file, direct durable-status, and durable runtime endpoints are private by default; production returns `404` unless the expected debug flag, Worker block, scheduled header, internal header, or operation token is present.
- Current release marker: service worker cache name `pannes-historiques-v0.3.0-architecture-transition`; latest public smoke check before the release commit on 2026-06-20 returned `200` for `/`, `/search-map`, current/archive/planned map layers, archive summary, and Hydro data endpoints.
- Current deployed code includes the frontend stability-summary work first landed on the branch through `e25adec`, including the local-stability answer-card UI, no-letter outage-location favicon/app icon, explicit Show/Hide layer actions, and Current-header alignment spacer.
- Current `main` is the `v0.3.0` release candidate: it is past the `v0.2.8` tag, includes municipal archive materialization and the container runtime authentication fix, and is the baseline for upcoming `0.3.x` work.
- Current operational follow-ups from 2026-06-20 health sweep: remove or expire stale `ingestion_runs` rows stuck in `running`; group/de-duplicate the Archive "latest" summary rows by territory before display; monitor D1 growth after the database reached roughly 935 MB; keep archive/count aggregations on materialized summaries rather than live full-table scans; continue moving user search paths away from the container where practical; and make the trusted container-runtime Worker host configurable instead of hardcoding the current `dalaque.workers.dev` value.
- Current test baseline: Python tests, deterministic service/geocoding tests, route smoke coverage, Playwright desktop/mobile Chromium coverage, and production-shaped UI regression fixtures.
- Previous-outage accumulation is working in D1, but visible map grouping needs review: on 2026-06-02 D1 had `9,542` resolved events and `333,117` sightings, with repeated spatial buckets present, while `/api/durable/runtime/previous-map-layers?limit=120` returned 120 single-event layers and zero multi-event groups.

## Cost Containment Plan

This project has no current monetization model: no ads, subscriptions, paid API, or sponsor-backed operating budget. Treat it as a public-interest/research prototype with a near-zero marginal-cost target.

Budget posture:

- Target steady-state cost: Workers Paid baseline plus domain registration, with D1/R2 remaining within included usage where possible.
- Acceptable overage: small, occasional, explainable spikes from development deploys, manual backfills, or one-time data migrations.
- Unacceptable steady state: recurring Durable Object/container overage caused by normal public browsing, searching, or map interaction.
- Cost decision rule: any feature that increases recurring Cloudflare runtime cost needs an explicit research/user-value justification and a fallback or disable path.

Primary architecture direction:

- Public user traffic should not wake the Python container.
- Ordinary browsing, startup map context, address search, layer toggles, archive summaries, disclosure summaries, language switches, and static assets should be served by Worker/static/D1/R2 paths.
- The Python container should become an internal parser/batch service for scheduled ingestion, complex one-off maintenance, and local-compatible development behavior.
- Production writes and durable state should stay in D1/R2; container-local writes remain ephemeral and should not be part of the production data contract.

Execution plan:

1. Public route/runtime audit.
   - Classify production routes as `edge-safe`, `container-needed`, or `internal-only`.
   - Add response headers or `Server-Timing` markers such as `x-pannes-runtime: worker` and `x-pannes-runtime: container` so production smoke tests can prove whether a browser path touched the container.
   - Include `/`, `/search-map`, static assets, current/planned/archive/disclosure layer endpoints, language switching, address search, and current-location search.
2. Cost health endpoint and monthly evidence.
   - Add a private `/api/ops/cost-health` or equivalent operational check reporting container live-instance state, last container wake, last cron run, D1 size, R2 approximate storage/object counts where available, latest ingestion status, and archive-bin materialization status.
   - Add a monthly bill/usage review checklist that compares Durable Object duration, container memory/vCPU/disk usage, D1 storage, D1 row reads/writes, and R2 storage/operations against the target posture.
3. Move public reads off the container.
   - Prioritize `v0.3.2` work so startup data, representative search, operational map layers, archive summaries, and disclosure summaries use Worker/D1/R2 without invoking Flask/container.
   - Keep D1 for indexed relational rows and compact materialized summaries.
   - Keep R2 for raw feeds, DAI/source files, and bulky precomputed geometry/map payload artifacts.
4. Make cron/parser work bounded.
   - Split scheduled ingestion into resumable phases: version check, raw download to R2, parse, D1 write, summary/materialization update, and cleanup.
   - Add max runtime, retry/backoff, and resume cursors for long parser jobs.
   - Incrementally bin only newly resolved outage sightings where possible instead of rebuilding global archive summaries on every run.
5. Add low-cost production mode.
   - Add a config switch where public routes refuse to call the container and serve last-known-good D1/R2 data.
   - Allow scheduled ingestion/parser jobs to be paused without breaking public read-only access.
   - Surface data freshness clearly in operational checks and, if needed, in the UI.

Cost follow-up thresholds:

- Durable Object duration above roughly `$5/month`: investigate immediately.
- Container runtime above roughly `$3/month`: audit public route wakeups and migrate the highest-traffic route first.
- D1 approaching the included 5 GB storage threshold: define retention, rollup, compaction, or archive-offload policy before it becomes a recurring charge.
- R2 leaving included storage/operation ranges: review raw-file retention and precomputed geometry payload strategy.

## Release Roadmap

### `0.1.x`: Stabilization Baseline

Complete.

- `v0.1.3`: formal `pytest` baseline, deterministic service/geocoding tests, route smoke coverage.
- `v0.1.4`: browser-regression setup, Nominatim hardening, operational/docs cleanup, verified status-code decoding, and small UI consistency fixes.

### `0.2.x`: Map-First UI And Interaction Redesign

Complete.

- `v0.2.0`: map-first responsive shell for desktop and mobile. Complete.
- `v0.2.1`: result/detail interaction refinement and selected-state behavior. Complete.
- `v0.2.2`: mobile installability, search entry, current-location, history/back-forward, lightweight region-entry improvements, and frontend module split. Complete.
- `v0.2.3`: map hierarchy, side-rail layer explanation, local Leaflet assets, and production-shaped map regression coverage. Complete.
- `v0.2.4`: scoped copy/data-truth cleanup, safer status labels, side-panel width/focus polish, and accessibility-oriented regression checks. Complete.
- `v0.2.5`: performance measurement, deployment hygiene, and production hardening. Complete.
- `v0.2.6`: sidebar rhythm, layer hierarchy, row-language consistency, detail-panel rationalization, and frontend static-module decomposition. Complete.
- `v0.2.7`: municipal/TNO/Indigenous-territory archive-bin schema, Worker runtime endpoints, binning helpers, previous-archive sidebar polish, and service-worker/static marker update. Complete and deployed.
- `v0.2.8`: final `0.2.x` checkpoint bundling post-`v0.2.7` municipal archive cursor hardening, local stability answer card, address-result UX follow-up, favicon/app-icon cleanup, production UI audit artifacts, and docs synchronization. Complete.

### `0.3.x`: Architecture, Web Quality, And Product Expansion

Candidate work after the map-first UI is stable:

- move more production reads off container SQLite/static assets toward D1-backed or R2-backed paths
- reduce initial/lazy map payload size with on-demand geometry endpoints, simplified assets, or R2-backed context payloads
- evaluate a no-label basemap plus Quebec-only label overlay as a pragmatic custom-map-style step before a full vector-tile migration; keep Leaflet if possible, add curated and zoom-gated Quebec place labels, and avoid showing non-Quebec city labels baked into raster tiles
- contain Cloudflare runtime cost by moving ordinary user-facing traffic off the Cloudflare Container path toward Worker/static/D1/R2 responses, leaving the Python container only for bounded internal parser/batch work where Python is actually needed
- expose the gathered historical outage/disclosure data through a deliberate API, including clear public/private boundaries, rate limits, data freshness metadata, and stable query shapes
- broaden province/region analytics and `Bilan par région`-style views
- expand disclosure ingestion, geometry enrichment, and geocoder-provider options
- explore opt-in web notifications after PWA installability, based on saved watch areas rather than requiring a literal home address
- replace the Tailwind CDN path with a production build pipeline
- measure Cloudflare static-asset performance before adopting a bundler: compare cold/warm module waterfall cost, CSS/JS/icon/font transfer size, compression, cache headers, ETag behaviour, service-worker cache behaviour, and Cloudflare Observatory/Lighthouse results for the current native-module graph versus any bundled candidate
- add web-quality fundamentals from the specification.website checklist: page descriptions, canonical/social metadata, `robots.txt`, `sitemap.xml`, cache/resource-hint review, and stronger asset versioning
- complete the practical WCAG/accessibility pass: skip link or equivalent navigation affordance, landmarks, keyboard traps, live-region status messages, contrast, reduced-motion behavior, and screen-reader spot checks
- add production security headers once CDN dependencies are removed or explicitly allowed: Content Security Policy, HSTS, Referrer Policy, Permissions Policy, frame protections, and MIME-sniffing protection

Planned slice order:

- `v0.3.0`: architecture-transition baseline. Starts from the deployed `v0.2.8` baseline, captures production timing/cost/data-health evidence, lands municipal archive summary materialization and the container runtime authentication fix, and records the first architecture follow-ups. Complete.
- `v0.3.1`: frontend/web-quality foundation. Replace the Tailwind CDN path with a production build path or explicitly justify a smaller alternative; add SEO basics, `robots.txt`, `sitemap.xml`, and cache/resource-header cleanup.
- `v0.3.2`: public-read architecture. Move ordinary user-facing shell/search/map reads away from the Cloudflare Container where practical, using Worker/static/D1/R2 paths while keeping the Python container for bounded parser/batch work.
- `v0.3.3`: historical-data API. Define stable public/private route boundaries, freshness metadata, rate limits, and query shapes for accumulated outage/disclosure data.
- `v0.3.4`: analytical map/product expansion. Revisit Quebec-only labels, regional/municipal archive views, `Bilan par région`-style summaries, and saved-area notification feasibility.

### `0.4.x`: Public Maturity And Machine-Readable Readiness

Candidate work after core UI and production architecture are more settled:

- define public privacy/legal posture: privacy policy, data-retention notes, cookie/local-storage statement, and clear geolocation/address-use language
- add well-known/public-contact files where appropriate: `/.well-known/security.txt`, `humans.txt`, and project/contact metadata
- add agent/AI-reader affordances if useful: `llms.txt`, concise API/data-source documentation, and machine-readable route/schema notes
- evaluate structured data only where it genuinely helps discovery; avoid adding schema markup that overstates the app's authority or data completeness
- revisit observability and incident-response practices once production usage warrants it

## Current Focus: `v0.3.1` Frontend/Web-Quality Foundation

Goal: build on the `v0.3.0` architecture-transition baseline with a focused frontend/web-quality slice.

Status: `v0.3.0` is the release checkpoint being tagged from `main` after municipal archive materialization, production runtime authentication repair, and the 2026-06-20 health/performance sweep. `v0.3.1` should remain a narrow web-quality/frontend foundation slice rather than a broad data architecture rewrite.

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
- The sidebar now uses four always-visible accordion headers; current opens by default, and opening another sub-panel closes the others.
- Current, planned, previous, and disclosures rows now use compact icon-backed pill layouts with fixed-width count pills so the row language is more consistent.
- Planned sidebar rows now represent individual planned interruption events rather than summing sequential outages for the same area.
- Previous sidebar rows are being split into two explicit modes: no-address `Recent Archive` for province-wide resolved outage history, and address-context `Seen Before Here` for local retained/nearby previous outages.
- No-address `Recent Archive` now shows compact summary windows for the last 24 hours, 7 days, 30 days, and 1 year, using summed affected users for each period, plus the largest archived outage and a 20-row latest-outage sample.
- Address-context `Seen Before Here` now caps the sidebar to the nearest 24 retained previous outages within the fixed search radius, with the local scope shown in the section header.
- Previous grouped client counts should show peak/max clients for a historical area rather than summing clients across separate resolved events.
- Detail panels now overlay the side panel on desktop and mobile; operational detail panels are intentionally minimal when they have no extra information beyond the selected row.
- DAI/disclosure detail panels distinguish regional summary sources from specific FOI/DAI source panels, include Hydro-Québec PDF links where available, and avoid table-style horizontal scrolling in the current local design.
- The first-party frontend has been decomposed from a large `app/static/app.js` into focused native ES modules: `icons.js`, `detail-panels.js`, `search.js`, `side-panel.js`, and `outage-map.js`; `app.js` is now a bootstrap file.
- `app/static/app.css` remains a single stylesheet for now, but it has section comments for shell/header, map, sidebar, detail panels, search results, mobile, desktop, and wide-desktop areas.
- The service worker now caches the new first-party ES modules.
- `v0.2.6` deployed on 2026-06-13 with Worker version `1a9a4c62-e388-404f-ad91-d8a89d8d5c90` and container image `1a9a4c62`.
- Post-deploy production sample: homepage `200` in about 0.87s total, `/healthz` `200` in about 0.20s total, `/static/app.js` `200` in about 0.31s total, `/static/detail-panels.js` `200` in about 0.34s total, and `/service-worker.js` `200` in about 0.24s total.
- Post-deploy privacy checks: public `/collect`, `/cron/hydro`, `/internal/disclosures/export`, `/debug/timing/search`, and `/api/durable/status` returned `404`.
- Post-deploy static check: deployed `/service-worker.js` contains cache marker `pannes-historiques-v0.2.6-static-modules` and lists the new first-party ES modules.
- Public operational hardening is implemented locally: collection and cron routes are hidden by default in Flask, the Worker blocks public `/collect`, `/cron`, `/internal`, and `/debug` paths, and direct durable status now requires an operation token.
- Tailwind CDN replacement is deferred to `0.3.x` frontend/tooling work.
- `v0.2.7` deployed after the municipal archive-bin slice. It added D1 schema `0009_municipal_archive_bins.sql`, `src/municipal-archive.js`, Worker runtime endpoints for territory import/backfill/status, municipal archive summary support, and the maintenance script `scripts/maintenance/municipal-archive-backfill.mjs`.
- `main` includes `c7fe3cb` (`Merge frontend stability summary`), the `9875b1a` municipal archive binner cursor hardening, and the merged frontend stability slice.
- Public production check on 2026-06-17: `/` returned `200` in about 0.86s, `/healthz` returned `200` in about 0.20s, `/service-worker.js` returned `200` in about 0.40s, and `/search-map?q=5220%20Rue%20Jeanne-Mance&lang=en` returned `200` in about 1.53s.
- Production health sweep on 2026-06-20 after `eb14b9d`: public endpoints were healthy (`/` about 0.92s, current layer about 0.30s, archive layer about 0.51s, planned layer about 0.55s, representative search about 0.91s, archive summary about 0.21s); latest Hydro feed versions were `bis=20260620133012` and `aip=20260620133012`; the latest scheduled Hydro run finished `ok` at `2026-06-20T17:37:44Z`; municipal archive backfill state advanced to `bispoly:20260620133012:30`; D1 had 115,756 primary archive bins across 1,030 territories and 141,856 overlap bins.
- The `v0.3.0` service worker advertises `pannes-historiques-v0.3.0-architecture-transition`, confirming production should pick up a fresh app shell after deployment.
- `codex/frontend-stability-summary` implements the 2026-06-17 UI audit recommendations: address-level local stability evidence card, `Seen Before Here` opened by default for address results, local/province scope labels, visible row labels, no current-layer toggle button, explicit Show/Hide layer actions with a Current-header spacer for alignment, operational detail feedback on selected rows/polygons, and the no-letter outage-location favicon/app icon.
- The feature branch verification passed `uv run pytest tests/test_views.py -q`, `node --test tests/side-panel-archive.test.js`, Ruff, djLint, Biome, `git diff --check`, pre-commit hooks at commit time, and local browser checks at desktop, iPad, and iPhone viewports. Full `npx playwright test tests/e2e/search-flow.spec.ts` was blocked in this environment because the sandbox cannot start the Playwright web server and the elevated retry hit the app approval usage limit.
- `v0.2.5` deployed on 2026-05-31 with Worker version `43b7a4dc-bb09-4249-92b8-9ad231ad58ae` and container image `43b7a4dc`.
- Post-deploy production sample: homepage `200` in about 2.8s total, address map `200` in about 3.2s total, planned layer `/map-layer` `200` in about 1.3s total.
- Post-deploy privacy checks: public `/api/durable/status`, `/debug/timing/search`, `/collect`, `/cron/hydro`, and `/internal/disclosures/export` returned `404`; `/healthz` and `/service-worker.js` returned `200`.
- June 2 UI/UX review found the current interface is calmer and coherent, but the default Current sidebar still overwhelms the map, the mobile header/drawer combination squeezes the map, the pill system treats too many fields with equal weight, Disclosures still use a different row language, and section-to-map colour linkage is too implicit.
- Desktop and mobile detail cards are much improved; detail-card placement and mobile detail-as-drawer behavior remain useful follow-up work but can be deferred unless they naturally fit into the next small UI slice.

Scope:

- tag, push, deploy, and smoke-test `v0.3.0` as the architecture-transition baseline
- make `v0.3.1` the first implementation slice after this release, focused on frontend/web-quality foundations unless production observations require a narrower hotfix first
- preserve the 2026-06-20 production baseline: homepage, representative address search, map layers, service worker, archive summary, durable runtime endpoints, container live instance state, D1 growth, and Cloudflare cost drivers
- keep the existing `0.2.x` UX improvements stable while changing architecture; do not combine broad UI redesign with production-read migration
- preserve existing local `NOTES.md` and `output/` artifacts until they are explicitly committed, archived, or cleaned up
- monitor and, if needed, patch the deployed frontend stability slice without starting a bundler migration

Acceptance criteria:

- `v0.3.0` is tagged, pushed, deployed, and smoke-tested before `v0.3.1` work begins
- `v0.3.1` has a single primary objective, explicit non-goals, and production verification steps
- production baseline is preserved before replacing Tailwind/CDN paths or moving user-facing reads off the container
- dirty local research/audit artifacts are intentionally handled before implementation work begins
- deployed frontend stability remains intact at desktop, iPad, and mobile widths: local stability card, local/province scope labels, row labels, Show/Hide layer actions, selected row/polygon feedback, and no zero-size current-layer toggle

Verification so far:

- 2026-06-17 production check for current deployment after container warm-up: `/` `200` in about 3.41s, `/healthz` `200` in about 0.64s, `/service-worker.js` `200` in about 0.34s with cache marker `pannes-historiques-v0.2.7-outage-pin-icon`, and representative `/search-map` `200` in about 0.76s.
- 2026-06-17 feature branch checks for `e25adec`: `uv run pytest tests/test_views.py -q` passed earlier for the local-stability slice, `node --test tests/side-panel-archive.test.js` passed, `uv run pre-commit run --all-files` passed, `uv run djlint app/templates --lint` passed, `npm run format` passed, `npm run check` passed, `git diff --check` passed, commit-time pre-commit hooks passed, and local browser visual checks passed at desktop and mobile widths, including French Show/Hide label fit.
- 2026-06-17 feature branch limitation: `npx playwright test tests/e2e/search-flow.spec.ts` could not complete in this environment because the sandbox cannot start the configured Playwright web server and the elevated retry hit the app approval usage limit.
- `uv run pytest -q`: `80 passed` after private operational route hardening
- `npm run test:e2e`: `26 passed`
- `uv run pre-commit run --all-files`: passed
- `npx biome check src/worker.js`: passed
- `npx wrangler deploy --dry-run`: passed
- `npx wrangler deploy`: deployed Worker `43b7a4dc-bb09-4249-92b8-9ad231ad58ae` and container image `43b7a4dc`
- Production smoke/timing checks: passed, with intermittent local `curl` DNS failures worked around by Python `urllib` checks
- Local browser check confirmed initial search payload contains only `outage`, secondary toggles start off, and planned/previous/published layers load on demand.
- 2026-06-13 frontend decomposition checks: `npm run format`, `npm run check`, browser smoke on `http://127.0.0.1:8005/?lang=en`, and `npm run test:e2e` passed locally.
- 2026-06-13 release checks: `uv run pre-commit run --all-files`, `npx wrangler deploy --dry-run`, `npx wrangler deploy`, production smoke checks, service-worker cache-marker check, and private-route checks passed.

## Next Release Slices

### `v0.2.4`: Panel, Copy, And Accessibility Polish

- scoped for this release: current-feed copy, undocumented status labels, slightly wider desktop side rail, visible summary focus states, and regression coverage
- defer broader mobile sheet redesign, collapse/minimize affordance, and full WCAG audit to later `0.2.x`

### `v0.2.5`: Performance And Production Hygiene

- deployed 2026-05-31: production timing improvements, sidebar opt-in lazy map layers, and private operational/debug endpoint hardening
- tagged `v0.2.5` at `1249acf`

### `v0.2.6`: Sidebar Rhythm, Detail Panels, And Static Frontend Maintainability

- complete for release: compact icon-backed row language for Current, Planned, Previous, and Disclosures
- complete for release: one-open-section accordion behavior with all four section headers visible on desktop and mobile
- complete for release: detail panels that overlay the side panel and avoid repeating selected-row information when no extra detail exists
- complete for release: DAI/disclosure detail panels with PDF links, source grouping, no horizontal scrolling, and clearer distinction between regional summaries and specific FOI/DAI sources
- complete for release: full first-party static JS decomposition into native ES modules without adding a bundler
- complete for release: desktop and mobile browser smoke, automated checks, Wrangler dry-run, production deploy, and production smoke
- deployed 2026-06-13: tagged `v0.2.6` at `9939bb8`; Worker version `1a9a4c62-e388-404f-ad91-d8a89d8d5c90`; container image `1a9a4c62`
- accepted for release: DAI/disclosure detail panels are good enough for `v0.2.6`, with deeper information design deferred
- deferred to `0.3.x`: bundler/build pipeline, no-label/Quebec-label map styling, historical-data API, and deeper Cloudflare static-asset performance conclusions

### `v0.2.7`: Municipal Archive Bins And Previous Archive Polish

- complete for release: D1 schema for `admin_territories`, `previous_outage_territory_bins`, and `municipal_archive_build_state`
- complete for release: Worker runtime endpoints for operational territory import, municipal archive backfill, and municipal archive status
- complete for release: pure geometry helpers for territory assignment, display simplification, centroid/bbox helpers, and bin-row shaping
- complete for release: previous archive summary can prefer municipal/TNO/Indigenous-territory bins when populated while keeping existing resolved-event fallback behavior
- complete for release: service worker marker updated to `pannes-historiques-v0.2.7-versioned-static-network`
- deployed and smoke-checked before the frontend stability slice; the municipal archive binner cursor path was fixed after the tag at `9875b1a`

### `v0.2.8`: Post-Archive Stability Checkpoint

- implemented on `codex/frontend-stability-summary`; the local stability UI landed at `c2054b5`, with the favicon/app-icon replacement and explicit layer action labels committed at `e25adec`
- complete locally: local stability evidence card, local/province scope labels, visible row labels, address-search history-first default, current-toggle cleanup, and detail-panel feedback for operational row/polygon selection
- complete locally: `PH` favicon/app icons replaced with a navy-and-amber outage-location mark; service worker cache marker bumped to `pannes-historiques-v0.2.8-post-archive-stability`
- tagged, pushed, deployed, and smoke-tested as the final `0.2.x` checkpoint on 2026-06-17

## Completed `0.2.x` Summary

`v0.2.0` delivered the map-first shell:

- full-viewport map surface with desktop side panel and mobile bottom sheet
- lazy map-context loading retained so result cards/search feedback can appear before heavy geometry
- runtime map layers can use private, operation-token D1-backed Worker endpoints when `DURABLE_RUNTIME_URL` and `DURABLE_RUNTIME_OPERATION_TOKEN` are configured

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
- split shared frontend helpers into `app/static/ui-format.js` and map styling/rendering helpers into `app/static/map-layers.js`; broader first-party module decomposition was completed in `v0.2.6`
- updated service-worker/static-version handling for the early ES modules

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
- Cloudflare static-asset performance checks: use cold and warm `curl -fsS -w` probes for `/static/app.css`, `/static/app.js`, each first-party ES module, `/static/icons.svg`, `/service-worker.js`, `/static/manifest.webmanifest`, Noto Sans font files, and Leaflet assets; record HTTP status, `cf-cache-status`, `cache-control`, `etag`, `content-encoding`, transfer size, TTFB, and total time; repeat with a cache-busting query and without one; compare browser DevTools waterfalls and Cloudflare Observatory/Lighthouse results before deciding whether a bundler or different asset strategy is justified.
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

- Runtime/ops cleanup: D1 still has one stale `ingestion_runs` record from `2026-06-19T15:37:19Z` marked `running` despite later successful scheduled runs; add a timeout/cleanup path so abandoned runs do not confuse health checks.
- Archive summary correctness: the main municipal archive territory list is grouped, but the "latest" archive summary can repeat the same territory/time when several outage polygons map to the same territory; group these latest rows by territory/time before display.
- D1 growth and query cost: production D1 was about 935 MB on 2026-06-20, and ad hoc full-bin aggregate checks read over 115k rows; monitor growth, consider retention/rollup policy, and keep user-facing archive summaries materialized.
- Runtime host configuration: the trusted container-runtime proxy check currently depends on the Cloudflare worker host `dalaque.workers.dev`; make this configurable before changing the workers.dev subdomain again.
- Search architecture: representative search is fixed and under roughly one second when warm, but it still depends on the container path; keep moving ordinary search/render reads toward Worker/static/D1/R2 paths in `0.3.x`.
- The desktop side panel is more coherent but may still feel dense when detail panels overlay it; the `e25adec` answer-card branch is now deployed, so use production observations before widening the panel again by default.
- Accessibility still needs a dedicated W3C/WCAG pass beyond the current keyboard/focus regression checks; keep this as practical `0.2.x`/`0.3.x` follow-up depending on scope.
- Cloudflare performance work now has two tracks: container/app response-time reduction already shipped in `v0.2.5`, while static asset/module waterfall measurement belongs to upcoming `0.3.x` evaluation before any bundler decision.
- The first-party JS module split improves maintainability, but it increases native module requests; measure this on Cloudflare before assuming either native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and still visually fragile; keep checking for overlapping text, horizontal scrolling, and unreadable dense rows when deploying any frontend follow-up.
- Current CARTO Voyager raster tiles bake city labels into image tiles; hiding only non-Quebec labels requires either no-label raster tiles plus a custom Quebec label overlay or a larger vector-tile/custom-style migration.
- Do not speculate about Hydro-Québec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Do not append long implementation narratives for completed releases.
- Move durable findings, source URLs, command evidence, and longer reasoning to `NOTES.md`.
- Move completed release summaries and implementation checkpoints to `CHANGELOG.md`.
- If this file grows past roughly 300-400 lines again, compact completed sections before adding more plan detail.
