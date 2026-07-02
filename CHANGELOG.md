# Changelog

All notable completed release and implementation history for the Hydro-Quebec Outage History App is recorded here.

Keep active execution state in `PLANS.md` and source/evidence research in `NOTES.md`.

## [Unreleased]

## [v0.3.1] - 2026-07-02

### Added

- Added canonical URL, description, Open Graph, and Twitter summary metadata for the map and About pages.
- Added public `robots.txt` and `sitemap.xml` routes for discovery.
- Added risk-based parser coverage for Hydro KML payloads, access-disclosure discovery, PDF outage rows, and regional disclosure metrics.

### Changed

- Bumped package metadata to `0.3.1`.
- Replaced the Tailwind CDN script with local CSS coverage for the utility classes currently used by the templates.
- Added version-aware static asset cache headers: immutable for `?v=` assets and short-lived caching for unversioned static assets.
- Updated the service-worker marker to `pannes-historiques-v0.3.1-web-quality-foundation`.
- Refined operational and archive map-focus behavior so current/planned/previous rows recenter and highlight the map without opening the DAI detail panel.
- Made latest archive summary rows compact, focusable map rows and removed the older summary-window/largest rows from the default archive summary display.

### Fixed

- Added geometry keys for operational map items so rows sharing one geometry highlight together.

### Verified

- Local release verification passed `uv run pytest -q`, `node --test tests/*.test.js`, `uv run pre-commit run --all-files`, `npx playwright test tests/e2e/search-flow.spec.ts --config=playwright.config.ts`, and `npx wrangler deploy --dry-run`.
- Deployed `v0.3.1` to production on 2026-07-02 with Worker version `6c95e2bf-9f6a-4bb1-a32a-74fb5526d8fa` and container image `pannes-historiques-pannescontainer:6c95e2bf`.
- Post-deploy smoke checks returned `200` for `/healthz`, `/`, `/service-worker.js`, `/robots.txt`, `/sitemap.xml`, representative `/search-map`, `/api/durable/hydro`, and current/planned/previous/published `/map-layer` routes.

## [v0.3.0] - 2026-06-20

### Added

- Architecture-transition baseline after `v0.2.8`.
- Municipal archive summary materialization.
- Container runtime authentication repair.
- Production timing, cost, and data-health evidence capture.
- Operational follow-up notes for D1 growth, stale ingestion runs, archive summary grouping, and public-read/container cost work.

### Verified

- Public endpoints returned `200` for `/`, `/search-map`, current/archive/planned map layers, archive summary, and Hydro data endpoints.
- Service-worker marker: `pannes-historiques-v0.3.0-architecture-transition`.

## [v0.2.8]

### Added

- Final `0.2.x` checkpoint bundling post-`v0.2.7` municipal archive cursor hardening, the frontend stability slice, production UI audit artifacts, and docs synchronization.
- Package metadata and service-worker marker `pannes-historiques-v0.2.8-post-archive-stability`.

### Notes

- Intended as the stable baseline before `v0.3.0` production measurement and architecture/web-quality planning.

## [v0.2.7] - 2026-06-17

### Added

- Municipal/TNO/Indigenous-territory archive-bin slice.
- D1 tables for `admin_territories`, `previous_outage_territory_bins`, and `municipal_archive_build_state`.
- Pure JavaScript geometry helpers for territory bounding boxes, centroids, point containment, simplification, and outage-polygon-to-territory assignment.
- Worker runtime endpoints for operational territory import, municipal archive backfill, and municipal archive status.
- `scripts/maintenance/municipal-archive-backfill.mjs` for resumable archive binning.

### Changed

- Refined the previous-outage archive sidebar so the no-address state reads as a recent archive and address-context results read as local historical evidence.
- Updated previous archive summaries and map-layer shaping so production can prefer D1-backed municipal/TNO/Indigenous-territory bins when populated, while retaining resolved-event fallbacks.
- Updated the service-worker marker to `pannes-historiques-v0.2.7-versioned-static-network`.

### Fixed

- Fixed durable previous archive summary behavior.
- Fixed the municipal archive binner cursor path at `9875b1a`.

### Verified

- Tagged at commit `24b986e`.
- Public smoke check on 2026-06-17 returned `200` for `/`, `/healthz`, `/service-worker.js`, and representative `/search-map`.
- Production later received the `e25adec` frontend stability-summary branch on 2026-06-17.

## [v0.2.6] - 2026-06-13

### Added

- Four always-visible accordion headers with one expanded sub-panel at a time on desktop and mobile.
- Compact icon-backed pill layouts with stable count columns and subtle map-layer colour linkage for Current, Planned, Previous, and Disclosures rows.
- Focused native ES modules for icons, detail panels, search, side panel, and map orchestration.

### Changed

- Planned sidebar rows now represent individual planned interruption events instead of summed sequential outages for one area.
- Removed redundant operational detail panels when selected Current, Planned, or Previous rows have no extra information beyond the row itself.
- Reworked DAI/disclosure detail panels to distinguish regional summaries from specific FOI/DAI source panels, include Hydro-Quebec PDF links where available, avoid horizontal scrolling, and use card-style source/event rows.
- Updated service-worker caching for the expanded first-party static module set.

### Verified

- Deployed at commit `9939bb8`.
- Worker version `1a9a4c62-e388-404f-ad91-d8a89d8d5c90`; container image `1a9a4c62`.

## [v0.2.5]

### Added

- Production timing and deployment hygiene checks for the Cloudflare Workers + Containers path.
- Production smoke checks for homepage/search/static assets, service worker, health, private-route behaviour, and container image/version verification.

### Changed

- Reduced default/search map payload cost by lazy-loading secondary planned, previous, disclosure, and regional context layers.
- Capped previous-outage context in default/search map responses to keep cold payloads bounded.

### Fixed

- Hardened public operational routes so collection, cron, internal, debug, export/file, and direct durable-status paths are private by default.

## [v0.2.4]

### Changed

- Renamed the current outage section to describe rows as current Hydro-Quebec feed data rather than newly started outages.
- Labelled undocumented Hydro-Quebec status codes explicitly instead of showing bare raw codes such as `N`.
- Gave the desktop side rail slightly more room and added visible focus treatment for collapsible section summaries.

### Added

- Regression coverage for current-feed copy, summary ARIA labels, and keyboard focus state.

## [v0.2.3]

### Added

- Production-shaped browser regression coverage for representative map layers.

### Changed

- Tuned current, planned, previous, disclosure, and regional map-layer hierarchy.
- Removed the floating map legend and kept layer explanation in the side rail headings/counts.
- Made the detail panel hidden by default so it cannot render as an empty overlay over the map.
- Served Leaflet from local static assets and cached it in the service worker to avoid CDN/offline/PWA map initialization failures.

## [v0.2.2]

### Added

- PWA/installability basics: manifest, icons, mobile app metadata, service worker, and offline fallback.
- Reloadable/shareable address and current-location URL state.

### Changed

- Removed obsolete public `radius_m`, `days`, and `include_planned` query controls from the primary URL contract.
- Improved mobile sheet layout and mobile detail overlay behaviour.
- Split frontend helpers into `app/static/ui-format.js` and map styling/rendering helpers into `app/static/map-layers.js`.
- Updated service-worker/static-version handling for the new ES modules.

### Fixed

- Fixed the Cloudflare container deploy configuration so the deployed container image is built from the repo `Dockerfile` instead of staying pinned to an old registry image.

## [v0.2.1]

### Changed

- Improved result/detail interaction.
- Strengthened persistent selected-row state after row clicks, keyboard activation, and map-feature selection.
- Reduced duplicate searched-place summary information.

### Fixed

- Fixed stacked map-context result sections in the side panel.

### Added

- Browser coverage for selected-row behaviour.

## [v0.2.0]

### Added

- Map-first responsive shell.
- Desktop side-panel and mobile bottom-sheet layouts.
- Lazy map-context loading so cards/search feedback can render before heavier geometry.
- Production current/planned/previous map context connected to D1-backed Worker runtime endpoints where durable URLs are configured.

## [v0.1.4]

### Added

- Browser-regression setup for the then-current UI.
- Operational/docs cleanup.
- Verified Hydro status-code decoding for known codes.
- Small UI consistency fixes.

### Changed

- Hardened Nominatim geocoding and autocomplete behaviour.

## [v0.1.3]

### Added

- Formal `pytest` test baseline.
- Deterministic service/geocoding tests.
- Route smoke coverage.

## Implementation Checkpoints

### Status-Code Decoding

- Hydro-Quebec open-data documentation verifies status codes `A`, `L`, and `R`.
- The app decodes those codes in `app/views.py` and `app/i18n.py`.
- Unknown codes such as `N` are intentionally labelled as undocumented source codes until source evidence verifies their meaning.

### Disclosure Ingestion

- The prototype ingests several published access-to-information extracts:
  - `DAI-2022-0386` Cote Saint-Luc XLSX
  - `DAI-2025-0275` Outremont PDF
  - `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF
  - `DAI-2025-0333` Saint-Felix-de-Kingsey PDF
- Disclosure records are stored separately from live Info-pannes API records.
- DAI areas render as broad historical context behind more granular live/API outage layers.

### Durable Production Data Path

- Production uses Cloudflare Workers + Containers, D1, and R2.
- D1 stores normalized feed versions, current outage rows, planned-interruption rows, resolved previous events, disclosure mirror metadata, runtime geocode/address/query state, and map-context metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information files.
- The container still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible fallback paths.
- Runtime container writes are ephemeral and should not be treated as durable production storage.

### Hydro Cron And D1/R2 Handoff

- The 30-minute Worker cron checks Hydro feed versions and coordinates changed-feed ingestion.
- Direct Worker-origin fetches to Hydro produced HTTP 406 in May 2026, while container-origin fetches worked.
- The production handoff uses the container to fetch/parse Hydro payloads and the Worker to archive raw bytes in R2 and mirror normalized rows into D1.
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

- The frontend stability slice, originally developed on `codex/frontend-stability-summary` and later merged to `main` at `c7fe3cb`, implements and deploys the 2026-06-17 UI/UX audit follow-up.
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
- Production checks should include `/healthz`, a representative search, private durable status through an authorized check, static app assets, service worker, and container status/image when relevant.
