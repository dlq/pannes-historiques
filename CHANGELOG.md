# Changelog

All notable completed release and implementation history for the Hydro-Quebec Outage History App is recorded here.

Keep active execution state in `PLANS.md` and source/evidence research in `NOTES.md`.

## [Unreleased]

## [v0.4.4] - 2026-07-17

### Added

- Added combined Python line/branch coverage reporting with a 61.9% non-regression floor in GitHub Quality, a full desktop/mobile browser-regression workflow after changes reach `main` or on manual dispatch, and a contributor issue map for bounded test work.
- Added direct coverage for Hydro collection/orchestration, disclosure XLSX/discovery parsing, and service scheduling/cache paths, lifting each risk-prone module to at least 60% combined coverage.

### Fixed

- Kept E2E search fixtures aligned with the requested radius and stopped empty radius values from being serialized as `radius_m=0` in browser URLs.
- Rejected malformed Hydro coordinate/KML records without aborting feed ingestion and normalized empty version payload failures as parser errors.

### Changed

- Replaced private Flask-to-service access with named service methods, centralized browser map/sheet event state, and extracted durable Worker reads into a directly tested module.

## [v0.4.3] - 2026-07-17

### Added

- Added contributor foundations: an MIT license, code of conduct, security reporting policy, contribution guide, issue forms, pull-request template, and GitHub Quality workflow.
- GitHub Quality now runs pre-commit, pytest, and Node unit tests for pull requests and pushes to `main`.
- Added regression coverage for durable-runtime behavior, Worker/container proxy boundaries, sheet dialog accessibility, archive-map focus, and default map framing.

### Changed

- Replaced Flask route use of private map-context builders with a small public `AppService` interface, centralized browser map/sheet event names and pending map focus state, and extracted Worker durable-read handlers into a directly tested module.
- Added a top-level contributor entry point and refreshed architecture, code-map, setup, deployment-snapshot, and active-plan documentation to match the current runtime and release direction.
- Applied a behavior-preserving simplification/dedup pass (adversarially reviewed) across the server and client: shared helpers for the empty/error `SearchResult` shape, outage-group finalize tail, and row display keys in `services.py`; merged the duplicate geometry-asset loaders and centroid/distance predicates in `views.py`; single-sourced the month/weekday lang-fallback lookups in `sheet_views.py`; deduped `db.py` migrate SQL, `geocoding.py` row mapping, and `web.py` route/scope helpers; and removed dead constants, duplicated DOM/address/detail logic, and redundant branches across the static JS modules. Net −100 lines, no behavior change.
- Deduped the `disclosure_outage_events` INSERT (shared `_DISCLOSURE_EVENT_INSERT` constant across xlsx/pdf ingest) and the regional-metric province/administrative-region base fields (`_regional_metric_base`), preserving stored key order.
- Removed one-off live UI-audit artifacts from version control; generated audit and test evidence now belongs under ignored `tmp/` paths.
- Kept public documentation, contributor guidance, architecture notes, and the active roadmap aligned with the current public-beta state and community feedback.

### Fixed

- Archived-outage rows now retain their territory identity and focus the map on a valid Quebec location; the initial map view uses a stable southern-Quebec overview rather than following a remote live outage.
- Improved sheet accessibility with stronger secondary-text contrast, reduced-motion handling, live update announcements, dialog labeling, focus trapping, Escape handling, and focus restoration.
- Refreshed the service-worker cache namespace so returning clients replace stale pre-MapLibre/Leaflet app shells on their next visit.
- Made `/sheet` failures diagnosable and recoverable: exception logs now carry request context, and the route returns a localized retry fragment instead of a raw `500`.
- Added no-store Leaflet compatibility tombstones that unregister stale service workers and reload once, a `/favicon.ico` alias, and Worker-edge filtering for common scanner probes.
- Kept address results available when durable address persistence is temporarily unavailable; only persistence-dependent history is omitted.

### Verified

- Current local baseline: 159 Python tests and 41 Node unit tests pass; Playwright lists 48 desktop/mobile cases.
- Deployed the service-worker cache refresh on 2026-07-11 as Worker version `395dd418-e47b-443e-a60c-ecc8c0305b51`; live `/`, `/healthz`, and `/service-worker.js` checks returned `200` and the new cache marker was present.
- On 2026-07-17, deployed the v0.4.3 navigation cleanup as Worker version `9ddad2ec-ea03-4b4a-80d2-7bee40ddfa92` with container image `pannes-historiques-pannescontainer:9ddad2ec`. Homepage and `/sheet` probes returned `200`; favicon and stale-Leaflet compatibility routes returned the expected responses; and a WordPress scanner probe was blocked with a Worker-edge `404`.
- The v0.4.3 release commit passed pre-commit, 159 Python tests, 41 Node tests, Biome checks, and a Wrangler dry-run. It deployed on 2026-07-17 as Worker version `fd05d96f-4dc6-4c24-82b2-08571f390165` with container image `pannes-historiques-pannescontainer:fd05d96f`; public homepage, health, Archive sheet, and service-worker probes returned `200` with the `pannes-historiques-v0.4.3-cost-containment` cache marker.

## [v0.4.2] - 2026-07-10

### Added

- Added a hidden app-level heading for the sheet/map interface so the main application screen has a stable accessible page title.
- Added standing tests for the UI-audit follow-ups: hidden app heading, concise autocomplete accessible names, comparison-tray guidance, local-scope preservation from address overview links, plain context source labels, and English customer/status wording.
- Added a bilingual privacy/data-handling section covering Nominatim geocoding and caches, browser-location coordinates, URL persistence, comparison local storage, static service-worker caching, infrastructure logs, cookies/trackers, retention, and contact. The provenance panel links directly to it.
- Added a French `r/quebec` beta-announcement draft with explicit archive and non-affiliation caveats.
- Added Worker-routing coverage for obvious WordPress, PHP, secret-file, CGI, and PHPUnit scanner probes.
- Added deterministic tests for Hydro version payload variants and changed-feed decisions, plus disclosure boundary stitching, fallback geometry, and attachment content types.

### Changed

- Updated `PLANS.md` so the active roadmap starts from `v0.4.2` public beta readiness instead of a broad unsorted `0.4.x` bucket.
- Split `0.4.x` into concrete slices: `v0.4.2` public beta readiness, `v0.4.3` runtime cost/public-read migration, `v0.4.4` archive health/D1 growth control, `v0.4.5` machine-readable public surface, and `v0.4.6` analytical/saved-area feasibility.
- Added a concrete `0.5.x` train: `v0.5.0` historical data API contract, `v0.5.1` saved areas and notification pilot, `v0.5.2` regional analytics and research views, and `v0.5.3` source expansion and geocoder reliability.
- Added an explicit `Beyond 0.5.x` parking lot; there is no concrete post-`0.5.x` release train yet.
- Replaced stale completed-release narrative in `PLANS.md` with compact completed-train summaries and moved active risks/test strategy onto the new release slices.
- Improved UI wording from the live-site review: English count labels now say "customers", status `R` now reads "Crew on the way", context rows show plain source types, and autocomplete suggestions avoid duplicated accessible names.
- Added a comparison-tray hint explaining the next comparison step and increased the hero info button touch target.
- Kept address overview domain links local by default and bumped static/service-worker cache markers for the UI-audit branch.
- Clarified the visible archive, About, and provenance copy: pannes.ca retains only successfully collected observations, gaps and source anomalies are possible, nearby evidence is not proof for an exact address, and the project is neither official nor affiliated with Hydro-Québec.
- Prepared package version `0.4.2`, service-worker marker `pannes-historiques-v0.4.2-beta-readiness`, and one consistent `20260710a` browser-module token.
- Removed one-off live-audit screenshots from tracked source, standardized temporary test/audit evidence under ignored `tmp/`, and kept the future `r/quebec` working draft local rather than as repository documentation.
- Synchronized the README, architecture, contributor guidance, user stories, roadmap, and test-coverage notes with the deployed `v0.4.2` interface and the first `r/HydroQuebec` beta post.

### Fixed

- Preserved a user's selected `5 km` or `Quebec` scope while switching Current, Planned, Archive, and Context segments; overview doorways still opt into the intended local/province scope explicitly.
- Blocked common scanner probes at the Worker edge instead of waking the Flask container for an application-generated `404`.

### Verified

- UI-audit implementation branch verification before merge: full Python suite, Node static tests, Ruff, djlint, Biome, pre-commit, and desktop/mobile browser QA passed.
- Merged UI-audit result on `main` passed `uv run pytest` (135), `node --test tests/*.test.js` (31), and `uv run pre-commit run --all-files`.
- Roadmap cleanup verification: `git diff --check` passed for `PLANS.md`.
- `v0.4.2` candidate verification passed `uv run pytest -q` (135), `node --test tests/*.test.js` (32), the complete desktop/mobile Playwright suite (46), and `uv run pre-commit run --all-files`.
- `npx wrangler deploy --dry-run` built the `0.4.2` container image and Worker bundle successfully without deploying.
- Production probes on 2026-07-10 returned `200` for public homepage, health, About, service-worker, Archive, and representative Montreal, Quebec City, Saguenay, and Val-d'Or overview routes. Private/debug/collection/runtime routes returned `404`, and no Worker error events appeared during the live tail window.
- GitHub Quality run `29104581707` passed on the release commit.
- Deployed to production with Worker version `da3a0c51-d973-49b9-a9c0-9a2b819dd7e6` and container image `pannes-historiques-pannescontainer:da3a0c51`; the container rollout reported one healthy instance and no errors.
- Post-deploy checks returned `200` for health, homepage, About/privacy, exact service-worker path, and a representative Montreal overview. The overview took `9.36 s` on the fresh container and `1.90 s` warm; browser rendering showed the new caveat and scope behavior with no console errors. Private-status, `.env`, WordPress, and PHP probes returned 9-byte Worker-edge `404` responses.
- Production still showed cold/warm search latency and one stale timestamp supplied by Hydro's current feed; both are recorded in `NOTES.md`. Earlier unclassified `500` analytics moved to `v0.4.3` monitoring after direct probes and a live error tail stayed clean. A logged-in `r/quebec` review confirmed that its anti-spam rule permits original material, but posting remains blocked until the account builds enough community comment karma from its current `0`; Reddit does not disclose the threshold.
- Follow-up UI fixes keep latest archived-outage selections in their matching Quebec territory instead of coercing missing coordinates to null island, show the territory in archive rows/details, and use a stable southern-Quebec homepage overview so one remote live outage cannot pull the default camera off-centre.
- Follow-up verification passed `uv run pytest -q` (138), `node --test tests/*.test.js` (34), all pre-commit hooks, the new archive/default-framing Playwright coverage on desktop and mobile, and a Wrangler dry-run build. Two pre-existing mobile detail-close tests failed only in the six-worker run and passed together immediately in isolation.
- Deployed the follow-up from merge commit `3ecb01a` as Worker version `b2e79756-ce7c-4293-b7ec-28d3b6550b6b` with container image `pannes-historiques-pannescontainer:b2e79756`. The first registry push hit a transient TLS `bad record MAC`; the retry reused accepted layers and completed successfully.
- The container reached `ready` with one live instance. The first health probe during rollout returned `500`; after 10 seconds health returned `200` following an `8.73 s` cold start and the homepage returned `200` in `1.62 s`. The exact service-worker path served `pannes-historiques-v0.4.2-map-framing-fix`, the homepage carried the stable overview bounds, and Archive rows carried municipality labels and centroids.
- Rendered production QA showed the southern-Quebec overview centred in the visible map area and a latest Saint-Mathieu-du-Parc archive row opening the correctly labelled detail over its inland map location.
- The test follow-up passed 147 Python tests and raised measured combined line/branch coverage from 58% to 61%; `hydro.py` rose from 30% to 39% and `disclosures.py` from 34% to 41%.

## [v0.4.1] - 2026-07-08

### Changed

- Pluralized every count-bearing UI string (dropped the literal `(s)`): a shared `(s)`-marker resolver in `t()` fixes singular/plural at `count == 1` across both languages, including the strings a follow-up review flagged (`local_reliability_summary_body`, `history_view_all`, `archive_latest_note`).
- Localized decimals for French: distances and durations now use a comma separator (`1,5 km`, `≈ 5,8 h`) on both the server and the client, while English keeps the period.
- Unified the month abbreviation so client-rendered dates match the server (`juil`, not `juill`); replaced the client `Intl` month formatting with the shared `MONTHS_SHORT` table.
- Labelled address-scoped Current/Planned summaries `à moins de N km` instead of `au Québec`, since the counts are local.
- Dropped planned interruptions whose scheduled window has already ended, so the Planned list leads with upcoming work instead of weeks-old notices.
- Domain-tinted the selected sheet row (red/amber/violet/teal) instead of always violet; faded the address radius fill so street detail stays legible; clamped the province-wide boot view to a Québec envelope.
- Let the desktop floating panel hug its content height instead of always filling the viewport.

### Fixed

- Suppressed the misleading Hydro-code territory names ("Secteur 1000") that appeared on the Archive tab during a container cold start: when the durable D1 archive summary is unavailable, the local fallback now omits the code-named territory breakdown and the degraded result is not cached, so the next request recovers the real municipality names and fresh windows from D1.
- Silenced MapLibre `styleimagemissing` console warnings from the Liberty style.

### Accessibility

- Enlarged the segmented control, scope, and round buttons toward comfortable touch targets and added `:focus-visible` outlines to every sheet control.

### Verified

- `uv run pytest -q`: 132 passed, including new regression tests for pluralization, the French decimal separator, planned staleness, the address-scope label, and the degraded (non-cached) archive fallback.
- `npm run check` and Playwright desktop + mobile: passed. Browser-verified at 375 px and 1380 px.

### Housekeeping

- Removed the stale Claude launch configuration and clarified in `AGENTS.md` that future task branches should not use the `codex/` prefix unless explicitly requested; noted that a `pyproject.toml` version/dependency change must re-run `uv lock` so CI's `uv sync --locked` stays green.
- Cleaned up merged auxiliary worktrees and `codex/*` branches after confirming they had no commits ahead of `main`.

## [v0.4.0] - 2026-07-06

### Added

- Rebuilt the interface around a map-first shell: one full-bleed map plus a single bottom sheet (peek/half/full detents on mobile, floating panel on desktop) with the search field inside the sheet.
- Added a four-way segmented domain control (`En cours`, `Planifiées`, `Archive`, `Contexte`) that drives both sheet content and the visible map layer; each domain has a purpose-built server-rendered view (place-first current rows, date-grouped planned schedule with calendar tiles, archive report with 24 h/7 j/30 j/1 an windows and largest-event callout, disclosure documents as a regional-context list).
- Added the address-mode overview answer stack: current and planned status lines with nearest-distance/next-window wording, a local-history hero card with a 14-month bar chart, doorways into scoped domain views with a `5 km / Québec` scope toggle and back-to-overview navigation, and detail cards (observed start/end/duration, customers, last status, source note) that open at half detent so the highlighted geometry stays visible.
- Added `/sheet` fragment route, `app/sheet_views.py` context builders with unit tests, `app/static/sheet.js` (detents, domain navigation, detail cards), and `app/static/map-utils.js` with node tests.

### Changed

- Replaced Leaflet with vendored MapLibre GL JS 5.24 using the OpenFreeMap Liberty vector base style; domain layers render as GeoJSON sources with semantic colors (red current, amber planned, violet archive, teal published context) plus an address pin and dashed 5 km radius ring.
- Removed the fixed navy header, HTMX/unpkg dependency, accordion sections, eye-icon Show/Hide toggles, and icon-only count pills; language switching moved to a compact control beside the search field and preserves the active search.
- Re-pointed `/search` and `/search-location` to return the new sheet fragment; deleted `_default_context_list.html`, `_results.html`, `_result_cards.html`, `_map_placeholder.html`, `side-panel.js`, and `map-layers.js`; service-worker cache marker moved to `pannes-historiques-v0.4.0-sheet-maplibre`.
- Rewrote Playwright desktop/mobile specs for the sheet shell (28 passing), replaced the side-panel node test with `map-utils.test.js`, and updated web-route tests.

### Fixed (post-review pass)

- Added `map-utils.js` to the service-worker precache (offline module graph was broken without it), labeled the explore current/planned row caps, and sequenced `/sheet` fetches so a slower response can no longer overwrite a newer view; failures now roll back state and show a localized error banner.
- Coherence sweep: one shared version token for internal module imports (guarded by a node test), icon macros consolidated into `_macros.html`, orphaned templates and the `/search-map`/`/search-location-map` routes removed, dead exports pruned, Quebec-local month buckets, per-layer map click registry, and `aria-pressed` semantics on the segmented control.

- Dead-code sweep: removed the orphaned `map-layer-data`/`map-layer-toggle` handlers, unused planned-schedule formatters, five leftover header CSS selectors, and 118 unused i18n keys per language; the map-label payload shipped to the client shrank from ~110 strings to the 35 actually read. Restored the provenance affordance as an in-sheet card (the old info button had been left inert). Added unit tests for archive day-grouping and address-scoped domains (sheet_views to 92%) and e2e coverage for the disclosure detail card, comparison tray, and provenance card; the e2e disclosure fixture now carries a name-shaped area label matching real data.

### Verified

- Release verification on `main` passed `uv run pytest -q` (124), `node --test` suites, `uv run pre-commit run --all-files`, `npx playwright test` (38, desktop + mobile Chromium), and `npx wrangler deploy --dry-run`.
- Deployed to production on 2026-07-06 with Worker version `1f2b6dc1-8f48-4354-be76-e65e339e3711` and container image `pannes-historiques-pannescontainer:1f2b6dc1`; tagged `v0.4.0` and pushed with `main`.
- Post-deploy smoke checks: `/healthz` 200; `/` 200 serving the sheet shell and MapLibre assets; representative French address search 200 (~11 s cold on the fresh container, ~1.9 s warm) containing the overview hero card; `/sheet?domain=archive` 200 (~1.5 s) listing real territory bins (Montréal, Laval, Québec, …); `/about` 200 in the new style; `/service-worker.js` advertising `pannes-historiques-v0.4.0-sheet-maplibre`; `/collect`, `/cron/hydro`, `/debug/timing/search`, `/api/durable/status`, and `/internal/disclosures/export` all 404.

### Known follow-ups

- Explore-mode `Contexte` and `Planifiées` fragments embed large map payloads (up to ~700 KB); slim the match payloads or move them to on-demand endpoints during the public-read architecture slice.
- Place names for current/planned rows need a municipality-code lookup asset; rows currently lead with time/window.
- Language control is only visible in explore mode; the About page keeps the previous header styling.

## [2026-07-05 mobile local-answer follow-up] (deployed)

### Added

- Added a mobile-first local stability answer card for address searches with retained-record count, most recent retained record, nearest retained record, distance-band counts, source/caveat copy, and a local comparison tray.
- Added local Current and Planned summaries that distinguish nearby records within the fixed 5 km address radius from broader Quebec-wide layer counts.

### Changed

- Reworked the mobile search-result sheet so address searches open with the local answer and `Seen Before Here` evidence before broader layer context.
- Improved empty local-history states so zero-result addresses explain what `0` means and do not reserve a large blank list area on mobile.

### Fixed

- Preserved the local comparison controls when lazy-loaded previous-history data refreshes the local answer card.
- Kept comparison-tray counts synchronized with the refreshed local previous-history summary instead of the initial server placeholder.

### Verified

- Local verification passed `uv run pytest tests/test_views.py -q`, `node --test tests/side-panel-archive.test.js`, Ruff, djLint, Biome, `git diff --check`, and Playwright mobile screenshot checks at a 390px viewport.
- Mobile screenshots verified typed-address comparison, local previous-history answer, Current/Planned local-vs-Quebec summaries, zero-history explanation, no horizontal overflow, and the comparison tray.
- Deployed to production on 2026-07-05 with Worker version `3faf2203-ea92-492e-9764-c1b538722716` and container image `pannes-historiques-pannescontainer:3faf2203`.
- Post-deploy smoke checks returned `200` for `/healthz`, `/`, and a representative French address search; deployed HTML contained the local answer card and comparison control.

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
