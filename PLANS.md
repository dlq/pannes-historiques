# Plan: Hydro-Quebec Outage History App

Date: 2026-04-25
Last updated: 2026-08-21

This is the active execution plan. Keep detailed evidence and research notes in `NOTES.md`, completed release history in `CHANGELOG.md`, operational runbooks in `docs/operations.md`, and long maintenance backlogs in `docs/maintenance-backlog.md`.

## Current State

- Current shipped release: `v0.4.8`, cost and operational guardrails, released 2026-08-14.
- Tagged-release deployment: Worker version `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`, deployed 2026-08-14 from tagged release commit `f6df621` with the `pannes-historiques-pannescontainer:e6fe9a87` image.
- Latest production deployment: post-release `main` commit `e212841`, deployed 2026-08-21 as Worker version `6aebc224-ee26-4be4-b7a1-a9add596f98a` with container image digest `sha256:f7e3b21ecabb44ced653c8c5c7ad263cfd8d64ce49495e76a865b4977111e985`. Production serves the canonical 1200 x 630 social preview and large-card metadata; the live image matches the committed asset byte for byte.
- Ingestion incident 2026-07-15 to 2026-07-20: scheduled Hydro ingestion failed every 30 minutes for five days while the site returned `200` and served stale data. Cause was the durable collection path storing payload files without registering the `raw_snapshots` row the Worker's `/internal/raw-snapshot` callback resolves through. Fixed and verified: run 3630 completed `ok` and snapshots are current again. Two plausible-but-wrong hypotheses were ruled out by testing rather than by correlation — container ephemerality, and the `v0.4.3` CodeQL path-hardening, whose lookup was exercised directly against a real file and resolves correctly.
- Monitoring gap this exposed: the only health surface was token-protected and pull-based, so nothing observed the failure. `GET /api/health/ingestion` now returns `503` when ingestion is stale or failing. The `Ingestion health monitor` GitHub Actions workflow probes it twice hourly.
- That probe now also fails when the served archive summary contradicts itself, after the Archive report spent months showing a count of municipalities as a count of outages while every health surface reported green. Freshness monitoring cannot see a figure that is current and wrong; coherence monitoring can.
- Current implementation line: the `v0.4.9` privacy-preserving usage-evidence candidate is complete locally and retains ADR 0006's component-metric decision. The shipped/tagged release remains `v0.4.8`; migration `0012`, the edge rate rule, and production verification remain release gates. See `docs/current-snapshot.md` for the concise code/deployment distinction.
- Current frontend: one full-bleed MapLibre GL map plus a single sheet. The sheet owns search, domain navigation, address overview, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Current data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Quebec payloads, disclosure metadata, and runtime map-context layers.
- Current container role: Flask/Jinja shell rendering, local-compatible fallback paths, and a baked SQLite snapshot. Container-local writes are ephemeral and must not become production state.
- Current cost posture: hybrid Worker/D1/R2 reads and the low-cost mode guardrail limit container exposure, but container-backed browser/search paths still need measured usage and cost evidence before any broader rendering migration.
- Current public API posture: route stability tiers are now written down in `docs/api-posture.md` and summarized for machine readers at `/llms.txt`. Every JSON route is explicitly `unstable`; the first `stable` contract is still deferred to `v0.5.0`.
- Resolved mobile detail-close flake: fixed in `v0.4.5` and guarded by regression tests. Keep the detailed root-cause notes in `NOTES.md` rather than this active plan.
- Current contribution posture: contributor docs and a scoped issue map exist. GitHub Quality enforces Python branch coverage, while full Playwright runs on pull requests, `main`, and manual dispatch.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; the broader `r/quebec` post remains blocked by that community's account-activity requirement.
- Address-specific dispute boundary: pannes.ca can show retained observations near an address, not certify service at that residence. Direct certification requests belong with Hydro-Quebec's official past-outage form.

## Roadmap

Completed release history lives in `CHANGELOG.md`; durable investigation details live in `NOTES.md`. Active execution is closing the `v0.4.9` migration, edge-rule, and production-verification gates for the locally complete privacy-preserving usage-evidence candidate. The `v0.4.7` evidence and no-score decision are preserved in ADR 0006 and `NOTES.md`.

### `v0.4.8`: Cost And Operational Guardrails

Make the public-read path measurable, bounded, and trustworthy before collecting product-use evidence or committing to a stable public API.

- Cursor-aware materialized archive reads and ingestion-health failure are implemented: a source-cursor mismatch or a missing summary for a non-empty archive rebuilds on the next Archive request and makes the health probe unhealthy. Focused tests cover matching, mismatch, and missing cursors. Verify the live transition after the next deployment.
- Protected container-to-Worker calls are retired. The Flask container now calls only public `map-context` and `previous-archive-summary` reads; all former protected reads and writes use local-compatible fallbacks directly. The invalid proxy-token path and trusted-host variable are removed, and focused Node/Python tests prevent a protected endpoint from being reintroduced as a container dependency.
- The authenticated Cloudflare dashboard review confirms sustained container and Durable Objects usage, Worker requests without Worker errors, and D1/R2 storage posture. It does not attribute container time to a route or wakeup, so retain the hybrid shell and do not change idling from aggregate billing evidence. The billing artifact and account-specific figures remain excluded from the repository. Use route/runtime markers and representative timings to choose one named public-read migration in a later slice.
- The `GET /autocomplete` zone rule is active and the browser has a tested `429` response. The Free plan supports a 10-second window only, so `autocomplete per IP` blocks an IP after 10 matching requests in 10 seconds for 10 seconds. The rollback procedure is documented in `docs/operations.md`.
- Establish a monthly D1-size review against the 3.5 GB compaction trigger; record the measured size and expected headroom in the dated cost review.

Exit evidence is complete. `v0.4.8` deployed as Worker `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`; public homepage, Archive, autocomplete, and ingestion-health probes returned `200`. The health payload was healthy with zero consecutive failures and no archive-summary problems, which verifies the cursor-aware served-summary path.

### `v0.4.9`: Privacy-Preserving Product Usage Evidence

Measure aggregate use of substantive functions only after the operational collection boundary is explicit.

- Implemented on the `privacy-usage-evidence` branch: a fixed UTC daily aggregate schema, separate human/non-human interaction counts, and a daily collection-status heartbeat. Counts are interactions, never people or unique visitors.
- Implemented: 90-day expiry on the existing maintenance schedule. No address, query string, coordinate, IP address, user identifier, raw interaction log, user agent, or browser fingerprint is persisted.
- Implemented: allowlisted current, planned, Archive, DAI/Context, address-answer, and comparison actions. The browser sends only feature/action, omits the referrer and credentials, and respects GPC/DNT; the Worker separately classifies obvious automation and missing interaction signals.
- Implemented: token-protected operational readout with metric definitions, collection coverage, retention status, and no public usage-data response surface. The public endpoint is write-only.
- Deployment gate: apply migration `0012_usage_evidence.sql` and activate the documented `usage evidence per IP` edge rate rule before enabling collection in production.
- Cloudflare Browser Insights remains disabled. Revisit it only if a specific question cannot be answered by the bounded aggregates; enabling it would require a new privacy/CSP/retention decision.
- After eight complete weekly observations, record a written continue/change/stop decision. It must distinguish feature demand from infrastructure traffic and must not infer audience size or individual behavior.

Implementation exit evidence: schema and expiry are test-covered; the private readout proves no public exposure; classification and browser payload boundaries are test-covered. Release exit still requires the migration, edge rule, production smoke checks, and the later eight-week decision record in `NOTES.md`.

### `0.5.x`: Public Data Product And Analytical Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

Entry gates: ADR 0006's no-score guard remains enforced; `v0.4.8` exit evidence is complete; `v0.4.9` has completed its bounded lifecycle and decision record; a 14-day observation window shows healthy ingestion, cursor-fresh archive summaries, and no unexplained archive-completeness regression; and the autocomplete rate rule is live before a stable API expands address-related traffic.

- `v0.5.0`: historical data API contract with explicit public/private boundaries, response schemas, provenance/freshness metadata, rate limits, docs, and tests.
- `v0.5.1`: public API consumer experience: examples, sample payloads, compatibility notes, caching/rate guidance, and contract tests that contributors can run locally.
- `v0.5.2`: regional analytics and research views from bounded, materialized data products, with conservative caveats, usage-informed prioritization, and no reliability-ranking overclaims.
- `v0.5.3`: source expansion and geocoder reliability after public contracts exist. Start with a municipal-distributor referral/source-discovery pass for Hydro-Sherbrooke: identify the authoritative live-outage map and address-specific historical-request path, and label it as external coverage. Do not scrape or imply archived Hydro-Sherbrooke coverage unless access terms, data quality, and retention are verified.

Saved areas, saved-area notifications, and web push notifications are deferred out of the concrete train until repeated user demand and a privacy/cost model justify them.

## Testing Strategy

- Keep Python tests, Node tests, module-boundary checks, template linting, and Biome checks green for every release slice.
- `v0.4.3`: Worker/runtime-policy tests cover configurable container host checks, private cost-health endpoints, and runtime markers.
- `v0.4.4`: GitHub Quality enforces a combined Python coverage floor; the complete desktop/mobile browser regression suite runs on pull requests, after changes reach `main`, and on manual dispatch; focused browser and contract tests remain the default for feature work.
- `v0.4.5`: route/header tests, machine-readable metadata, public/private route documentation, and security headers shipped; preserve them as public-surface regressions.
- `v0.4.6`: archive-health tests for stale ingestion-run cleanup, latest-row grouping, archive-bin completeness metrics, and retention behavior shipped; extend them before any compaction/offload migration.
- `v0.4.7`: regional continuity-index detail and no-score terminology are covered by Python and desktop/mobile browser regressions.
- Cross-field coherence: assert displayed figures against each other, not only against the query that produced them. Tests that check a number equals what its query returned cannot catch a query answering the wrong question, which is how the Archive window shipped a territory count under an outage heading. See the guard below.
- `v0.4.8`: cursor-aware archive freshness, protected-runtime retirement, cost decision, and autocomplete abuse protection shipped and are covered.
- `v0.4.9`: aggregate-schema, expiry, classification, private-readout, browser-payload, and public-nonexposure tests are implemented; preserve them through deployment and the observation period.
- `v0.5.x`: add API contract, schema, freshness/provenance, rate-limit, analytical-summary, parser, and geocoder tests as each slice lands.

### Regression guard: gated runtime endpoints (2026-08-05)

The Contexte tab was empty for seven weeks and nobody noticed. `34fee84`
(2026-06-17) gated both `GET /map-context` and `GET /previous-archive-summary`;
the container cannot authenticate, so both broke that day. `7300355`
(2026-06-20) ungated `previous-archive-summary` while working on the archive,
which fixed Archive and left Contexte broken. The same bug was found and fixed
once already, on a sibling endpoint, without anyone checking the siblings.

Why every existing safeguard missed it:

- The failure rendered as plausible content ("Aucun document publié disponible"), not as an error. A broken data path and a genuine empty result were indistinguishable.
- The map still drew region outlines from the static geometry asset, so the tab looked alive.
- The Worker logged `Ok`: returning `404` to an unauthorized caller is correct behaviour. Nothing looked wrong from either side.
- `runtime-policy.test.js` asserted that the gate list contained what the gate list contained. That tautology passes regardless of whether the container can actually reach the endpoint.

Rules that follow from this:

1. Never let a failed read render as an authoritative empty state. Distinguish "the lookup failed" from "there is nothing", and say which. Applied to the published-context builders; apply it to any new remote read.
2. Never cache a failed read. `_cached_context` without `ttl_seconds` caches forever, so one transient failure becomes permanent. Pass a TTL and a `should_cache` predicate.
3. Adding an endpoint to `PRIVATE_RUNTIME_ENDPOINTS` requires proving the container can still reach it, because the container currently cannot authenticate at all.
4. Prefer end-to-end assertions over policy-table assertions. A test that reads the same constant the code reads proves nothing about reachability.
5. When fixing a broken endpoint, check its siblings for the same defect before closing the work.

### Regression guard: figures that contradict each other (2026-08-05)

The Archive report showed a count of municipalities where it said outages. The
`1 an` cell read `1 139` against 234 187 retained outages, and the customer sum
beside it read 22 290 686 against roughly 4.5 million Hydro-Québec customers.
Montréal's own row read 16 785 outages — a part larger than the stated whole,
on the same screen, for months.

Why every existing safeguard missed it:

- Every test asserted a number equalled what its query returned, and every query returned exactly what it was asked for. A query answering the wrong question passes all of them.
- The payload field was named `areas`. The other summary path filled that same key with a genuine outage count, so the name was honest for one caller and misleading for the other.
- Local development runs the honest path, so local figures looked plausible while production did not. Any check performed only locally would have confirmed the bug as correct.
- Nothing compared the figures to each other. Each was individually defensible; only their relationship was impossible.

Rules that follow from this:

1. Assert displayed figures against each other, not only against their source query. Self-comparison needs no expected values and no thresholds, so it survives data changes.
2. A field name is part of the contract. If two code paths fill the same key, they must compute the same quantity — enforced for the archive windows by a test.
3. Run coherence checks against real data, not only fixtures. Fixtures guard the code; only production data catches the data. These run inside `GET /api/health/ingestion`.
4. Prefer invariants that cannot false-positive by construction (nested sets, part-versus-whole) over tuned plausibility bands, which go stale and get muted.
5. State what a figure counts when it is not obvious. A sum over outages is not a count of people, and the label has to say so.

Routine command details live in `docs/contributing.md`; production and deploy checks live in `docs/operations.md`.

## Current Risks And Open Questions

- The container-to-Worker authentication path is deliberately retired: Cloudflare did not deliver a usable token or internal Worker identity, so Flask now calls only two public materialized reads and uses local-compatible fallbacks for former protected calls. Do not add a protected runtime endpoint as a container dependency without a separately designed, tested credential path.
- A private cost review establishes a threshold-crossing signal but not route attribution. The authenticated dashboard measurement supports retaining the hybrid shell; obtain route/runtime evidence before changing container idling or selecting the next public-read migration.
- Ordinary public reads should keep moving toward Worker/static/D1/R2 paths, but the right migration boundary is not yet proven.
- Archive health is deployed: stale run expiry, 30-day terminal-run retention, latest-row de-duplication, and classified archive-bin completeness. Keep monitoring the public ingestion-health endpoint and private completeness audit.
- Cursor-aware archive-summary checks are deployed and production-verified: the served summary was healthy with no cursor or coherence problem after the `v0.4.8` release. The existing payload-shape guard still handles format drift separately.
- D1 measured `1,806,331,904` bytes (about `1.81 GB`) on 2026-08-08. The first compaction trigger is `3.5 GB`; a migration must begin before the 5 GB included-storage threshold. `v0.4.8` establishes the monthly measurement cadence. Raw R2 payloads, geometry, archive bins, and snapshot metadata remain out of scope for automatic deletion. See ADR 0005.
- Browser proof gaps remain: real-device geolocation/permission recovery, visible freshness/change cues, dense live-data readability, and practical keyboard/screen-reader checks.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes; the remaining proof gaps are ongoing maintenance work, not an unfinished `v0.4.5` release item.
- First-party JS modules improve maintainability but increase module requests; measure on Cloudflare before assuming native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and visually fragile; keep checking overlap, horizontal scrolling, and dense-row readability.
- Bad in-app URLs and unhandled Flask exceptions still need minimal branded 404/500 pages.
- SEO announcement-readiness follow-up: consider `noindex,follow` for user-entered address/current-location result pages so arbitrary searches do not become indexable landing pages. Absolute social-image URLs, large-card metadata, and French/English/`x-default` alternates are implemented and production-verified.
- Address queries are capped in the application and protected at the edge by the active Cloudflare Free-plan `autocomplete per IP` rule: 10 matching requests per IP in 10 seconds trigger a 10-second block. Browser debouncing is not treated as an abuse control.
- Usage collection must not deploy before migration `0012` and the `usage evidence per IP` edge rule are active; otherwise the write-only endpoint would either fail every interaction or expose an unbounded D1 write path.
- OpenFreeMap Liberty still includes non-Quebec labels at some zoom levels; solve only if it materially affects analytics or saved-area-adjacent workflows.
- Do not speculate about Hydro-Quebec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Move completed release summaries to `CHANGELOG.md`.
- Move durable evidence and long reasoning to `NOTES.md`.
- Move runbooks, cost strategy, and maintenance backlogs to focused docs.
- If this file grows past roughly 250 lines again, compact before adding more detail.
