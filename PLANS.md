# Plan: Hydro-Quebec Outage History App

Date: 2026-04-25
Last updated: 2026-08-08

This is the active execution plan. Keep detailed evidence and research notes in `NOTES.md`, completed release history in `CHANGELOG.md`, operational runbooks in `docs/operations.md`, and long maintenance backlogs in `docs/maintenance-backlog.md`.

## Current State

- Current shipped release: `v0.4.7`, regional reliability framing and explicit component metrics, released 2026-08-08.
- Last recorded production deployment: Worker version `f79b2eac-a1f8-4ade-93cf-3bcc08d47420`, deployed 2026-08-08 from `main` commit `9d68829` with the Search Console URL consolidation and MapLibre startup/performance follow-ups. Subsequent commits are not a release claim until separately deployed and verified.
- Ingestion incident 2026-07-15 to 2026-07-20: scheduled Hydro ingestion failed every 30 minutes for five days while the site returned `200` and served stale data. Cause was the durable collection path storing payload files without registering the `raw_snapshots` row the Worker's `/internal/raw-snapshot` callback resolves through. Fixed and verified: run 3630 completed `ok` and snapshots are current again. Two plausible-but-wrong hypotheses were ruled out by testing rather than by correlation — container ephemerality, and the `v0.4.3` CodeQL path-hardening, whose lookup was exercised directly against a real file and resolves correctly.
- Monitoring gap this exposed: the only health surface was token-protected and pull-based, so nothing observed the failure. `GET /api/health/ingestion` now returns `503` when ingestion is stale or failing. The `Ingestion health monitor` GitHub Actions workflow probes it twice hourly.
- That probe now also fails when the served archive summary contradicts itself, after the Archive report spent months showing a count of municipalities as a count of outages while every health surface reported green. Freshness monitoring cannot see a figure that is current and wrong; coherence monitoring can.
- Current implementation line: `v0.4.7` implements the component-metric decision recorded in ADR 0006. The next active product slice is `v0.4.8` privacy-preserving usage evidence. See `docs/current-snapshot.md` for the concise code/deployment distinction.
- Current frontend: one full-bleed MapLibre GL map plus a single sheet. The sheet owns search, domain navigation, address overview, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Current data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Quebec payloads, disclosure metadata, and runtime map-context layers.
- Current container role: Flask/Jinja shell rendering, local-compatible fallback paths, and a baked SQLite snapshot. Container-local writes are ephemeral and must not become production state.
- Current cost posture: hybrid Worker/D1/R2 reads and the low-cost mode guardrail limit container exposure, but container-backed browser/search paths still need measured usage and cost evidence before any broader rendering migration.
- Current public API posture: route stability tiers are now written down in `docs/api-posture.md` and summarized for machine readers at `/llms.txt`. Every JSON route is explicitly `unstable`; the first `stable` contract is still deferred to `v0.5.0`.
- Resolved mobile detail-close flake: fixed in `v0.4.5` and guarded by regression tests. Keep the detailed root-cause notes in `NOTES.md` rather than this active plan.
- Current contribution posture: contributor docs and a scoped issue map exist. GitHub Quality enforces Python branch coverage, while full Playwright runs on `main` and by manual dispatch.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; the broader `r/quebec` post remains blocked by that community's account-activity requirement.
- Address-specific dispute boundary: pannes.ca can show retained observations near an address, not certify service at that residence. Direct certification requests belong with Hydro-Quebec's official past-outage form.

## Roadmap

Completed release history lives in `CHANGELOG.md`; durable investigation details live in `NOTES.md`. Active planning starts at `v0.4.8`. The `v0.4.7` evidence and no-score decision are preserved in ADR 0006 and `NOTES.md`.

### `v0.4.8`: Privacy-Preserving Product Usage Evidence

Measure whether people reach and use the site's substantive functions before investing further in product expansion.

- Define aggregate feature-use metrics for current outages, planned interruptions, Archive, DAI/Context, address answers, and comparison. Counts are interactions, not people or unique visitors.
- Record only bounded daily aggregates. Do not persist addresses, query strings, IP addresses, user identifiers, raw interaction logs, or browser fingerprints.
- Revisit Cloudflare Browser Insights before or during this slice. Keep it disabled if it remains only broad traffic telemetry; if it is useful enough to enable, first reconcile CSP, the About-page "no analytics trackers" privacy copy, and the usage-retention policy.
- Exclude or separately classify obvious scanner and bot traffic so route probes do not look like product demand.
- Add a private operational readout with metric definitions, collection-status indicators, and a documented retention policy.
- Test event classification and ensure the public response surface never exposes operational usage data.

### `0.5.x`: Public Data Product And Analytical Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

Entry gates: `v0.4.7` must dispose of the Hydro Score concept without unsupported reliability claims; `v0.4.8` must define and test its bounded aggregate-data lifecycle; a dated cost review must confirm the public-read posture; ingestion health and archive completeness must be operating normally; and `/autocomplete` needs an edge rate limit before a stable API expands address-related traffic.

- `v0.5.0`: historical data API contract with explicit public/private boundaries, response schemas, provenance/freshness metadata, rate limits, docs, and tests.
- `v0.5.1`: public API consumer experience: examples, sample payloads, compatibility notes, caching/rate guidance, and contract tests that contributors can run locally.
- `v0.5.2`: regional analytics and research views from bounded, materialized data products, with conservative caveats and no reliability-ranking overclaims.
- `v0.5.3`: source expansion and geocoder reliability after public contracts exist. Start with a municipal-distributor referral/source-discovery pass for Hydro-Sherbrooke: identify the authoritative live-outage map and address-specific historical-request path, and label it as external coverage. Do not scrape or imply archived Hydro-Sherbrooke coverage unless access terms, data quality, and retention are verified.

Saved areas, saved-area notifications, and web push notifications are deferred out of the concrete train until repeated user demand and a privacy/cost model justify them.

## Testing Strategy

- Keep Python tests, Node tests, module-boundary checks, template linting, and Biome checks green for every release slice.
- `v0.4.3`: Worker/runtime-policy tests cover configurable container host checks, private cost-health endpoints, and runtime markers.
- `v0.4.4`: GitHub Quality enforces a combined Python coverage floor; complete desktop/mobile browser regression runs after changes reach `main` or on manual dispatch; focused browser and contract tests remain the default for feature work.
- `v0.4.5`: route/header tests, machine-readable metadata, public/private route documentation, and security headers shipped; preserve them as public-surface regressions.
- `v0.4.6`: archive-health tests for stale ingestion-run cleanup, latest-row grouping, archive-bin completeness metrics, and retention behavior shipped; extend them before any compaction/offload migration.
- `v0.4.7`: regional continuity-index detail and no-score terminology are covered by Python and desktop/mobile browser regressions.
- Cross-field coherence: assert displayed figures against each other, not only against the query that produced them. Tests that check a number equals what its query returned cannot catch a query answering the wrong question, which is how the Archive window shipped a territory count under an outage heading. See the guard below.
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

- The container cannot authenticate to the Worker at all. Confirmed 2026-08-05 by logging the gate outcome for the container's own request: `got_token_header: false`, `cf_worker: null`, while `has_env_token: true` on the Worker. `envVars` does not deliver `PANNES_OPERATION_TOKEN` to the container process, and Cloudflare does not stamp `cf-worker` on the internal hop, so `isTrustedContainerRuntimeProxyRequest` is effectively dead code. Any runtime endpoint listed in `PRIVATE_RUNTIME_ENDPOINTS` is unreachable from the container. Five endpoints the container calls are still gated and therefore still return `404` to it, verified against production 2026-08-05: `operational-map-layers`, `previous-groups`, `previous-map-layers`, `query-count`, `status`. Unlike `/map-context` these do not produce a visible defect: verified 2026-08-05 that the Current sheet renders 87 outages with the newest at `13:55`, exactly matching the live D1 feed, because those paths fall back to the public `/api/durable/*` reads. The practical impact today is redundant work and a dead auth path, not stale user-facing data. `tests/runtime-policy.test.js` pins them as a shrink-only ratchet. Fix the token delivery before gating any endpoint the container needs, and do not assume the trusted-proxy path works.
- Container-backed search/render paths still need measured cost evidence; the trusted Worker host is configured in `wrangler.jsonc`, not hardcoded in runtime policy.
- Ordinary public reads should keep moving toward Worker/static/D1/R2 paths, but the right migration boundary is not yet proven.
- Archive health is deployed: stale run expiry, 30-day terminal-run retention, latest-row de-duplication, and classified archive-bin completeness. Keep monitoring the public ingestion-health endpoint and private completeness audit.
- The materialized archive summary has no staleness check and needs one. `municipalArchiveSummary` in `src/worker.js` returns whatever is stored in `municipal_archive_summaries` and only falls through to a rebuild when the row is absent, so a stored summary is served indefinitely. Nothing expires it; only the archive backfill cron refreshes it. If that cron stalls, the Archive tab keeps serving old counts and dates while every surface reports healthy — the same silent-staleness shape as the 2026-07-15 ingestion incident, where the site returned `200` for five days on stale data. Encountered concretely on 2026-08-05: an ordering fix in the summary query appeared not to deploy because the pre-fix summary was still being served, and clearing the single derived row (`DELETE FROM municipal_archive_summaries WHERE summary_key='previous_archive_summary'`) made it rebuild immediately and correctly. Two candidate fixes, both cheap: compare the stored `source_cursor` against the current `bispoly` cursor and rebuild on mismatch, or treat `generated_at` older than a threshold as stale. Prefer the cursor comparison, since it also invalidates whenever the summary query itself changes. Fold the result into `/api/health/ingestion` so a stalled refresh is alertable rather than invisible. Partially addressed on 2026-08-05: `municipalArchiveSummary` now rejects a stored payload whose windows lack the `outages` key (`isUsableArchiveSummary` in `src/archive-summary.js`) and falls through to a rebuild, so a payload *shape* change heals itself on the first request after deploy. That guard only catches shape drift — a summary of the right shape but stale *contents* is still served indefinitely, so the cursor comparison above is still needed.
- D1 measured `1,806,331,904` bytes (about `1.81 GB`) on 2026-08-08. The first compaction trigger is `3.5 GB`; a migration must begin before the 5 GB included-storage threshold. Raw R2 payloads, geometry, archive bins, and snapshot metadata remain out of scope for automatic deletion. See ADR 0005.
- Browser proof gaps remain: real-device geolocation/permission recovery, visible freshness/change cues, dense live-data readability, and practical keyboard/screen-reader checks.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes; the remaining proof gaps are ongoing maintenance work, not an unfinished `v0.4.5` release item.
- First-party JS modules improve maintainability but increase module requests; measure on Cloudflare before assuming native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and visually fragile; keep checking overlap, horizontal scrolling, and dense-row readability.
- Bad in-app URLs and unhandled Flask exceptions still need minimal branded 404/500 pages.
- SEO announcement-readiness follow-up: consider `noindex,follow` for user-entered address/current-location result pages so arbitrary searches do not become indexable landing pages. Absolute `og:image` URLs and French/English/`x-default` alternates are implemented on `main`; verify them in the next production deployment.
- Address queries are capped in the application, but configure a per-IP Cloudflare rate rule for `GET /autocomplete` before exposing a stable public API; browser debouncing is not an abuse control.
- OpenFreeMap Liberty still includes non-Quebec labels at some zoom levels; solve only if it materially affects analytics or saved-area-adjacent workflows.
- Do not speculate about Hydro-Quebec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Move completed release summaries to `CHANGELOG.md`.
- Move durable evidence and long reasoning to `NOTES.md`.
- Move runbooks, cost strategy, and maintenance backlogs to focused docs.
- If this file grows past roughly 250 lines again, compact before adding more detail.
