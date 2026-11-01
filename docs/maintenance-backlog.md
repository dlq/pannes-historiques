# Maintenance Backlog

This backlog holds durable cleanup opportunities that are too detailed for `PLANS.md`.

## Simplify/Refactor Backlog

An adversarially verified simplify/refactor review on 2026-07-11 confirmed 47 behavior-preserving opportunities. The low-risk dead-code and dedup subset is applied and merged into `main` across services, views, sheet views, db, geocoding, hydro, web helpers, and client JS duplicates; net change was about `-100` lines with the full suite green.

Deferred, in rough priority:

- Local commit `f6e15a8`: `address_domain_sheet_context` selects each domain once and reuses `radius_km`, preserving radius-filtered sidebar versus wider map matches, expired-plan filtering and separate history inputs. Committed locally; not deployed.
- Server dedup still deferred: `web.py` `require_*_route` guard boilerplate across 13 routes; treat authorization-boundary refactoring as deliberate work.
- Measured: [browser module baseline](browser-module-baseline.md); retain native modules unless a controlled comparison demonstrates a benefit.
- Done and merged into `main`: `disclosures.py` shared `_DISCLOSURE_EVENT_INSERT` constant across xlsx/pdf ingest, and `_regional_metric_base` helper deduping the province/admin ternary across the three regional-metric parsers. Key order was preserved because those rows are `json.dumps`'d whole into `disclosure_annual_metrics`.
- Deployed from `dead987` on 2026-11-01: shared `ph_metric`, `ph_status_line` and `ph_date_tile` macros replace the repeated blocks. A before/after rendering comparison preserves semantic HTML for ten FR/EN overview/domain fragments; browser regression covers existing map/sheet interactions.
- Worker follow-up in `src/worker.js`: hold until after beta/cost work because this is a deployed hot path. Candidate cleanup includes `callContainer*`/`fetchContainer*` POST/bytes boilerplate, `markDisclosure*` helpers, repeated map-rows-to-prepared-statements-to-`batchInChunks` skeletons, and eventual module splitting of the large Worker file.
- Local `codebase-cleanup`: shared post-location search tail and public durable JSON transport in `services.py`, shared Worker JSON response helper, and clearer browser map helper/palette names. Public contracts and failure-versus-empty behavior preserved; uncommitted and undeployed. The protected runtime client allowlist is unchanged.
- Judgment calls with higher effort/risk: merge near-identical `_operational_map_item` and `_previous_operational_map_item`; reduce `hydro.py` `*_if_changed` scaffold duplication; reconcile duplicated month/weekday tables between Python and JS.
- Explicitly do not change as simple cleanup: archive-summary windows/largest/latest shaping intentionally exists in both `services.py` and `src/worker.js` for Python container fallback versus Worker D1 paths.

## Behavior-Changing Bugs To Fix Deliberately

- Deployed from `dead987` on 2026-11-01: geolocation denied, unavailable, timeout and absent-API states show the existing localized messages; controls recover and address search remains usable.
- Verified in the same cleanup: the asset-version generator updates browser import tokens and its check guards drift. The offline-only service-worker cache is bumped for the bilingual retry asset; app/search responses remain network-only.

## Bounded Audit Follow-Up

- Local commit `7369073` fixes correct language accessible names, date/action contrast and inline-link styling; the [axe audit](accessibility-audit.md) reports zero violations across 44 fixture states, with manual review still required.
- The [Cloudflare configuration review](operations.md#edge-injected-html-and-analytics-configuration) confirms RUM enabled with EU exclusion. Local privacy copy now discloses it; no account setting was changed.
- The [archive reader/writer inventory](archive-storage-dependencies.md) is complete. Storage sizes/query plans/recovery and verified replay remain open; no production data was changed.

## Testing Strategy

- Keep Python tests, Node tests, module-boundary checks, template linting, and Biome checks green for every release slice.
- `v0.4.3`: Worker/runtime-policy tests cover configurable container host checks, private cost-health endpoints, and runtime markers.
- `v0.4.4`: GitHub Quality enforces a combined Python coverage floor; the complete desktop/mobile browser regression suite runs on pull requests, after changes reach `main`, and on manual dispatch; focused browser and contract tests remain the default for feature work.
- `v0.4.5`: route/header tests, machine-readable metadata, public/private route documentation, and security headers shipped; preserve them as public-surface regressions.
- `v0.4.6`: archive-health tests for stale ingestion-run cleanup, latest-row grouping, archive-bin completeness metrics, and retention behavior shipped; extend them before any compaction/offload migration.
- `v0.4.7`: regional continuity-index detail and no-score terminology are covered by Python and desktop/mobile browser regressions.
- Cross-field coherence: assert displayed figures against each other, not only against the query that produced them. Tests that check a number equals what its query returned cannot catch a query answering the wrong question, which is how the Archive window shipped a territory count under an outage heading. See the guard below.
- `v0.4.8`: cursor-aware archive freshness, protected-runtime retirement, cost decision, and autocomplete abuse protection shipped and are covered.
- `v0.4.9`: aggregate-schema, expiry, classification, private-readout, browser-payload, and public-nonexposure tests are implemented; preserve them through deployments and routine expiry/review; the eight-week decision is complete.
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
