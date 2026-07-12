# Plan: Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-07-11

This file is the active execution plan. Keep durable evidence, source notes, and long historical reasoning in `NOTES.md`; keep completed release and implementation history in `CHANGELOG.md`; keep completed detail here only when it affects current decisions.

## Current State

- Current deployed release: `v0.4.2`, public beta readiness (deployed 2026-07-10), with post-release archive-map, WCAG, contributor-foundation, and service-worker-cache follow-ups deployed on 2026-07-11.
- Current production deployment: Worker version `395dd418-e47b-443e-a60c-ecc8c0305b51`; container image `pannes-historiques-pannescontainer:395dd418`.
- Current release in progress: `v0.4.3` runtime cost, public-read migration, and CI/test hardening. Earlier unclassified `500` responses are now a production-monitoring issue for this slice, not a public-announcement blocker. A first low-key beta feedback post was made to `r/HydroQuebec` on 2026-07-10; posting to `r/quebec` remains blocked because the account has `0` community comment karma and has not met the undisclosed activity threshold.
- P1.1/P1.3 resolved for `v0.4.1`: the production D1 municipal archive is healthy (1,341 admin territories, all named, zero null-name primary bins; 24 h archive window live). The "Secteur 1000"/"24 h: 0" seen in the 2026-07-08 review were a container cold-start artifact — the baked SQLite fallback bins by Hydro area code and its degraded result was cached for the 120 s TTL. `v0.4.1` suppresses the code-named territory breakdown and skips caching when the durable D1 summary is expected but unavailable, so the tab recovers real names/fresh windows on the next request. The public durable endpoint `GET /api/durable/runtime/previous-archive-summary` returns named, fresh data directly.
- Open follow-up (unchanged): the trusted container-runtime proxy check in `src/runtime-policy.js` still hardcodes `cf-worker === "dalaque.workers.dev"`; the container archive path currently authenticates via the operation token / the endpoint being un-gated, but the hardcoded host should still be made configurable.
- Current repository state: `main` includes the deployed `v0.4.2` implementation plus archive-focus/default-map-framing, WCAG, contributor-foundation, and service-worker-cache follow-ups. Start the substantive `v0.4.3` implementation in a new dedicated worktree/branch.
- Current frontend state: production serves one full-bleed MapLibre GL map with the OpenFreeMap Liberty vector style plus a single sheet: peek/half/full detents on mobile and a floating panel on desktop. Search lives inside the sheet. A segmented control (`En cours`/`Planifiées`/`Archive`/`Contexte`) drives both sheet content and visible map domain. Address mode opens to an overview answer stack with current/planned status lines, a 14-month local-history chart, scoped domain views with a `5 km / Québec` toggle, in-sheet detail cards, a provenance card, and a browser-local comparison tray. The old Leaflet/HTMX/header/accordion/sidebar/show-hide model is no longer the current interface.
- Production data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Québec payloads, disclosure metadata, and runtime map-context layers.
- Container role: still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible/container fallback paths.
- Important architecture caveat: runtime writes inside the container are ephemeral; durable production state belongs in D1/R2 or another durable store.
- Cost caveat: the June 2026 Cloudflare invoice was driven mostly by Workers Paid baseline plus Durable Object/container runtime costs; D1 and R2 were not material cost drivers on that bill.
- User-facing URL contract: clean root URL with `lang`, `q`, or current-location coordinate parameters; obsolete public `radius_m`, `days`, and `include_planned` parameters were removed from the main interface.
- Debug, collection, cron, internal export/file, direct durable-status, and durable runtime endpoints are private by default; production returns `404` unless the expected debug flag, Worker block, scheduled header, internal header, or operation token is present.
- Current deployed release marker: service worker cache name `pannes-historiques-v0.4.2-cache-refresh` with browser-module token `20260710c`.
- Latest deployment smoke checks on 2026-07-11 returned `200` for `/`, `/healthz`, and `/service-worker.js`; the live worker served the cache-refresh marker. The earlier 2026-07-10 archive-focus rollout also passed rendered production checks for the stable southern-Quebec overview and correctly focused a latest archived Saint-Mathieu-du-Parc event.
- Current operational follow-ups from 2026-06-20 health sweep: remove or expire stale `ingestion_runs` rows stuck in `running`; group/de-duplicate the Archive "latest" summary rows by territory before display; monitor D1 growth (production D1 measured `1.35 GB` on 2026-07-08, up from `935 MB` on 2026-06-20 — the growth curve is steep enough that the retention/rollup policy under Cost Follow-up Thresholds should be scheduled this quarter rather than deferred); keep archive/count aggregations on materialized summaries rather than live full-table scans; continue moving user search paths away from the container where practical; and make the trusted container-runtime Worker host configurable instead of hardcoding the current `dalaque.workers.dev` value.
- Current locally collected test baseline on 2026-07-11: 149 Python tests and 38 Node tests pass; Playwright lists 48 desktop/mobile cases. The last measured combined Python line/branch coverage was 61% at 147 tests, so rerun coverage before treating that percentage as current. Coverage remains weakest in Hydro ingestion, disclosure parsing, service orchestration, `src/worker.js`, `src/container.js`, and the main browser controllers. GitHub Quality now runs pre-commit, pytest, and Node unit tests on pull requests and `main`, but does not yet publish/enforce coverage or run the Playwright suite.
- Previous-outage accumulation is working in D1. On 2026-06-30 production had `18,236` resolved outage events and `146,109` folded outage sightings; all resolved outage events had centroids. Geographic archive bins were current through `bispoly:20260630193015:30`, but archive-bin completeness still needs a cleanup/audit pass.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; keep the broader `r/quebec` post as a later one-time community post after normal participation satisfies Reddit's eligibility requirement.
- `r/HydroQuebec` feedback on 2026-07-11: one address-search user found the fixed 5 km nearby-outage radius too broad in a small municipality because it returned municipal-wide events that did not affect their address. Treat a user-adjustable nearby radius with an address-search-appropriate smaller default as a concrete `v0.4.3` usability need; keep the main URL free of obsolete public `radius_m` parameters. A separate commenter requested regional outage preparedness summaries and a long-term address dashboard; use that as validation input for the deferred `v0.5.2` regional analytics and `v0.5.1` saved-area evaluation rather than committing to an address-level dashboard now.
- Support boundary for address-specific disputes: pannes.ca can show retained observations near an address, not certify service at that residence. Direct requests that need confirmation for a contractor, employer, insurance claim, or other dispute to [Hydro-Québec's official past-outage form](https://www.hydroquebec.com/sefco2016/nous-joindre/panne-passee.html), which accepts an address and date range and sends its response by mail.

## Near-Term Public Announcement Readiness

Goal: make `pannes.ca` credible to share publicly with `r/quebec` as a beta public-interest prototype without overstating data completeness or creating avoidable operational/privacy risk.

Current assessment:

- Traffic is not the blocker. Cloudflare request analytics in early July 2026 showed modest real usage mixed with scanner/bot noise, including a July 3 spike dominated by automated requests.
- A low-key beta feedback request was posted to `r/HydroQuebec` on 2026-07-10. The larger `r/quebec` audience remains a later target, not a reason to repeat the same promotion elsewhere.
- The launch framing should be humble and explicit: observed/retained outage evidence, current/planned Hydro-Québec feed context, published disclosure material where available, and clear limits.

Pre-announcement checklist:

- [x] Reclassify historical `500` attribution as production monitoring rather than an announcement gate. Current direct probes returned no `500`, and a live error tail stayed clean; if errors recur, capture route, user-agent, and country through persistent logs because Wrangler's live-only tail cannot classify older analytics.
- [x] Sharpen public data-limit copy so previous-outage results are clearly retained observations with possible collection gaps, not complete official Hydro-Québec address history.
- [x] Add plain-language privacy/geolocation notes for typed searches, Nominatim/cache behavior, browser location and URL coordinates, server logs, local storage, service-worker caching, cookies/trackers, retention, and contact.
- [x] Re-run production desktop/mobile QA for the homepage, Montreal overview, provenance panel, language/caveat rendering, and representative Quebec City, Saguenay, and Val-d'Or overview responses. Post-deploy rendered checks also passed on `v0.4.2`; the controlled Playwright suite covers current-location permission/coordinates without transmitting a tester's real location.
- [x] Confirm private/debug/collection/internal/runtime endpoints return `404`; add Worker-edge blocking for obvious PHP, WordPress, secret-file, CGI, and PHPUnit scanner probes. Post-deploy scanner probes returned 9-byte edge `404` responses.
- [x] Check `r/quebec` rules/sidebar while logged in. The current self-promotion rule prohibits polluposting/spam but explicitly allows original material; keep this to one transparent original beta-feedback post rather than repeated promotion.
- [ ] Meet r/Quebec's account-activity requirement. The posting account currently has `0` comment karma in the community; contribute normally in comments until Reddit enables posting. The required threshold is not disclosed.
- [x] Prepare the `r/quebec` announcement as a beta feedback request; keep the working draft local and outside tracked documentation until the account is eligible.
- [x] Post a first low-key beta feedback request to `r/HydroQuebec` on 2026-07-10.

Near-term scope decision:

- The minimal privacy/data-caveat work was completed in `v0.4.2` before the first community post.
- Keep deeper public API, notification, and analytical-product work in `0.5.x` unless the announcement uncovers a concrete need. Keep structured-data and machine-readable-readiness work in `v0.4.5`.

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
   - Include `/`, `/sheet`, static assets, current/planned/archive/disclosure layer endpoints, language switching, address search, and current-location search.
2. Cost health endpoint and monthly evidence.
   - Add a private `/api/ops/cost-health` or equivalent operational check reporting container live-instance state, last container wake, last cron run, D1 size, R2 approximate storage/object counts where available, latest ingestion status, and archive-bin materialization status.
   - Add a monthly bill/usage review checklist that compares Durable Object duration, container memory/vCPU/disk usage, D1 storage, D1 row reads/writes, and R2 storage/operations against the target posture.
3. Move public reads off the container.
   - Prioritize `v0.4.3` work so startup data, representative search, operational map layers, archive summaries, and disclosure summaries use Worker/D1/R2 without invoking Flask/container.
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

### Completed Trains

- `0.1.x`: stabilization baseline, deterministic service/geocoding tests, route smoke coverage, Nominatim hardening, and verified status-label decoding.
- `0.2.x`: map-first UI, installability, mobile/search interaction, layer/detail refinement, municipal archive bins, production hardening, and final pre-MapLibre stability checkpoint.
- `0.3.x`: architecture and web-quality foundation, including durable archive summary materialization, Tailwind CDN removal, SEO/social metadata, `robots.txt`, `sitemap.xml`, cache/header cleanup, and parser/runtime test coverage.
- `v0.4.0`: sheet/MapLibre interface redesign. Replaced Leaflet/HTMX/sidebar accordions with a MapLibre map shell plus one sheet, address overview answer stack, segmented domain views, scoped local/province views, in-sheet detail/provenance cards, and updated desktop/mobile Playwright coverage. Complete, tagged, deployed, and smoke-checked on 2026-07-06.
- `v0.4.1`: UI/UX-review polish plus archive cold-start hardening. Complete and deployed on 2026-07-08.
- `v0.4.2`: public beta readiness. Added explicit archive/privacy/non-affiliation copy, preserved selected domain scope, blocked common scanner probes at the Worker edge, expanded regression coverage, prepared the `r/quebec` announcement, and supported the first `r/HydroQuebec` beta post. Complete, deployed, and smoke-checked on 2026-07-10.

### `v0.4.2`: Public Beta Readiness

Goal: make the site safe and credible for a soft `r/quebec` beta post without broad architecture work.

Status: complete, deployed, and smoke-checked on 2026-07-10. Earlier unclassified `500` responses moved to `v0.4.3` production monitoring. The first post is live in `r/HydroQuebec`; the separate `r/quebec` post remains blocked by that community's account-activity requirement.

Scope:

- Add or sharpen public copy for retained-observation limits, archive incompleteness, current/planned feed scope, and Hydro-Québec non-affiliation.
- Add minimal privacy/geolocation language covering address searches, browser geolocation, local storage, service worker cache, server logs, and contact route.
- Add standing browser coverage for the comparison tray, provenance card, and disclosure/regional detail card flows that were manually verified during the `v0.4.0`/`v0.4.1` work.
- Re-run desktop and mobile production QA for homepage, representative address searches, current-location flow, language switching, segment/scope navigation, detail panels, console errors, and static/service-worker freshness.
- Triage recent production `500` responses and classify them as user-facing bugs, scanner noise, or operational follow-up.
- Confirm private/debug/collection/internal endpoints still return non-public responses.
- Draft the `r/quebec` announcement as a beta feedback request with explicit data caveats.

Acceptance criteria:

- A first-time visitor can understand what the archive can and cannot prove before relying on it.
- A privacy-conscious visitor can find plain-language handling notes for address/geolocation use.
- The comparison, provenance, and disclosure/detail flows have automated browser coverage.
- Production smoke and endpoint privacy checks are recorded in `CHANGELOG.md` or `NOTES.md` when the slice ships.

Non-goals:

- No public API contract.
- No notification/watch-area feature.
- No large frontend redesign beyond readiness copy and focused regression coverage.
- No production deploy unless explicitly requested.

### `v0.4.3`: Runtime Cost, Public Read Migration, And CI Hardening

Goal: reduce normal public browsing/search dependence on the Python container, make runtime cost visible, and ensure test regressions are caught in CI.

Scope:

- Add response headers or `Server-Timing` markers that distinguish Worker/static/D1/R2 responses from container responses on browser paths.
- Classify public routes as `edge-safe`, `container-needed`, or `internal-only`; document the classification in `NOTES.md` or a small architecture doc.
- Move the highest-value public reads toward Worker/D1/R2 first: homepage shell data, `/sheet` domain changes where practical, operational map layers, archive summaries, and disclosure summaries.
- Make the trusted container-runtime Worker host configurable instead of hardcoding `dalaque.workers.dev`.
- Add a private cost-health/ops check for container live state, last wake, latest scheduled run, D1 size, R2 approximate state if available, ingestion status, and archive materialization status.
- Monitor recurring production `500` responses and add persistent route, user-agent, and country attribution if live-tail evidence remains insufficient.
- Add a low-cost production mode or documented kill switch where public routes refuse container wakeups and serve last-known-good durable data.
- Make the nearby-outage radius adjustable in the search UI, with a smaller default for typed address searches and a clear selected-distance label. Preserve the clean URL contract rather than restoring public `radius_m` parameters.
- Keep GitHub Quality running pytest and Node tests; add a measured coverage report and a non-regressing coverage floor. Decide whether the full Playwright matrix belongs on every pull request or on protected main/release runs.
- Stabilize the mobile disclosure-detail close scenario that can time out in the full six-worker Playwright run even though focused repeats pass.

Acceptance criteria:

- Representative public paths report which runtime served them.
- Search/sheet smoke checks show fewer container wakeups for ordinary user flows than `v0.4.1`.
- The hardcoded Worker host is replaced by configuration with tests.
- Cost-health output is private and operation-token protected.
- A typed-address search can narrow nearby archive evidence below the current 5 km default without exposing an obsolete radius parameter in the public URL.
- CI rejects Python or Node test failures and records coverage for the code it measures; the browser-suite policy and any quarantined flake are explicit.

Non-goals:

- No rewrite of the Flask shell.
- No change to durable raw-data provenance.
- No user-facing API versioning.

### `v0.4.4`: Archive Health, Retention, And D1 Growth Control

Goal: keep the historical archive trustworthy and affordable as D1 grows.

Scope:

- Clean up or expire stale `ingestion_runs` rows stuck in `running`; add timeout/status semantics so health checks are not confused by abandoned runs.
- Group/de-duplicate the Archive "latest" summary rows by territory/time before display.
- Audit unbinned and non-primary-binned archived polygons; classify expected boundary/out-of-territory cases separately from assignment failures.
- Add a cheap archive-bin completeness metric to private operational status.
- Define and implement an initial D1 retention, rollup, compaction, or archive-offload policy before the 5 GB included storage threshold becomes urgent.
- Keep user-facing archive summaries materialized; avoid full-table scans in interactive paths.

Acceptance criteria:

- Private status distinguishes fresh, stale, abandoned, and failed ingestion/materialization states.
- Latest archive rows no longer repeat the same territory/time due to overlapping polygons.
- Archive-bin completeness has a measured denominator and repair/classification path.
- The D1 storage plan is documented with current size, growth assumption, and selected retention/rollup rule.

Non-goals:

- No destructive raw-source deletion without explicit provenance-preserving replacement.
- No broad schema rewrite unless the measured D1 growth requires it.

### `v0.4.5`: Machine-Readable Public Surface

Goal: make the project easier for people and automated readers to understand without overstating authority.

Scope:

- Add `/.well-known/security.txt`, `humans.txt`, and project/contact metadata if appropriate.
- Add `llms.txt` or equivalent concise machine-readable project notes covering data sources, limitations, public pages, private endpoints, and contact route.
- Document any stable public JSON/data routes that already exist; explicitly mark non-contract/private routes.
- Evaluate structured data only where it helps discovery and does not imply official Hydro-Québec authority or complete historical coverage.
- Add security headers that are compatible with the current asset/runtime stack: CSP where practical, HSTS, Referrer Policy, Permissions Policy, frame protections, and MIME-sniffing protection.

Acceptance criteria:

- Automated readers can discover what the site is, what it is not, and which endpoints are public without scraping implementation details.
- Security/contact metadata exists and does not expose private operational routes.
- Structured data, if added, is conservative and reviewed for authority/completeness claims.

Non-goals:

- No new public API guarantee beyond documented existing routes.
- No notification/watch-area feature.

### `v0.4.6`: Analytical Views And Saved-Area Feasibility

Goal: decide whether broader analytics and opt-in notifications belong in the product before building them.

Scope:

- Revisit regional/municipal archive views, `Bilan par région`-style summaries, and Quebec-first MapLibre labels using production observations.
- Evaluate saved-area notifications after PWA installability, using watch areas or regions rather than requiring a literal home address.
- Define privacy/storage implications for saved areas before implementing any notification flow.
- Confirm the readiness gates for the `v0.5.0` historical-data API contract.

Acceptance criteria:

- There is a written go/no-go decision for saved areas and notifications.
- Any analytical view proposal includes the source tables, materialized summaries, latency/cost assumptions, and user-facing caveats.
- The next implementation slice is small enough to ship independently.

Non-goals:

- No push notifications in this slice.
- No public API launch in this slice unless explicitly re-scoped.

### `0.5.x`: Public Data Product And Opt-In Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

### `v0.5.0`: Historical Data API Contract

Goal: expose accumulated outage and disclosure data through a deliberate, documented public API instead of treating internal JSON/runtime routes as a contract.

Scope:

- Define public versus private API boundaries for current, planned, archived, disclosure, regional, and metadata routes.
- Add stable query shapes for address/coordinate-nearby archive evidence, region/municipality summaries, feed freshness, and source metadata.
- Include data freshness, retention window, provenance, incompleteness, and rate-limit metadata in public responses.
- Add rate limiting or abuse controls appropriate for a public-interest prototype.
- Write API documentation with examples, caveats, error shapes, and versioning policy.
- Keep operation-token, debug, collection, cron, internal export/file, and maintenance routes private.

Acceptance criteria:

- Public API routes are explicitly listed, tested, documented, and versioned.
- Private routes remain non-public in production smoke checks.
- API responses include enough provenance and freshness metadata that callers cannot confuse retained observations with complete official history.
- The implementation does not require normal API consumers to wake the Python container for common reads.

Non-goals:

- No real-time push alerts.
- No enterprise/commercial API product.
- No guarantee of complete Hydro-Québec historical coverage.

### `v0.5.1`: Saved Areas And Notification Pilot

Goal: if `v0.4.6` approves the concept, add an opt-in saved-area model without requiring users to store a literal home address.

Scope:

- Define saved-area shapes: radius around a point, municipality, region, or named watch area.
- Decide where saved-area state lives: browser-local only, server-side, or a hybrid model.
- Add privacy copy and deletion/export expectations before any server-side saved state exists.
- Build a small watch-area UI that can save, rename, list, and remove watch areas.
- Evaluate notification channels: PWA/web push, email, or no notifications if operational cost/privacy tradeoffs are poor.
- If notifications proceed, add explicit opt-in, quiet failure states, unsubscribe/delete paths, and low-cost rate limits.

Acceptance criteria:

- A user can understand and control what is saved.
- Saved areas do not require exact home-address storage.
- Notification delivery, if implemented, has opt-in, unsubscribe, and abuse/cost safeguards.
- The feature can be disabled without breaking public read-only access.

Non-goals:

- No default background tracking.
- No address-level account system unless explicitly re-scoped.
- No alerts based on unverifiable historical inference.

### `v0.5.2`: Regional Analytics And Research Views

Goal: turn accumulated archive/disclosure data into useful public analytical views without overloading the main search flow.

Scope:

- Build regional/municipal archive summaries and `Bilan par région`-style views from materialized summaries, not live full-table scans.
- Use the `r/HydroQuebec` request for preparedness-oriented regional context as research input; validate whether a regional view can communicate observed outage frequency without implying a complete Hydro-Québec reliability ranking.
- Decide whether analytical maps need MapLibre-only rendering or a high-scale visualization layer such as deck.gl.
- Add source/caveat language for each analytical view, including retained-observation limits and disclosure-source differences.
- Add downloadable or copyable summary tables only where row counts, privacy, and provenance are acceptable.
- Validate latency and Cloudflare cost before exposing large province-wide analytical views publicly.

Acceptance criteria:

- Analytical views load from bounded, materialized data products.
- Each view has a clear source, freshness, and caveat section.
- Map/table interactions remain usable on desktop and mobile.
- Production checks show no interactive full-table scans or unexpected container wakeups.

Non-goals:

- No live BI/dashboard stack.
- No claim that regional comparisons represent complete Hydro-Québec reliability rankings.

### `v0.5.3`: Source Expansion And Geocoder Reliability

Goal: improve coverage and resilience after public contracts exist, without weakening provenance.

Scope:

- Expand disclosure ingestion and geometry enrichment where source material is durable and attributable.
- Evaluate additional geocoder providers or fallback strategies for Quebec addresses, municipalities, boroughs, and rural/TNO cases.
- Add source-quality scoring or warnings when data is low precision, sparse, stale, or disclosure-derived.
- Keep raw source data archived; derive new tables/views from raw inputs rather than hand-editing source material.
- Revisit non-Quebec basemap label noise only if it materially affects analytical or saved-area workflows.

Acceptance criteria:

- New source material has archived raw inputs, parser fixtures, provenance fields, and user-facing caveats.
- Geocoder changes improve representative Quebec searches without regressing privacy posture or adding uncontrolled cost.
- Low-precision results are clearly labeled in both UI and API responses.

Non-goals:

- No paid proprietary geocoding dependency without an explicit cost/privacy decision.
- No source expansion that cannot be reproduced from archived inputs.

### Beyond `0.5.x`

No concrete post-`0.5.x` release train is planned right now. Create explicit `0.6.x` slices only after `0.5.x` produces evidence for one of these thresholds:

- recurring saved-area or API usage that needs accounts, quotas, billing, or abuse controls beyond the lightweight prototype model
- notification demand large enough to justify scaled delivery, incident/quiet-hour behavior, and operational monitoring
- analytical/research use that needs a separate dashboard, export workflow, or high-scale map-rendering stack
- source/geocoder expansion that requires paid providers, formal data agreements, or a different provenance model

Until one of those thresholds is met, keep ideas such as multi-channel alerting at scale, accounts, enterprise integrations, alternate basemap stacks, or broader reliability/comparator products unversioned.

## Testing Strategy

- Keep the full Python test suite, Node static-module tests, module-boundary checks, template linting, and Biome checks green for every release slice.
- `v0.4.2` completed: browser coverage now includes the comparison tray, provenance card, disclosure/regional details, simulated current location, and desktop/mobile sheet/detail states.
- `v0.4.3`: add Worker/runtime-policy tests for configurable container host checks, private cost-health endpoints, and runtime markers that distinguish Worker/static/D1/R2 responses from container responses. Keep pytest and Node in CI, record coverage, ratchet a realistic floor upward, and make the Playwright gating/flaky-test policy explicit.
- `v0.4.4`: add archive-health tests for stale ingestion-run cleanup, latest-row grouping, archive-bin completeness metrics, and retention/rollup behavior.
- `v0.4.5`: add route/header tests for well-known files, machine-readable metadata, public/private route documentation, and security headers.
- `v0.4.6`: treat saved-area and notification work as design-first until a go/no-go decision is written; do not add push-notification code without privacy/storage tests.
- `v0.5.0`: add API contract tests for public/private boundaries, response schemas, freshness/provenance metadata, rate limits, and error shapes.
- `v0.5.1`: add saved-area privacy/state tests, opt-in/unsubscribe tests for any notification channel, and disabled-mode behavior.
- `v0.5.2`: add materialized-summary tests and browser coverage for regional analytical views at desktop/mobile sizes.
- `v0.5.3`: add parser/geocoder fixtures for every new source/provider path and regression tests for low-precision labeling.

Before handing off code changes:

- Python: `uv run ruff check . --fix` and `uv run ruff format .`
- Templates: `uv run djlint app/templates --reformat` and `uv run djlint app/templates --lint`
- Static JS/CSS: `npm run format` and `npm run check`
- Cloudflare static-asset performance checks: use cold and warm `curl -fsS -w` probes for `/static/app.css`, `/static/app.js`, each first-party ES module, `/static/icons.svg`, `/service-worker.js`, `/static/manifest.webmanifest`, Noto Sans font files, and vendored MapLibre assets; record HTTP status, `cf-cache-status`, `cache-control`, `etag`, `content-encoding`, transfer size, TTFB, and total time; repeat with a cache-busting query and without one; compare browser DevTools waterfalls and Cloudflare Observatory/Lighthouse results before deciding whether a bundler or different asset strategy is justified.
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

- Browser coverage now exercises comparison, provenance, disclosure/regional details, simulated current location, saved URL restoration, and mobile sheet/detail behavior. Remaining proof gaps are real-device geolocation/permission recovery, visible freshness/change cues, dense live-data readability, and a practical keyboard/screen-reader pass.
- Runtime/cost architecture (`v0.4.3`) still depends on the hardcoded `dalaque.workers.dev` trusted Worker host and on container-backed search/render paths; representative search is warm-fast, but ordinary public reads should keep moving toward Worker/static/D1/R2 paths.
- Archive health (`v0.4.4`) needs stale `ingestion_runs` cleanup, latest-row de-duplication, archive-bin completeness classification/repair, and a D1 retention/rollup policy; production D1 grew from about `935 MB` on 2026-06-20 to `1.35 GB` on 2026-07-08.
- The desktop floating sheet is more coherent than the old side panel, but disclosure/regional detail panels can still make dense states feel crowded; use production observations before widening the panel again by default.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes. Remaining proof gaps are manual screen-reader/assistive-technology checks and an automated axe-style audit, which belong with `v0.4.5` public-surface work.
- Cloudflare performance work now has two tracks: container/app response-time reduction already shipped, while static asset/module waterfall measurement belongs with `v0.4.3` runtime-cost evaluation before any bundler decision.
- The first-party JS module split improves maintainability, but it increases native module requests; measure this on Cloudflare before assuming either native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and still visually fragile; keep checking for overlapping text, horizontal scrolling, and unreadable dense rows when deploying any frontend follow-up.
- Unbranded error pages: a bad in-app URL or an unhandled Flask exception returns the browser-default 404/500 page (no shell, no bilingual copy). Production mostly shields this because private routes return JSON `404` at the Worker edge, but a user-facing 404/500 would look broken. Add minimal branded error pages as low-priority public-surface polish. (Distinct from the checklist item that triages production `500` responses — that is about diagnosing causes, this is about styling the response.)
- The current OpenFreeMap Liberty vector style still includes non-Quebec labels at some zoom levels; hiding them cleanly requires a custom MapLibre style or label-overlay strategy.
- Do not speculate about Hydro-Québec one-letter status-code meanings unless source documentation or payload context verifies them.

### Simplify/Refactor Backlog

An adversarially-verified simplify/refactor review (2026-07-11) confirmed 47 behavior-preserving opportunities. The low-risk dead-code + dedup subset was applied on branch `codex/refactor-cleanup` (services/views/sheet_views/db/geocoding/hydro/web helpers plus the client-JS dups; net −100 lines, full suite green). Deferred, in rough priority:

- Server dedup not yet applied: `disclosures.py` identical `disclosure_outage_events` insert across xlsx/pdf ingest; `web.py` `require_*_route` guard boilerplate (13 routes); `sheet_views.py` `address_domain_sheet_context` double domain dispatch + `radius_km` reuse.
- Template macros (`app/templates/_macros.html`): `ph_metric` (6 identical row-metric blocks), `ph_status_line` (3 overview lines), `ph_date_tile`.
- Worker (`src/worker.js`) — held; it is the deployed hot path, do not churn before the beta: `callContainer*`/`fetchContainer*` POST/bytes boilerplate, `markDisclosure*` helpers, the repeated "map rows → prepared statements → `batchInChunks`" skeleton (~9 functions), and the 3000-line file mixing routing/cron/ingestion/KMZ/geo — a candidate module split, not a rewrite.
- Judgment calls (higher effort/risk, decide deliberately): factor the shared post-geocode tail out of `search()`/`search_location()` in `services.py` (the one genuinely risky one); a `DurableRuntimeClient` full-URL GET helper; merge near-identical `_operational_map_item`/`_previous_operational_map_item`; `hydro.py` `*_if_changed`/`*_if_changed_against` scaffold dup; the month/weekday tables duplicated Python↔JS (`ui-format.js` ↔ `sheet_views.py`), held in sync only by a comment.
- Explicitly NOT to change: the archive-summary windows/largest/latest shaping lives in both `services.py` and `src/worker.js` by design (Python container fallback vs Worker D1 path) — the review verified these should stay separate.
- Two latent bugs the review surfaced (fixing either CHANGES behavior — do deliberately, not as "cleanup"): the geolocation error handler always shows the generic message, so the denied/timeout labels never surface; and confirm the client `?v=` cache tokens are bumped whenever these modules ship.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Do not append long implementation narratives for completed releases.
- Move durable findings, source URLs, command evidence, and longer reasoning to `NOTES.md`.
- Move completed release summaries and implementation checkpoints to `CHANGELOG.md`.
- If this file grows past roughly 300-400 lines again, compact completed sections before adding more plan detail.
