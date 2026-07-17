# Plan: Hydro-Quebec Outage History App

Date: 2026-04-25
Last updated: 2026-07-17

This is the active execution plan. Keep detailed evidence and research notes in `NOTES.md`, completed release history in `CHANGELOG.md`, operational runbooks in `docs/operations.md`, and long maintenance backlogs in `docs/maintenance-backlog.md`.

## Current State

- Current shipped release: `v0.4.3`, cost containment and production-navigation cleanup, released 2026-07-17.
- Current production deployment: Worker version `9ddad2ec-ea03-4b4a-80d2-7bee40ddfa92`; container image `pannes-historiques-pannescontainer:9ddad2ec`.
- Current implementation line: `main` has released `v0.4.3`; the next active product slice is `v0.4.4` contributor readiness and CI hardening.
- Current frontend: one full-bleed MapLibre GL map plus a single sheet. The sheet owns search, domain navigation, address overview, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Current data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Quebec payloads, disclosure metadata, and runtime map-context layers.
- Current container role: Flask/Jinja shell rendering, local-compatible fallback paths, and a baked SQLite snapshot. Container-local writes are ephemeral and must not become production state.
- Current cost posture: normal public browsing/search should not produce recurring container/runtime overage. The next slice prioritizes cost containment before broader beta UX work.
- Current public API posture: some JSON/data routes exist, but the public/private boundary and stability status are not yet a full API contract.
- Current contribution posture: contributor docs exist and GitHub Quality runs pre-commit, pytest, and Node unit tests. Coverage reporting and Playwright gating still need policy work.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; the broader `r/quebec` post remains blocked by that community's account-activity requirement.
- Address-specific dispute boundary: pannes.ca can show retained observations near an address, not certify service at that residence. Direct certification requests belong with Hydro-Quebec's official past-outage form.

## Active Slice: `v0.4.3`

### Goal

Reduce normal public browsing/search dependence on the Python container, make runtime cost visible, and choose the near-term public-read architecture with evidence.

### Scope

- [x] Add response headers or `Server-Timing` markers that distinguish Worker/D1 from container responses on browser paths.
- [x] Classify public routes as `edge-safe`, `container-needed`, or `internal-only` in `docs/architecture.md`.
- [x] Choose the hybrid-renderer option while keeping Worker-first durable reads; defer a browser-shell rewrite until production markers justify it.
- [x] Keep startup context, operational map layers, archive summaries, and disclosure summaries on the existing D1-backed runtime path; no Flask-shell rewrite in this slice.
- [x] Make the trusted container-runtime Worker host configurable instead of hardcoding `dalaque.workers.dev`.
- [x] Add a private cost-health/ops check for container state, latest scheduled run, optional D1/R2 dashboard estimates, ingestion status, and archive materialization.
- [x] Add persistent `/sheet` exception attribution, a localized fallback fragment, stale Leaflet tombstones, favicon aliasing, and broader scanner blocking.
- [x] Add a low-cost container-wake kill switch; durable APIs remain available while browser-shell routes deliberately return `503`.
- [x] Add an adjustable nearby-outage radius with a smaller typed-address default, while preserving the clean public URL contract.
- Keep broad CI hardening out of this slice except for tests needed to prove runtime policy and private cost-health behavior.
- Keep broader search-contract changes out of this slice beyond the smaller typed-address default and radius control.

### Production Navigation Cleanup

Observed from Cloudflare request analytics on 2026-07-13:

- Most public navigation and app interaction succeeds, but `/sheet` still produced a small number of user-facing `500` responses.
- A few clients still request pre-MapLibre Leaflet assets, likely from stale cached app shells or old service-worker state.
- Some `404` traffic is expected scanner noise or public hits to private runtime endpoints; keep those private rather than making them public to quiet analytics.

Cleanup checklist:

1. Add persistent `/sheet` exception attribution: request id, query params, domain, scope, language, address/current-location mode, and traceback.
2. Add a defensive `/sheet` fallback that returns the localized sheet load-error fragment instead of a raw `500` when context building or rendering fails.
3. Add compatibility tombstones for stale Leaflet URLs:
   - `/static/vendor/leaflet/leaflet.css`
   - `/static/vendor/leaflet/leaflet.js`
4. Make the Leaflet JS tombstone clear old service-worker caches/unregister stale service workers and reload once, so old cached app shells converge to the MapLibre release.
5. Add `/favicon.ico` as a redirect or alias to the current favicon.
6. Tighten Worker scanner blocking for obvious WordPress/Joomla/PHP probe paths so those misses stay cheap and do not obscure real navigation errors.
7. Keep private runtime endpoint `404`s private; only investigate if trusted Worker-proxied internal calls start failing.
8. After deployment, compare the next 24h Cloudflare analytics for `/sheet` 500s, Leaflet 404s, favicon 404s, and scanner-path volume.

Deployed 2026-07-17 as Worker version `9ddad2ec-ea03-4b4a-80d2-7bee40ddfa92`. Live probes confirmed `200` for the homepage, `/sheet`, and both Leaflet tombstones; `/favicon.ico` redirects to the SVG; and `/wp-login.php` returns a Worker-edge `404`. Keep the 24-hour analytics comparison as the remaining monitoring step.

### Acceptance Criteria

- Representative public paths report which runtime served them.
- Search/sheet smoke checks show fewer container wakeups for ordinary user flows than `v0.4.1`.
- `PLANS.md` or `docs/architecture.md` records the selected near-term architecture option and rejected alternatives.
- The hardcoded Worker host is replaced by configuration with tests.
- Cost-health output is private and operation-token protected.
- The production navigation cleanup either eliminates `/sheet` 500s and stale asset 404s or records enough attribution to reproduce the remaining cases.

### Non-Goals

- No rewrite of the Flask shell.
- No change to durable raw-data provenance.
- No user-facing API versioning.
- No saved areas, accounts, or notifications.

## Architecture Options

The cost-containment direction is detailed in `docs/cost-containment.md`. Keep the `v0.4.3` decision focused on these options:

1. Worker-first public reads, container for parsing/batch/fallback.
   Most aligned with cost containment; requires moving or replacing some Flask/Jinja public-read logic.
2. Hybrid renderer: Flask remains canonical, Worker caches/materializes expensive reads.
   Lowest migration risk; still needs strict caching and low-cost mode to avoid container wakeups.
3. Static shell plus Worker APIs.
   Cleanest long-term shape, but too much rewrite and API-contract pressure until evidence shows Flask/Jinja is the main cost problem.

Current preference: use `v0.4.3` to measure and choose between options 1 and 2. Avoid option 3 for now.

## Roadmap

Completed release history lives in `CHANGELOG.md`. Current planning starts from `v0.4.3`.

### `v0.4.4`: Contributor Readiness, CI Hardening, And Beta UX Follow-Up

Make the repo easier for external contributors while addressing the smallest beta feedback that does not depend on unresolved cost architecture.

- Add measured coverage reporting and a non-regressing floor.
- Decide whether full Playwright belongs on every pull request or protected main/release runs.
- Add a contributor-friendly issue map for first external tasks.
- Tighten contributor and architecture docs where the cost-containment work clarifies the Worker/container split.

### `v0.4.5`: Machine-Readable Public Surface And API Posture

Make the project easier for people and automated readers to understand without overstating authority, and start drawing the public/private API boundary before `v0.5.0`.

- Add appropriate `security.txt`, `humans.txt`, `llms.txt`, contact, and project metadata.
- Document existing public JSON/data routes as versioned candidates, available-but-unstable routes, or private/internal routes.
- Add compatible security headers.
- Keep the full public API contract for `v0.5.0`.

### `v0.4.6`: Archive Health, Retention, And D1 Growth Control

Keep the historical archive trustworthy and affordable as D1 grows.

- Clean up or expire stale `ingestion_runs`.
- De-duplicate Archive latest rows by territory/time.
- Audit archive-bin completeness and classify expected boundary/out-of-territory cases separately from assignment failures.
- Define the first D1 retention, rollup, compaction, or archive-offload policy before the 5 GB included storage threshold becomes urgent.

### `v0.4.7`: Hydro Score / Regional Analytics Framing

Decide whether a simple, well-disclosed "walkability score for Hydro reliability" style concept can communicate regional or address-area outage context without overclaiming precision.

- Define candidate score inputs and disclosure rules before building anything.
- Decide whether a score should be numeric, categorical, or avoided in favor of component metrics.
- Confirm the readiness gates for the `v0.5.0` API contract.
- Do not build saved areas or notifications in this slice.

### `0.5.x`: Public Data Product And Analytical Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

- `v0.5.0`: historical data API contract with explicit public/private boundaries, response schemas, provenance/freshness metadata, rate limits, docs, and tests.
- `v0.5.1`: public API consumer experience: examples, sample payloads, compatibility notes, caching/rate guidance, and contract tests that contributors can run locally.
- `v0.5.2`: regional analytics and research views from bounded, materialized data products, with conservative caveats and no reliability-ranking overclaims.
- `v0.5.3`: source expansion and geocoder reliability after public contracts exist. Start with a municipal-distributor referral/source-discovery pass for Hydro-Sherbrooke: identify the authoritative live-outage map and address-specific historical-request path, and label it as external coverage. Do not scrape or imply archived Hydro-Sherbrooke coverage unless access terms, data quality, and retention are verified.

Saved areas, saved-area notifications, and web push notifications are deferred out of the concrete train until repeated user demand and a privacy/cost model justify them.

## Testing Strategy

- Keep Python tests, Node tests, module-boundary checks, template linting, and Biome checks green for every release slice.
- `v0.4.3`: add Worker/runtime-policy tests for configurable container host checks, private cost-health endpoints, and runtime markers.
- `v0.4.4`: add coverage reporting, decide the Playwright gating policy, and keep browser regressions focused on changed UX paths.
- `v0.4.5`: add route/header tests for well-known files, machine-readable metadata, public/private route documentation, and security headers.
- `v0.4.6`: add archive-health tests for stale ingestion-run cleanup, latest-row grouping, archive-bin completeness metrics, and retention/rollup behavior.
- `v0.4.7`: test analytical framing with bounded fixture data only if a product concept survives review.
- `v0.5.x`: add API contract, schema, freshness/provenance, rate-limit, analytical-summary, parser, and geocoder tests as each slice lands.

Routine command details live in `docs/contributing.md`; production and deploy checks live in `docs/operations.md`.

## Current Risks And Open Questions

- Runtime/cost architecture still depends on a hardcoded trusted Worker host and container-backed search/render paths.
- Ordinary public reads should keep moving toward Worker/static/D1/R2 paths, but the right migration boundary is not yet proven.
- Archive health needs stale ingestion cleanup, latest-row de-duplication, archive-bin completeness classification, and a D1 retention/rollup policy.
- D1 grew from about `935 MB` on 2026-06-20 to `1.35 GB` on 2026-07-08, so storage policy should not be deferred indefinitely.
- Browser proof gaps remain: real-device geolocation/permission recovery, visible freshness/change cues, dense live-data readability, and practical keyboard/screen-reader checks.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes; remaining proof gaps belong with `v0.4.5`.
- First-party JS modules improve maintainability but increase module requests; measure on Cloudflare before assuming native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and visually fragile; keep checking overlap, horizontal scrolling, and dense-row readability.
- Bad in-app URLs and unhandled Flask exceptions still need minimal branded 404/500 pages.
- OpenFreeMap Liberty still includes non-Quebec labels at some zoom levels; solve only if it materially affects analytics or saved-area-adjacent workflows.
- Do not speculate about Hydro-Quebec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Move completed release summaries to `CHANGELOG.md`.
- Move durable evidence and long reasoning to `NOTES.md`.
- Move runbooks, cost strategy, and maintenance backlogs to focused docs.
- If this file grows past roughly 250 lines again, compact before adding more detail.
