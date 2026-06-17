# Plan: Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-06-17

This file is the active execution plan. Keep durable evidence, source notes, and long historical reasoning in `research.md`; keep completed release and implementation history in `roadmap-history.md`; keep completed detail here only when it affects current decisions.

## Current State

- Current deployed release: `v0.2.7` plus the `codex/frontend-stability-summary` frontend slice is deployed and smoke-tested on `pannes.ca`.
- Current release in progress: none; `v0.3.0` planning is next after reconciling the post-`v0.2.7` deployed frontend and municipal-archive follow-up state on `main`.
- Current frontend slice: `codex/frontend-stability-summary` is pushed to origin, deployed, smoke-tested, and merged into `main`. It adds an address-level local stability answer card, makes local previous-outage evidence the default address-search section, adds row/scope labels, removes the zero-size current-layer toggle, labels optional layer visibility controls as explicit Show/Hide actions, makes map/row selection populate an operational detail panel, and replaces the `PH` favicon/app icon with an outage-location mark.
- Current product shape: map-first address/current-location lookup with server-rendered Flask/Jinja fragments, HTMX, Leaflet, decomposed vanilla JavaScript ES modules, icon-backed sidebar/detail rows, local previous-outage evidence, municipal archive bins, and a Cloudflare Workers + Containers production deployment.
- Production data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Québec payloads, disclosure metadata, and runtime map-context layers.
- Container role: still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible/container fallback paths.
- Important architecture caveat: runtime writes inside the container are ephemeral; durable production state belongs in D1/R2 or another durable store.
- Cost caveat: the June 2026 Cloudflare invoice was driven mostly by Workers Paid baseline plus Durable Object/container runtime costs; D1 and R2 were not material cost drivers on that bill.
- User-facing URL contract: clean root URL with `lang`, `q`, or current-location coordinate parameters; obsolete public `radius_m`, `days`, and `include_planned` parameters were removed from the main interface.
- Debug, collection, cron, internal export/file, and direct durable-status endpoints are private by default; production returns `404` unless the expected debug flag, Worker block, scheduled header, internal header, or operation token is present.
- Current deployed release marker: service worker cache name `pannes-historiques-v0.2.7-outage-pin-icon`; latest public smoke check on 2026-06-17 returned `200` for `/`, `/healthz`, `/service-worker.js`, and a representative `/search-map` request.
- Current deployed code includes the `e25adec` frontend stability-summary branch, including the local-stability answer-card UI, no-letter outage-location favicon/app icon, explicit Show/Hide layer actions, and Current-header alignment spacer.
- Current `main` is past the `v0.2.7` tag: tag `v0.2.7` points at `24b986e`, while `main` includes follow-up municipal archive binning fixes through `9875b1a` plus the merged frontend stability work. Verify whether the combined state needs a final `0.2.x` tag or becomes the `v0.3.0` baseline before starting broad `0.3.x` work.
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
- `v0.2.6`: sidebar rhythm, layer hierarchy, row-language consistency, detail-panel rationalization, and frontend static-module decomposition. Complete.
- `v0.2.7`: municipal/TNO/Indigenous-territory archive-bin schema, Worker runtime endpoints, binning helpers, previous-archive sidebar polish, and service-worker/static marker update. Complete and deployed.
- post-`v0.2.7` frontend branch: local stability answer card and address-result UX follow-up from the 2026-06-17 production audit. Implemented, committed, pushed, deployed, and smoke-tested.

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

- `v0.3.0`: transition preflight. Reconcile `main`/tag/deploy state, decide whether the post-`v0.2.7` municipal archive fixes need a `v0.2.8` tag or can become the first `v0.3.0` baseline, capture production timing/cost baseline, and choose the first architecture target.
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

## Current Focus: `v0.3.0` Transition Preflight

Goal: enter `0.3.x` deliberately by reconciling the current post-`v0.2.7` state, measuring the production baseline, and choosing the first architecture/web-quality target.

Status: `v0.2.7` is tagged, pushed, deployed, smoke-tested, and closed. The post-`v0.2.7` frontend stability slice is committed, pushed, deployed, smoke-tested, and ready to become part of `main`. Do not start broad implementation until the combined `main`/tag/deploy state is reconciled and existing local research/output artifacts are intentionally handled.

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
- `origin/main` is currently `9875b1a` (`Fix municipal archive binner cursor`), which hardens the post-`v0.2.7` binning cursor path.
- Public production check on 2026-06-17: `/` returned `200` in about 0.86s, `/healthz` returned `200` in about 0.20s, `/service-worker.js` returned `200` in about 0.40s, and `/search-map?q=5220%20Rue%20Jeanne-Mance&lang=en` returned `200` in about 1.53s.
- The deployed service worker currently advertises `pannes-historiques-v0.2.7-outage-pin-icon`, confirming production includes the frontend stability-summary branch and new favicon/app-icon assets.
- `codex/frontend-stability-summary` implements the 2026-06-17 UI audit recommendations: address-level local stability evidence card, `Seen Before Here` opened by default for address results, local/province scope labels, visible row labels, no current-layer toggle button, explicit Show/Hide layer actions with a Current-header spacer for alignment, operational detail feedback on selected rows/polygons, and the no-letter outage-location favicon/app icon.
- The feature branch verification passed `uv run pytest tests/test_views.py -q`, `node --test tests/side-panel-archive.test.js`, Ruff, djLint, Biome, `git diff --check`, pre-commit hooks at commit time, and local browser checks at desktop, iPad, and iPhone viewports. Full `npx playwright test tests/e2e/search-flow.spec.ts` was blocked in this environment because the sandbox cannot start the Playwright web server and the elevated retry hit the app approval usage limit.
- `v0.2.5` deployed on 2026-05-31 with Worker version `43b7a4dc-bb09-4249-92b8-9ad231ad58ae` and container image `43b7a4dc`.
- Post-deploy production sample: homepage `200` in about 2.8s total, address map `200` in about 3.2s total, planned layer `/map-layer` `200` in about 1.3s total.
- Post-deploy privacy checks: public `/api/durable/status`, `/debug/timing/search`, `/collect`, `/cron/hydro`, and `/internal/disclosures/export` returned `404`; `/healthz` and `/service-worker.js` returned `200`.
- June 2 UI/UX review found the current interface is calmer and coherent, but the default Current sidebar still overwhelms the map, the mobile header/drawer combination squeezes the map, the pill system treats too many fields with equal weight, Disclosures still use a different row language, and section-to-map colour linkage is too implicit.
- Desktop and mobile detail cards are much improved; detail-card placement and mobile detail-as-drawer behavior remain useful follow-up work but can be deferred unless they naturally fit into the next small UI slice.

Scope:

- verify whether the combined municipal archive and frontend stability state on `main` should become `v0.2.8` or the first `v0.3.0` baseline
- decide whether the first `0.3.x` implementation target is frontend build/web-quality, public-read architecture, or historical-data API design
- capture a production baseline before architecture changes: homepage, representative address search, static module waterfall, service worker, durable runtime endpoints, container live instance state, and Cloudflare cost drivers
- keep the existing `0.2.x` UX improvements stable while changing architecture; do not combine broad UI redesign with production-read migration
- preserve existing local `research.md` and `output/` artifacts until they are explicitly committed, archived, or cleaned up
- monitor and, if needed, patch the deployed frontend stability slice without starting a bundler migration

Acceptance criteria:

- plan identifies whether `v0.2.8` is needed before `v0.3.0`
- first `v0.3.x` slice has a single primary objective, explicit non-goals, and production verification steps
- production baseline is recorded before replacing Tailwind/CDN paths or moving user-facing reads off the container
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
- deployed and smoke-checked before the current frontend feature branch; `origin/main` is now `9875b1a`, which fixes the municipal archive binner cursor path after the tag

### Post-`v0.2.7`: Local Stability Answer Branch

- implemented on `codex/frontend-stability-summary`; the local stability UI landed at `c2054b5`, with the favicon/app-icon replacement and explicit layer action labels committed at `e25adec`
- complete locally: local stability evidence card, local/province scope labels, visible row labels, address-search history-first default, current-toggle cleanup, and detail-panel feedback for operational row/polygon selection
- complete locally: `PH` favicon/app icons replaced with a navy-and-amber outage-location mark; service worker cache marker bumped to `pannes-historiques-v0.2.7-outage-pin-icon`
- deployed 2026-06-17: service worker marker `pannes-historiques-v0.2.7-outage-pin-icon`; post-deploy smoke checks returned `200` for `/`, `/healthz`, `/service-worker.js`, and representative `/search-map`

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
- Move durable findings, source URLs, command evidence, and longer reasoning to `research.md`.
- Move completed release summaries and implementation checkpoints to `roadmap-history.md`.
- If this file grows past roughly 300-400 lines again, compact completed sections before adding more plan detail.
