# Plan: Hydro-Quebec Outage History App

Date: 2026-04-25
Last updated: 2026-11-01

This is the active execution plan. Keep detailed evidence and research notes in `NOTES.md`, completed release history in `CHANGELOG.md`, operational runbooks in `docs/operations.md`, and long maintenance backlogs in `docs/maintenance-backlog.md`.

## Current State

- Current shipped release: `v0.4.8`, cost and operational guardrails, released 2026-08-14.
- Tagged-release deployment: Worker version `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`, deployed 2026-08-14 from tagged release commit `f6df621` with the `pannes-historiques-pannescontainer:e6fe9a87` image.
- Latest production deployment: code commit `dead987`, deployed 2026-11-01 as Worker version `f4559ee1-46af-4ea5-b67a-11e4c6499261` with immutable amd64 container digest `sha256:c8145cc83b096b197a968ea9062e59666d7a31364c53ddf49972373e5f90ef4e` (container application version 132). Location/offline recovery, shared template macros, disclosure wrapping and bilingual freshness wording are deployed. GitHub Quality/CodeQL/Browser regression and live desktop/mobile map/search, localized pages, static assets, ingestion and archive coherence pass. Ingestion was healthy with zero consecutive failures. The explicitly requested 20:22 UTC Archive refresh subsequently cleared its cursor-lag warning; later ingestion can raise the routine warning again. No D1 migration or cron/binding change. A full rolling-day D1 comparison remains.
- Ingestion incident 2026-07-15 to 2026-07-20: scheduled Hydro ingestion failed every 30 minutes for five days while the site returned `200` and served stale data. Cause was the durable collection path storing payload files without registering the `raw_snapshots` row the Worker's `/internal/raw-snapshot` callback resolves through. Fixed and verified: run 3630 completed `ok` and snapshots are current again. Two plausible-but-wrong hypotheses were ruled out by testing rather than by correlation — container ephemerality, and the `v0.4.3` CodeQL path-hardening, whose lookup was exercised directly against a real file and resolves correctly.
- Monitoring gap this exposed: the only health surface was token-protected and pull-based, so nothing observed the failure. `GET /api/health/ingestion` now returns `503` when ingestion is stale or failing. The `Ingestion health monitor` GitHub Actions workflow probes it hourly.
- That probe also fails when the served archive summary is missing or contradicts itself, after the Archive report spent months showing a count of municipalities as a count of outages while every health surface reported green. A routine cursor lag between 15-minute ingestion and the bounded summary refresh remains visible as a warning without declaring fresh ingestion unhealthy. This classification is deployed and production-verified.
- Current implementation line: the `v0.4.9` privacy-preserving usage-evidence candidate is deployed and retains ADR 0006's component-metric decision. The shipped/tagged release remains `v0.4.8`; the eight-week usage decision is complete and continues the existing bounded collection. See `docs/current-snapshot.md` for the concise code/deployment distinction.
- Current frontend: one full-bleed MapLibre GL map plus a single sheet. The sheet owns search, domain navigation, address overview, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Official-channel decision, 2026-11-01: keep the UI unchanged and retain Hydro-Québec Bluesky, Facebook and newsroom links as a background operational watchlist. No social-feed feature or monitoring automation is planned; source links and the reconsideration condition are recorded in `NOTES.md`.
- Storage/retention and event identity/API: detailed [storage](docs/plans/storage-retention.md) and [identity/API](docs/plans/event-identity-api.md) plans. Measure and preserve existing archive information before physical compaction; develop a separately versioned observation/episode model before notification dedup or stable public API promises. No production migration or deletion is authorized by the plans.
- Westmount source expansion: [detailed phased plan](docs/plans/westmount.md); planning only, with source semantics/access, storage, provider health and shadow validation gates before public activation.
- Saved-area web notifications: [detailed proposed plan](docs/plans/saved-area-notifications.md); no implementation yet. Local-only saving precedes explicit server-side alert opt-in; subscription/coordinate data is a separate private service-data boundary from anonymous usage evidence.
- Small recovery/template cleanup is deployed from `dead987`: specific localized location errors, bilingual offline retry preserving the failed URL, and shared metric/date/status macros with rendered-output parity. Detailed evidence is in NOTES.md and the maintenance backlog.
- Additional cleanup deployed, 2026-11-01: dialog keyboard regression checks, long disclosure/detail wrapping and bilingual summary-freshness wording; usage decision recorded with eight complete weeks and no analytics expansion. Code commit `dead987` is pushed and production-verified.
- Current data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Quebec payloads, disclosure metadata, and runtime map-context layers.
- Current container role: Flask/Jinja shell rendering, local-compatible fallback paths, and a baked SQLite snapshot. Container-local writes are ephemeral and must not become production state.
- Current cost posture: hybrid Worker/D1/R2 reads and the low-cost mode guardrail limit container exposure. Normal Hydro ingestion follows Hydro-Quebec's documented 15-minute source cadence; cleanup and alerting run on a separate hourly maintenance cron with daily gates for retention work. D1 treats old current/planned marker rows as reconstructable derived data: raw Hydro API payloads stay in R2, `hydro_snapshots` keeps provenance, and migration `0013` rebuilt the derived current-feed tables from their latest versions before adding targeted indexes and keyed runtime summaries. The Archive summary and map-context payload are bounded materializations, not routine request-path relational rebuilds: public reads serve stored summaries, stale Archive summaries are marked stale instead of rebuilt on demand, and routine cost/status output avoids full D1 table-count scans.
- Current public API posture: route stability tiers are now written down in `docs/api-posture.md` and summarized for machine readers at `/llms.txt`. Every JSON route is explicitly `unstable`; the first `stable` contract is still deferred to `v0.5.0`.
- Resolved mobile detail-close flake: fixed in `v0.4.5` and guarded by regression tests. Keep the detailed root-cause notes in `NOTES.md` rather than this active plan.
- Current contribution posture: contributor docs and a scoped issue map exist. GitHub Quality enforces Python branch coverage, while full Playwright runs on pull requests, `main`, and manual dispatch.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; the broader `r/quebec` post remains blocked by that community's account-activity requirement.
- Address-specific dispute boundary: pannes.ca can show retained observations near an address, not certify service at that residence. Direct certification requests belong with Hydro-Quebec's official past-outage form.

## Current Local Slice

- [x] Move the four detailed plans into `docs/plans/`, preserving all checklists and testing safeguards.
- [x] Simplify address-domain selection/radius formatting while preserving separate sidebar and map matches.
- [x] Record repeatable cold/warm desktop/mobile production module measurements.
- [x] Reconcile all 33 local Markdown documents and validate relative links/anchors; final checks pass on `plan-sheet-cleanup`.
- These changes are committed locally on `plan-sheet-cleanup`; production remains application commit `dead987`. This slice has not been pushed or deployed.

## Roadmap

Completed release history lives in `CHANGELOG.md`; durable investigation details live in `NOTES.md`. The eight-week `v0.4.9` usage decision is complete; continue bounded collection and periodic review. Next substantial execution is the storage inventory/recovery phase and a full-day D1 cost comparison. The `v0.4.7` evidence and no-score decision are preserved in ADR 0006 and `NOTES.md`.

### `v0.4.8`: Cost And Operational Guardrails

Make the public-read path measurable, bounded, and trustworthy before collecting product-use evidence or committing to a stable public API.

- Cursor-aware materialized archive reads and ingestion-health checks are implemented and production-verified. A source-cursor mismatch makes the served state visibly stale and appears as a health warning; a missing or internally contradictory summary makes the health probe unhealthy. Public requests must not rebuild the half-million-row archive summary. Focused tests cover matching, mismatch, missing cursors, incoherence, and the no-on-demand-rebuild guard.
- Protected container-to-Worker calls are retired. The Flask container now calls only public `map-context` and `previous-archive-summary` reads; all former protected reads and writes use local-compatible fallbacks directly. The invalid proxy-token path and trusted-host variable are removed, and focused Node/Python tests prevent a protected endpoint from being reintroduced as a container dependency.
- The authenticated Cloudflare dashboard review confirms sustained container and Durable Objects usage, Worker requests without Worker errors, and D1/R2 storage posture. It does not attribute container time to a route or wakeup, so retain the hybrid shell and do not change idling from aggregate billing evidence. The billing artifact and account-specific figures remain excluded from the repository. Use route/runtime markers and representative timings to choose one named public-read migration in a later slice.
- The shared interaction-endpoint zone rule is active and the browser has a tested autocomplete `429` response. The Free plan exposes one rule slot with a 10-second window, so `autocomplete and usage per IP` covers `GET /autocomplete` and `POST /api/usage`, blocking an IP after 10 matching requests in 10 seconds for 10 seconds. The rollback procedure is documented in `docs/operations.md`.
- Prioritize D1 storage planning this week: the 2026-11-01 probe reports `3,359,739,904` bytes (3.360 GB), leaving about 140 MB before the 3.5 GB internal review/compaction trigger. This is about 250 MB growth since October 22, roughly another week of headroom at the short observed pace. Measure geometry/bin rollup or R2 offload options while preserving raw inputs, provenance and archive-visible information.
- Production cost/health verification is substantially complete. The rolling 24-hour D1 totals on 2026-09-11 were `37,035,178` rows read and `396,087` rows written; a simple 30-day projection remains comfortably inside the Workers Paid included allowances. Ingestion was fresh, recent GitHub monitors passed, and repeated public map-context and Archive reads served unchanged stored materializations rather than request-time rebuilds. The archive cursor query, which read about `24.0 million` rows across 83 runs despite returning bounded batches, is deployed as independently indexed same-version and newer-version ranges and omits unused raw coordinates. Compare the new query signatures and total reads over a full 24-hour window before considering the hotspot closed. Account-wide Container, Durable Objects, and R2 totals still require the authenticated dashboard review.

Exit evidence is complete. `v0.4.8` deployed as Worker `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`; public homepage, Archive, autocomplete, and ingestion-health probes returned `200`. The health payload was healthy with zero consecutive failures and no archive-summary problems, which verifies the cursor-aware served-summary path.

### `v0.4.9`: Privacy-Preserving Product Usage Evidence

Measure aggregate use of substantive functions only after the operational collection boundary is explicit.

- Implemented on the `privacy-usage-evidence` branch: a fixed UTC daily aggregate schema, separate human/non-human interaction counts, and a daily collection-status heartbeat. Counts are interactions, never people or unique visitors.
- Implemented: 90-day expiry on the existing maintenance schedule. No address, query string, coordinate, IP address, user identifier, raw interaction log, user agent, or browser fingerprint is persisted.
- Implemented: allowlisted current, planned, Archive, DAI/Context, address-answer, and comparison actions. The browser sends only feature/action, omits the referrer and credentials, and respects GPC/DNT; the Worker separately classifies obvious automation and missing interaction signals.
- Implemented: token-protected operational readout with metric definitions, collection coverage, retention status, and no public usage-data response surface. The public endpoint is write-only.
- Activation complete: production D1 migration `0012_usage_evidence.sql` is applied, the shared `autocomplete and usage per IP` edge rule is active and rate-tested, and Worker/container plus D1 smoke checks pass.
- Do not expand analytics without a specific unanswered question and a privacy/CSP/retention decision. A Cloudflare beacon was observed in edge-served HTML on November 1; reconcile account-level injection with the intended no-third-party-tracking posture before claiming it is disabled. No setting was changed.
- Evidence checkpoint, 2026-09-11: 21 active collection days contain `1,824` human-classified interactions, with Archive `843`, current `393`, address answer `333`, planned `128`, Context `116`, and comparison `11`. These are interactions, not people or sessions, and operator testing cannot be separated. September 4 is absent, September 11 was partial at measurement time, and only one fully complete seven-day window exists.
- Decision complete, 2026-11-01: eight complete Saturday–Friday windows September 5–October 30 contain 5,280 human-classified interactions. Continue the existing bounded 90-day aggregates and current feature set; prioritize Archive correctness/storage and address/current usability, keep comparison lightweight, and do not expand analytics. The old October 23 checkpoint and Friday–Thursday label were a calendar error: it covered seven of these complete windows. Evidence, limitations and the next review by December 1 are in `NOTES.md`.

Activation evidence is complete: schema, expiry, classification, browser payload, private/public access boundary, D1 aggregation, migration, edge rule, and production behavior are verified. The eight-week continue/change/stop decision is recorded in `NOTES.md`; routine expiry and periodic review continue.

### `0.5.x`: Public Data Product And Analytical Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

Entry gates: ADR 0006's no-score guard remains enforced; `v0.4.8` exit evidence is complete; `v0.4.9` has completed its bounded lifecycle and decision record; a 14-day observation window shows healthy ingestion, bounded archive-summary refresh with no unexplained prolonged lag, and no unexplained archive-completeness regression; and the autocomplete rate rule is live before a stable API expands address-related traffic.

- `v0.5.0`: historical data API contract with explicit public/private boundaries, response schemas, provenance/freshness metadata, rate limits, docs, and tests.
- `v0.5.1`: public API consumer experience: examples, sample payloads, compatibility notes, caching/rate guidance, and contract tests that contributors can run locally.
- `v0.5.2`: regional analytics and research views from bounded, materialized data products, with conservative caveats, usage-informed prioritization, and no reliability-ranking overclaims.
- `v0.5.3`: source expansion and geocoder reliability after public contracts exist. Start with a municipal-distributor referral/source-discovery pass for Hydro-Sherbrooke: identify the authoritative live-outage map and address-specific historical-request path, and label it as external coverage. Do not scrape or imply archived Hydro-Sherbrooke coverage unless access terms, data quality, and retention are verified. November 1 endpoint discovery covered all nine municipal networks plus the cooperative: one openly queryable outage layer verified for Westmount; Sherbrooke is a conditional map-internal feed (direct GET 403, map Referer GET 200), not an established public API. Its actual map displayed the same zero-subscriber snapshot more than five hours after the embedded timestamp; revalidation worked, but producer freshness versus last-change-only publication remains unresolved. Hold ingestion pending supported-access and freshness confirmation. Baie-Comeau/Magog HTML-in-JSON pages were rejected as outage-ingestion candidates; no useful structured outage API was found for those two or the remaining six. Exact URLs, semantics and access limitations are in NOTES.md. Next: verify supported access/reuse, event identity, timestamps and nonempty data before implementation; operator API/export enquiries remain unsent.

Saved-area web notifications have a [detailed proposed plan](docs/plans/saved-area-notifications.md), requested November 1. The first slice is browser-local saved areas, followed by explicitly opted-in HQ-only nearby-outage alerts; Westmount can follow after its own source gates. Implementation/release remains gated on service-data privacy/retention, event identity, bounded cost, real-device verification and an opt-in beta. Accounts, cross-device sync and guaranteed/emergency delivery remain out of scope.

## Detailed Plans And Verification

- [Storage and retention](docs/plans/storage-retention.md): bounded inventory/recovery first, then a measured preservation-safe migration.
- [Event identity and API contracts](docs/plans/event-identity-api.md): separate observations from episodes before stable API or alert promises.
- [Westmount integration](docs/plans/westmount.md): source/access/identity verification, storage gates and shadow validation before activation.
- [Saved-area web notifications](docs/plans/saved-area-notifications.md): local saving first; explicit enrollment, privacy and delivery gates before push.
- [Testing strategy and regression guards](docs/maintenance-backlog.md#testing-strategy), [contribution checks](docs/contributing.md) and [deployment runbook](docs/operations.md).

## Current Risks And Open Questions

- The container-to-Worker authentication path is deliberately retired: Cloudflare did not deliver a usable token or internal Worker identity, so Flask now calls only two public materialized reads and uses local-compatible fallbacks for former protected calls. Do not add a protected runtime endpoint as a container dependency without a separately designed, tested credential path.
- A private cost review establishes a threshold-crossing signal but not route attribution. The authenticated dashboard measurement supports retaining the hybrid shell; obtain route/runtime evidence before changing container idling or selecting the next public-read migration.
- Ordinary public reads should keep moving toward Worker/static/D1/R2 paths, but the right migration boundary is not yet proven.
- Archive health is deployed: stale run expiry, 30-day terminal-run retention, latest-row de-duplication, and classified archive-bin completeness. Keep monitoring the public ingestion-health endpoint and private completeness audit.
- Cursor-aware archive-summary checks are deployed and production-verified: the served summary was healthy with no cursor or coherence problem after the `v0.4.8` release. The existing payload-shape guard still handles format drift separately.
- D1 measured `3,359,739,904` bytes (3.360 GB) on 2026-11-01; approximately 140 MB remained at that dated probe before the 3.5 GB internal action trigger. Address storage growth this week. Reducing or offloading bulky derived geometry and archive-bin materializations remains open; raw R2 payloads, geometry provenance, archive-visible information and snapshot metadata remain out of scope for automatic deletion. See ADR 0005.
- Deployed follow-up, 2026-11-01: practical dialog keyboard/focus checks, narrow disclosure wrapping fixes and bilingual Archive-summary freshness wording. Browser proof gaps remain for real-device geolocation/permission recovery, assistive-technology speech, dynamic freshness/change indicators and exhaustive live-data density. These changes are committed, pushed and deployed from `dead987`.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes; the remaining proof gaps are ongoing maintenance work, not an unfinished `v0.4.5` release item.
- The [production module baseline](docs/browser-module-baseline.md) records 13 document JavaScript resources and warm-cache reuse. Retain native modules pending a controlled alternative with a demonstrated improvement; this is not user telemetry or route-cost attribution.
- DAI/disclosure detail panels are data-rich and visually fragile; keep checking overlap, horizontal scrolling, and dense-row readability.
- Branded 404/500 pages are deployed from `01b2a87` as Worker `220b83ae-ecc3-4d3b-ac9b-168b171b728c` and container version 131: localized recovery links, no-index/no-store responses, JSON API error handling, and a request-timer teardown fix. Desktop/mobile error-to-map recovery is covered by browser tests.
- SEO search-state follow-up is already implemented: address/current-location and panel-state pages emit `noindex, follow`, with regression coverage; the public landing page remains indexable. The November 1 cleanup verified this and removed the stale backlog item. Absolute social-image URLs, large-card metadata, and French/English/`x-default` alternates remain implemented and production-verified.
- Address queries and usage writes are protected at the edge by the active Cloudflare Free-plan `autocomplete and usage per IP` rule: matching `GET /autocomplete` and `POST /api/usage` requests share a 10-request-per-IP threshold over 10 seconds and trigger a 10-second block. Browser debouncing is not treated as an abuse control.
- Preserve migration `0012` and the shared interaction-endpoint edge rule through deployment; without them the write-only usage endpoint would either fail every interaction or expose an unbounded D1 write path.
- OpenFreeMap Liberty still includes non-Quebec labels at some zoom levels; solve only if it materially affects analytics or saved-area-adjacent workflows.
- Do not speculate about Hydro-Quebec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Move completed release summaries to `CHANGELOG.md`.
- Move durable evidence and long reasoning to `NOTES.md`.
- Move runbooks, cost strategy, and maintenance backlogs to focused docs.
- If this file grows past roughly 250 lines again, compact before adding more detail.
