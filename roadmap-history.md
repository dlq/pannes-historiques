# Roadmap History: Hydro-Québec Outage History App

Date: 2026-05-30

This file records completed release and implementation history. Keep active execution state in `plan.md` and source/evidence research in `research.md`.

## Release History

### `v0.1.3`

- Established the formal `pytest` test baseline.
- Added deterministic service/geocoding tests.
- Added route smoke coverage.

### `v0.1.4`

- Added browser-regression setup for the then-current UI.
- Hardened Nominatim geocoding and autocomplete behaviour.
- Added operational/docs cleanup.
- Added verified Hydro status-code decoding for known codes.
- Added small UI consistency fixes.

### `v0.2.0`

- Delivered the map-first responsive shell.
- Added desktop side-panel and mobile bottom-sheet layouts.
- Preserved lazy map-context loading so cards/search feedback can render before heavier geometry.
- Connected production current/planned/previous map context to D1-backed Worker runtime endpoints where durable URLs are configured.

### `v0.2.1`

- Improved result/detail interaction.
- Strengthened persistent selected-row state after row clicks, keyboard activation, and map-feature selection.
- Reduced duplicate searched-place summary information.
- Fixed stacked map-context result sections in the side panel.
- Added browser coverage for selected-row behaviour.

### `v0.2.2`

- Added PWA/installability basics: manifest, icons, mobile app metadata, service worker, and offline fallback.
- Made address and current-location URL state reloadable/shareable.
- Removed obsolete public `radius_m`, `days`, and `include_planned` query controls from the primary URL contract.
- Improved mobile sheet layout and mobile detail overlay behaviour.
- Split frontend helpers into `app/static/ui-format.js` and map styling/rendering helpers into `app/static/map-layers.js`.
- Updated service-worker/static-version handling for the new ES modules.
- Fixed the Cloudflare container deploy configuration so the deployed container image is built from the repo `Dockerfile` instead of staying pinned to an old registry image.

### `v0.2.3`

- Tuned current, planned, previous, disclosure, and regional map-layer hierarchy.
- Removed the floating map legend and kept layer explanation in the side rail headings/counts.
- Made the detail panel hidden by default so it cannot render as an empty overlay over the map.
- Served Leaflet from local static assets and cached it in the service worker to avoid CDN/offline/PWA map initialization failures.
- Added production-shaped browser regression coverage for the representative map layers.

### `v0.2.4`

- Renamed the current outage section to describe rows as current Hydro-Quebec feed data rather than newly started outages.
- Labelled undocumented Hydro-Quebec status codes explicitly instead of showing bare raw codes such as `N`.
- Gave the desktop side rail slightly more room and added visible focus treatment for collapsible section summaries.
- Added regression coverage for the current-feed copy, summary ARIA labels, and keyboard focus state.

### `v0.2.5`

- Added production timing and deployment hygiene checks for the Cloudflare Workers + Containers path.
- Reduced default/search map payload cost by lazy-loading secondary planned, previous, disclosure, and regional context layers.
- Capped previous-outage context in default/search map responses to keep cold payloads bounded.
- Hardened public operational routes so collection, cron, internal, debug, export/file, and direct durable-status paths are private by default.
- Added production smoke checks for homepage/search/static assets, service worker, health, private-route behaviour, and container image/version verification.

### `v0.2.6`

- Deployed 2026-06-13 at commit `9939bb8` with Worker version `1a9a4c62-e388-404f-ad91-d8a89d8d5c90` and container image `1a9a4c62`.
- Refined the sidebar into four always-visible accordion headers with one expanded sub-panel at a time on desktop and mobile.
- Normalized Current, Planned, Previous, and Disclosures rows around compact icon-backed pill layouts with stable count columns and subtle map-layer colour linkage.
- Changed planned sidebar rows to represent individual planned interruption events instead of summed sequential outages for one area.
- Removed redundant operational detail panels when selected Current, Planned, or Previous rows have no extra information beyond the row itself.
- Reworked DAI/disclosure detail panels to distinguish regional summaries from specific FOI/DAI source panels, include Hydro-Québec PDF links where available, avoid horizontal scrolling, and use card-style source/event rows.
- Decomposed first-party static JavaScript from the large bootstrap file into focused native ES modules for icons, detail panels, search, side panel, and map orchestration without adding a bundler.
- Updated service-worker caching for the expanded first-party static module set.

### `v0.2.7`

- Deployed the municipal archive-bin slice and updated the service-worker marker to `pannes-historiques-v0.2.7-versioned-static-network`.
- Added D1 tables for `admin_territories`, `previous_outage_territory_bins`, and `municipal_archive_build_state`.
- Added pure JavaScript geometry helpers for territory bboxes, centroids, point containment, simplification, and outage-polygon-to-territory assignment.
- Added Worker runtime endpoints for operational territory import, municipal archive backfill, and municipal archive status.
- Updated previous archive summaries and map-layer shaping so production can prefer D1-backed municipal/TNO/Indigenous-territory bins when populated, while retaining resolved-event fallbacks.
- Added `scripts/maintenance/municipal-archive-backfill.mjs` for resumable archive binning and later fixed the binner cursor path on `origin/main` at `9875b1a`.
- Public smoke check on 2026-06-17 returned `200` for `/`, `/healthz`, `/service-worker.js`, and representative `/search-map`; production later received the `e25adec` frontend stability-summary branch on 2026-06-17.

## Implementation Checkpoints

### Status-Code Decoding

- Hydro-Québec open-data documentation verifies status codes `A`, `L`, and `R`.
- The app decodes those codes in `app/views.py` and `app/i18n.py`.
- Unknown codes such as `N` are intentionally labelled as undocumented source codes until source evidence verifies their meaning.

### Disclosure Ingestion

- The prototype ingests several published access-to-information extracts:
  - `DAI-2022-0386` Côte Saint-Luc XLSX
  - `DAI-2025-0275` Outremont PDF
  - `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF
  - `DAI-2025-0333` Saint-Félix-de-Kingsey PDF
- Disclosure records are stored separately from live Info-pannes API records.
- DAI areas render as broad historical context behind more granular live/API outage layers.

### Durable Production Data Path

- Production uses Cloudflare Workers + Containers, D1, and R2.
- D1 stores normalized feed versions, current outage rows, planned-interruption rows, resolved previous events, disclosure mirror metadata, runtime geocode/address/query state, and map-context metadata.
- R2 stores raw Hydro-Québec feed payloads and raw DAI/access-to-information files.
- The container still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible fallback paths.
- Runtime container writes are ephemeral and should not be treated as durable production storage.

### Hydro Cron And D1/R2 Handoff

- The 30-minute Worker cron checks Hydro feed versions and coordinates changed-feed ingestion.
- Direct Worker-origin fetches to Hydro produced HTTP 406 in May 2026, while container-origin fetches worked.
- The production handoff therefore uses the container to fetch/parse Hydro payloads and the Worker to archive raw bytes in R2 and mirror normalized rows into D1.
- Hydro polygon KMZ payloads are parsed into D1 `hydro_polygon_geometries` for runtime map-layer attachment.

### Disclosure Mirror Handoff

- The container remains the parser/workspace for disclosure sources.
- Worker-side disclosure jobs mirror parsed disclosure sources, events, annual metrics, and geometry metadata into D1.
- Raw DAI source files are archived in R2.
- Large GeoJSON geometry blobs are not mirrored into D1; D1 stores metadata such as centroid and bounding boxes.
- May 2026 catch-up completed with all 32 known disclosure sources archived and parsed.

### Runtime Map-Layer Fix

- A May 2026 production deployment exposed two map-context regressions:
  - previous-outage context was empty on the default page
  - current/planned sections rendered centroid markers instead of polygons
- The fix added Worker runtime endpoints for operational and previous map layers.
- Flask now prefers those runtime endpoints when `DURABLE_RUNTIME_URL` is configured, then falls back to older durable/local paths.
- Deployment verification should prime `/healthz` and then verify page/map payload geometry counts because a new Cloudflare container can briefly report that it is not running.

### Post-`v0.2.7` Frontend Stability Summary

- Branch `codex/frontend-stability-summary` implements and deploys the 2026-06-17 UI/UX audit follow-up.
- The branch adds an address-level local stability evidence card, defaults address searches to the `Seen Before Here` section, adds local/province scope labels, adds visible row labels, removes the zero-size current-layer toggle, labels optional layer controls as explicit Show/Hide actions, aligns Current header controls with the other subpanels, replaces the `PH` favicon/app icons with an outage-location mark, and lets operational row/polygon selections populate a readable detail panel.
- Verification passed focused Python/JS tests, Ruff, djLint, Biome, commit-time pre-commit hooks, local browser checks at desktop, iPad, and iPhone sizes for the original slice, and desktop/mobile browser checks for the final Show/Hide and favicon refinements.
- Deployment on 2026-06-17 produced a new Cloudflare Worker/container version; post-deploy smoke checks returned `200` for `/`, `/healthz`, `/service-worker.js`, and representative `/search-map`, and the deployed service worker advertises `pannes-historiques-v0.2.7-outage-pin-icon`.
- Full Playwright search-flow verification was not completed in the Codex sandbox because the configured web server could not start without elevated execution, and the elevated retry hit the app approval usage limit.

### Production Performance Optimizations

- Early production search profiling found the largest costs in regional/disclosure map context, archived-outage matching, current matching, and large embedded map payloads.
- Removing global regional/disclosure layers from per-address search responses, short-circuiting far-away geometry matching, and lazy-loading context reduced response size and latency materially.
- Moving current and previous nearby matching to D1 reduced app-side query cost.
- Trimming disclosure popup data and using centroid markers for previous outages reduced `/search-map` payload size substantially.

### Post-`v0.2.2` Structural Cleanup

- Removed stale Worker direct-Hydro ingestion helpers after verifying their branch was superseded by the container-fetch/D1-R2 handoff.
- Removed obsolete address-level disclosure match/metric result fields after disclosure context became map-layer based.
- Gated `/debug/timing/search` behind `ENABLE_DEBUG_ROUTES=1`; production now returns `404` for that route by default.
- Fixed `OutageMap` `ResizeObserver` cleanup for HTMX/custom-element reconnects.
- Updated disclosure source metadata so parsed PDF sources no longer claim row extraction is pending.
- Removed merged remote Codex branches after confirming their tips were contained in `main`.

## Deployment Lessons

- Do not consider a deploy complete just because Wrangler reports a new Worker version.
- Verify that the Cloudflare container image/version actually changed after deploys touching container code.
- A stale container image can continue serving old app code even when D1/R2 data is current.
- Production checks should include `/healthz`, a representative search, `/api/durable/status`, static app assets, service worker, and container status/image when relevant.
