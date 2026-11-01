# Westmount Integration Plan

Proposed: 2026-11-01. See the [active plan](../../PLANS.md) for current priorities and execution status.

Status: planning only. This authorizes no collection schedule, outreach, schema change, public UI change or production deployment. The existing `0.5.x` entry gates remain; this plan develops the source-expansion slice rather than declaring those gates complete. Westmount is the first proposed additional distributor. Sherbrooke remains deferred pending freshness and supported-access clarification.

## Outcome and scope

Integrate Hydro-Westmount into the existing map and sheet, first for current network-block status and then, separately, for retained history. Preserve the current four domains and search flow; add source labels, per-provider coverage/freshness and the minimum explanatory copy needed to avoid misleading answers. No redesign, social feed, new geocoder, reliability score or province-wide completeness claim.

A source feature is a **network block**, not a unique outage incident or a household. Two blocks affected by one upstream failure must not become two claimed independent outages. Historical Westmount coverage begins when valid production collection starts, not at the first timestamp found in a row and not at Hydro-Québec's archive start.

## Evidence, assumptions and open questions

Observed during the November 1 discovery pass:

- The [official Westmount outage page](https://westmount.org/en/services/hydro-westmount/power-outages) links a public ArcGIS map. Its current configuration identifies `https://cartes.westmount.org/server/rest/services/InfoPanneCitoyen/FeatureServer/0` as its status layer. Metadata, count/statistics, filtered outage query and one polygon sample worked without credentials or a manually supplied Referer. Exact provenance/configuration URLs and responses are recorded in `NOTES.md`.
- There were 234 polygon features; all had `CITOY=1`. The official map expression defines 1 = in service, 2 = ongoing outage, 3 = planned interruption. A query restricted to 2/3 succeeded with an empty feature set.
- Fields include `ID`, `OBJECTID`, `CITOY`, `NbClients`, `LastUpdate`, `DtEtat`, `DebutPanne`, `STATUT`, `HRETOURPLAN`, `Message` and `NoteReserve`. No global ID or upstream outage-event identifier was established. Date metadata describes Eastern time with DST; a sample polygon returned in WGS84 when requested with `outSR=4326`.
- Current durable routes/read shaping are specific to Hydro-Québec `bis`/`aip`; current tables have no distributor column. The health decision is also Hydro-specific. Browser MapLibre code already accepts Polygon/MultiPolygon geometry, but service conversion presently drops durable-feed geometry and provider identity.
- D1 was about 3.358 GB in the November 1 operational check, close to the project's 3.5 GB review trigger. Repeating all block geometries/rows at every poll is not an acceptable default archive design.

Unverified; required answers before the corresponding rollout gate:

- Permitted automated access, polling cadence, attribution and raw/history retention/redistribution. Public query access and empty licence fields do not answer these questions. Prepare an enquiry through official channels; sending it is a separate user-authorized action.
- Whether `ID` remains stable across service republishing; how split/merged/removed blocks are represented; actual coverage boundary and overlap with Hydro-Québec. Municipal limits and a union of blocks are candidate geometry, not an automatically authoritative exclusive territory.
- Whether `NbClients` is all subscribers assigned to a block or subscribers actually interrupted, especially for partial outages. The popup only establishes a client count. Do not map it to `customers_affected` or sum it into existing totals until confirmed.
- Whether `LastUpdate` records a source heartbeat, row edit or network-state change; exact meaning/timezone of `DtEtat` and string `DebutPanne`; whether `HRETOURPLAN` is an estimated restoration time; whether status 3 means an interruption occurring now, a future notice or both. The discovery aggregate maximum `LastUpdate` and a raw-feature `LastUpdate` differed by approximately four hours, with the raw sample exceeding the aggregate maximum. Treat that as an unresolved timestamp/query inconsistency; compare raw values, official-map rendering and documented ArcGIS date behavior before applying any timezone offset or using aggregate dates for freshness.
- How a real outage starts, changes and clears. Only healthy rows have been sampled so far. A supported export/documented sample or observed incident is needed to validate nonempty semantics.

## Phase 0 — source contract and feasibility gate

- [ ] Record the access/attribution/retention decision and allowed request cadence, using published terms or an operator response. Record any limits on raw fields, public geometry, retention and redistribution.
- [ ] Capture a dated schema/map-expression baseline, selected-field inventory, service item identity and source endpoint. Use an identifiable pannes.ca user agent; require no forged Referer, borrowed token, private endpoint or browser automation in production.
- [ ] Validate `ID` uniqueness, status meanings, count semantics, source timestamps, planned-state semantics and geometry coverage. Compare one active/planned example with the official map when available; do not manufacture a production incident.
- [ ] Prepare small fixtures for healthy, active, planned, null/unknown values and restoration; label synthetic fixtures as synthetic. Establish which mappings are confirmed versus provisional.
- [ ] Select a collection interval within the source's allowed cadence. Proposed starting point is five minutes, subject to confirmation; this is a product choice, not a claim that Westmount updates every five minutes.

Exit: permitted use and a field contract sufficient for current-status display are documented. Archive permissions and lifecycle semantics are an additional gate for history. If access or semantics are not sufficient, retain an official-map referral and stop before public ingestion.

## Phase 1 — provider contract and durable model

Proposed architecture: a narrowly scoped Worker adapter plus provider-aware read composition. Keep Hydro ingestion/storage behavior intact while introducing the shared identity/coverage envelope required by a second source. Do not force Westmount data into `bis`, `aip` or Hydro-specific `resolved_events`.

- [ ] Define stable provider key `hydro_westmount`, localized display name, official links and source definition version. Qualify all public/internal feature identifiers with provider and source layer/version, e.g. `hydro_westmount:block:<ID>`. Keep raw `OBJECTID` as retrieval provenance, not a promise of stable identity. A reused/split ID must not silently inherit the old block's history.
- [ ] Add additive provider-neutral tables for source state/published generation, immutable snapshot metadata, latest block state, versioned geometries and changed-state observations. Define keys before coding: provider, source, block identity/identity epoch, geometry digest, snapshot/run, parser version and publication generation. History episodes are derived materializations, not replacements for observations.
- [ ] Keep `fetched_at`, `last_successful_validation_at`, `source_updated_at`, first/last observed state and any reported event time separate. UTC storage; retain original raw timestamp values and date metadata for replay. Do not parse a string with ambiguous date/timezone into a confident event time.
- [ ] Normalize `CITOY` to `in_service`, `outage`, `planned_interruption`, `unknown`. Preserve original codes, status and messages. Keep optional count/timing fields nullable. Expose block subscriber counts under an accurate label unless an affected-count interpretation is confirmed.
- [ ] Store geometry once per version; request/convert valid Polygon/MultiPolygon to WGS84, preserving rings, holes and bounds. Validate containment/distance behavior against interior, edge, hole, multipolygon and just-outside points. Do not simplify the canonical geometry; a separate display derivative may be simplified after a measured error check.
- [ ] Define coverage as provider/source capability with `live`, `planned`, `archive` availability and collection start. A cached polygon can remain spatial evidence while live status is stale; these are separate states.
- [ ] Record the chosen multi-provider identity, observation/episode and durable-store decisions in an ADR during implementation; update `docs/architecture.md`. Preserve existing module boundaries; no runtime imports from maintenance scripts/tests.

Expected touchpoints: additive D1 migration after the current migration head (determine the next number at implementation time); new focused `src/westmount-source.js` / provider-store module; `src/worker.js` orchestration; source-neutral read/view contracts. These are proposed filenames, not changes made by this plan.

## Phase 2 — bounded collection, raw preservation and atomic publication

- [ ] Fetch **all block statuses**, not just `CITOY IN (2,3)`. Healthy rows are needed to observe restoration and distinguish zero active areas from missing data. Limit fields to the validated public contract; do not fetch address/building layers, circuit topology fields or customer-level data just because they are accessible.
- [ ] Read attributes on each accepted poll; fetch a geometry baseline and refresh geometry on an agreed daily/version cadence and new IDs. Validate geometry changes for existing IDs too; new-ID detection alone misses edited boundaries. Preserve the source definition and geometry version used for each observation.
- [ ] Use documented ArcGIS pagination/ID batching, deterministic ordering, bounded timeouts/response sizes/pages and limited retry with backoff. Honor `Retry-After`; stop on access denial. Treat JSON `error` objects as failures even with HTTP 200. Detect `exceededTransferLimit`, duplicate IDs, missing pages, unexpected block loss and invalid required fields. The previous count of 234 is a baseline for anomaly review, not a permanent hardcoded invariant. [ArcGIS query reference](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/).
- [ ] A partial/incoherent read never becomes the current generation and never resolves an episode. Record capture start/end, because a paged source need not provide a transactionally frozen snapshot. Check ID-set/count consistency and quarantine unexplained membership changes; never interpret a disappearing block as restored service.
- [ ] Archive exact response pages and relevant public headers, endpoint/query definition, timestamps, source metadata, digests and parser version in R2 under a provider prefix. Use content hashes to deduplicate unchanged bodies; link successful poll/validation metadata to the retained bytes. Store only selected public fields under the approved retention contract; never persist credentials/cookies.
- [ ] Sequence publication: validate complete response set → persist R2 inputs → write immutable D1 snapshot metadata and staged derived rows → atomically advance the provider's generation pointer. Failed writes leave the last good generation visible. Readers pin one generation. Use a provider run lease/idempotency key to prevent overlapping cron/retry publication and duplicate observations; retry/replay converges on the same result.
- [ ] Diff against the last accepted provider generation and write state observations only on meaningful changes; keep a cheap poll heartbeat for successful unchanged responses. Record missing/unknown source state explicitly. Preserve raw/message changes according to the field contract even when the main status code is unchanged.
- [ ] Give Westmount a separately enabled schedule/run name and source summary. It must execute independently of Hydro's container job; either can fail without preventing the other from running. Collection runs directly in the Worker and persists to D1/R2; it must not wake the container or write durable state there.

Cost gate: at a five-minute interval, a single attributes request is about 288 polls/day, inspecting roughly 67,392 block rows/day at the observed 234-block baseline. This is an upstream-work estimate, **not** a D1-write estimate. Measure response bytes, R2 writes/storage, changed rows, geometry sizes and Worker/D1 cost in a representative run. Avoid appending 234 full D1 rows per poll or duplicating geometry per observation. Resolve the current storage headroom concern before adding an unbounded production archive; retain raw data/provenance per ADRs 0003/0005.

## Phase 3 — provider health and private shadow validation

- [ ] Expose per-provider operational status: enabled/shadow/public, latest attempt, last complete validated fetch, source-reported update time, failure streak, last good generation, collection start, and known gaps. Distinguish collector health from upstream freshness confidence: a successful empty response or an unchanged old `LastUpdate` is neither proof of a broken feed nor proof that the upstream producer is fresh.
- [ ] Proposed starting alert policy, to tune against the accepted cadence: stale after three missed five-minute intervals (15 minutes), alert after three failed runs, with a clear no-success state. Do not reuse Hydro's three-hour allowance without a source-specific decision. Scheduled failures must not advance the successful-validation timestamp.
- [ ] Before public activation, a shadow failure is recorded operationally without making public Hydro coverage fail. Once Westmount is public, the aggregate ingestion probe reports failure for a required failed/stale provider while retaining each provider's independent status; one provider's success must never make the other's status green. Add assertions to the existing hourly GitHub health monitor, without creating another monitoring service.
- [ ] Preserve last good features during failures, marked stale with collection time and official referral. Do not turn errors into an empty map/no-outage answer. Add bounded run retention and actionable transition-based monitoring; avoid logging full payloads on every poll.
- [ ] Run a separately authorized private shadow period of at least seven days. Compare a few sampled responses with the official map; record source changes, field completeness, unknown codes, boundary membership, polling success and cost. Healthy-only observations can validate availability but do not validate outage/restoration semantics. Require an actual incident transition or operator-confirmed nonempty examples plus replay evidence before promoting those semantics.

Exit: zero unexplained partial-publication events, no false all-clear in fault tests, replay/idempotency confirmed, documented source freshness limitations and accepted cost/retention budget. A quiet week is not proof of archive completeness or ongoing outage accuracy.

## Phase 4 — current/planned display and address answers

- [ ] Add a provider-aware normalized read contract to compose HQ and Westmount results. Keep `/api/durable/hydro` explicitly Hydro-specific for compatibility; use an explicitly unstable source-neutral route/read composer for combined data. Specify query bounds, pagination, provider filter, generation, coverage, freshness and count units. Do not leak raw upstream fields automatically through `include_raw` or a generic public export.
- [ ] Carry provider-qualified IDs, provider label/link, geometry, freshness, count unit and reported/observed time semantics through `src/durable-read-handlers.js`, `app/services.py`, presentation/sheet view models and map payloads. Remove conversions that silently drop these fields. Extend local fallback and both Python/E2E service fakes; the local HQ SQLite fallback must not silently assert fresh Westmount coverage when durable Westmount reads fail.
- [ ] Display Westmount polygons in existing Current/Planned domains and existing detail cards with a small source label. Keep existing semantic colors. Selection/render/cache/history keys include provider identity. Block counts are labelled affected blocks, not independent outages; unknown customer counts remain unknown and are excluded from combined affected-customer totals. Do not combine unlike count units in one headline.
- [ ] Route planned state according to the validated source contract. Do not invent a future start/end date from status 3, `DtEtat` or `HRETOURPLAN`. If the source provides only a currently planned interruption, present that fact without creating a scheduled event.
- [ ] Address answers use polygon containment before nearby-block distance. Label a match as within a reported affected block, not a certified household outage. Use exact geometry/distance for nearby filtering rather than rejecting a polygon because its centroid is outside the search radius. Coverage outside known provider polygons remains unknown unless a verified service territory supports a stronger answer.
- [ ] Keep provider overlap explicit: a city name or Westmount polygon must not automatically suppress a nearby HQ result or reassign an HQ account. Do not deduplicate across providers from proximity/time alone. On borders or unverified overlaps, show attributed nearby results and coverage uncertainty.
- [ ] Update French/English empty-state, source/provenance, About/SEO and machine-readable coverage copy only where needed. A valid current dataset with no active blocks says no reported interruption in the monitored source at the stated check time. Missing/stale/uncovered says so instead. Do not imply Westmount Archive/Context coverage at live launch.

Exit: desktop/mobile search, all four domains, map selection, details, back navigation and comparison work with HQ-only, Westmount-only, overlap, empty and stale fixtures. No misleading totals or provider loss. Public activation requires the source contract, data and shadow gates; deployment is separately authorized.

## Phase 5 — observed Westmount history, separate release gate

- [ ] Retain block status transitions with successful observation times and capture gaps. Derive **block status episodes**, not claimed utility incident IDs. Adjacent blocks sharing a timestamp are not automatically merged into a unique event. A category change between outage/planned is recorded as a state transition; it must not inflate a count of independent outages.
- [ ] Close a block episode only after explicit in-service observations from complete accepted generations; proposed confirmation is two consecutive healthy polls. Record the first healthy observation as the observed restoration upper bound and the last active observation as the lower bound. The second confirms the transition, not a later invented restoration time. A missing block/error is not a closure. Bootstrap an already-active block as left-censored unless a validated source-reported start time is available.
- [ ] Preserve ambiguity across collection gaps: there may have been an unseen restoration/reopening. Record that limitation; do not infer continuous outage, exact duration, customer-hours or an exact restoration timestamp. Store reported times separately from observation bounds. Rebuild/reprocess derived episodes from raw inputs without rewriting the evidence.
- [ ] Add Westmount history to bounded materialized reads only after metric names, denominators, chronology, retention and gap handling are verified. Do not insert block episodes into the existing HQ municipal archive bins/outage count unchanged. Namespace archive cursors/summaries by provider and metric unit, with explicit collection-start metadata; comparison periods lacking Westmount collection are unavailable, not zero.
- [ ] Keep HQ disclosure documents/regional continuity context identified as HQ. No Westmount reliability comparison or synthetic historical backfill. If a supported official history export is later offered, make that a separate provenance/model decision.

Exit: replay covers outage→healthy, planned→active, changed counts, repeated outage, block split/removal, boundary revisions, stale periods and parser correction. Summary coherence guards prevent blocks, episodes, customers and incidents from being relabelled interchangeably. Archive enablement is independent of current-feed enablement.

## Implementation slices, verification and rollout

Execute one implementation task per dedicated branch/worktree, preserving the current research edits. Proposed reviewable PR sequence:

1. Source contract, fixtures and pure parser/geometry adapter (no production schedule).
2. Additive schema, R2/D1 generation store, idempotent collector, provider health and private enable flag.
3. Explicitly authorized shadow deployment and dated validation/cost report; hold if source/semantics/storage gates fail.
4. Provider-aware durable reads, Python view models, local fallback/fakes and localized existing-map/sheet display; public feature remains disabled until QA passes.
5. Explicitly authorized public live rollout after the shadow/coverage gates.
6. Episode derivation, archive materializations and history UI as a separate validated rollout.

Required checks during implementation:

- Node: parser mappings/nulls/unknown states, ArcGIS HTTP-200 errors, transfer limits/missing pages, reordered IDs, invalid geometry, timezone/DST ambiguity, atomic pointer publication, R2/D1 failures, duplicate/overlapping runs, provider failure isolation and unknown-versus-zero behavior. Use a local D1/R2 integration harness for persistence/transaction behavior; mock-only tests are insufficient for publication guarantees.
- Python: provider/geometry preservation, containment and nearby decisions, accurate count labels, unavailable durable provider behavior and source-aware serialization. Extend `tests/test_stub_service_contract.py` to guard both service fakes.
- Browser: French/English, desktop/mobile, provider labels and unit-aware totals, current/planned/empty/stale/uncovered views, polygon click/focus, address at/beyond a boundary, overlapping HQ data, archive unavailable/start-date copy, navigation/comparison and no console/map regressions. Inspect screenshots at desktop and mobile sizes.
- For changes spanning Python/templates/JS: `uv run pre-commit run --all-files`, `uv run pytest -q`, `node --test tests/*.test.js`, and `npm run test:e2e`. Pre-commit is formatting/lint evidence only. Follow AGENTS.md's per-language checks for narrower slices; run `uv lock` with any pyproject dependency/version edit. No runtime dependency is presumed necessary yet.
- Before a real deployment: dry-run Wrangler, migration rehearsal against local/staging data and upgrade compatibility, replay/idempotency evidence, all relevant CI/CodeQL checks, sampled public/API responses and feature-flag rollback rehearsal. Never expose a test writer or manual collection trigger publicly.

Rollout controls: separate collection, current-display and archive-display flags; default off. Deploy additive schema and compatible readers/writers before enabling collection, then shadow, then current display, then archive. Use a non-production environment or isolated shadow namespace; shadow writes must not contaminate published generations. Maintain HQ behavior throughout.

Rollback: disable Westmount display first to return to HQ plus an honest official-map referral; stop Westmount collection if it causes load/errors. Keep HQ schedules/read paths running. Do not drop tables, delete raw inputs or revert an additive migration during routine rollback. Retain the last good Westmount generation and use compatible readers for restart/replay. Record the outage/coverage gap rather than claiming uninterrupted monitoring.

Definition of done: supported source access documented; provider-specific health actually detects failures; no partial generation can look like zero outages; source/count/time/coverage semantics are accurate; raw replay and bounded storage work; desktop/mobile regressions and CI pass; current and archive activation each have recorded evidence and explicit deployment authorization. Unknown provider event IDs, source heartbeat and affected-customer semantics remain visible limitations until verified.

Rough sequencing: source clarification is the first external dependency. After it is resolved, budget several focused implementation/review slices plus at least one seven-day shadow window; archive semantics may need a longer wait for a representative incident. Do not promise a calendar launch or treat a quiet shadow period as incident-validation evidence.
