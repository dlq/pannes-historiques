# Plan: Hydro-Quebec Outage History App

Date: 2026-04-25
Last updated: 2026-11-01

This is the active execution plan. Keep detailed evidence and research notes in `NOTES.md`, completed release history in `CHANGELOG.md`, operational runbooks in `docs/operations.md`, and long maintenance backlogs in `docs/maintenance-backlog.md`.

## Current State

- Current shipped release: `v0.4.8`, cost and operational guardrails, released 2026-08-14.
- Tagged-release deployment: Worker version `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`, deployed 2026-08-14 from tagged release commit `f6df621` with the `pannes-historiques-pannescontainer:e6fe9a87` image.
- Latest production deployment: code commit `71df235`, deployed 2026-11-01 as Worker version `64b266ed-c679-46a8-9336-3b494d044fc1` with immutable amd64 container digest `sha256:4cc396a6308db3c9601383c5646ae460107392ab0fe1b939f19a3e3c9d7a66d4`. MapLibre 6.15.0, pypdf 6.21.4, exact locked runtime dependencies, desktop/mobile map/search, ingestion health and Archive rendering are production-verified. The daily Archive summary cursor warning remains between refreshes. D1 migrations `0011` through `0013`, the 15-minute Hydro schedule and the `v0.4.9` usage-evidence path remain active. A full rolling-day D1 comparison remains.
- Ingestion incident 2026-07-15 to 2026-07-20: scheduled Hydro ingestion failed every 30 minutes for five days while the site returned `200` and served stale data. Cause was the durable collection path storing payload files without registering the `raw_snapshots` row the Worker's `/internal/raw-snapshot` callback resolves through. Fixed and verified: run 3630 completed `ok` and snapshots are current again. Two plausible-but-wrong hypotheses were ruled out by testing rather than by correlation — container ephemerality, and the `v0.4.3` CodeQL path-hardening, whose lookup was exercised directly against a real file and resolves correctly.
- Monitoring gap this exposed: the only health surface was token-protected and pull-based, so nothing observed the failure. `GET /api/health/ingestion` now returns `503` when ingestion is stale or failing. The `Ingestion health monitor` GitHub Actions workflow probes it hourly.
- That probe also fails when the served archive summary is missing or contradicts itself, after the Archive report spent months showing a count of municipalities as a count of outages while every health surface reported green. A routine cursor lag between 15-minute ingestion and the bounded summary refresh remains visible as a warning without declaring fresh ingestion unhealthy. This classification is deployed and production-verified.
- Current implementation line: the `v0.4.9` privacy-preserving usage-evidence candidate is deployed and retains ADR 0006's component-metric decision. The shipped/tagged release remains `v0.4.8`; the bounded observation period and written continue/change/stop decision remain. See `docs/current-snapshot.md` for the concise code/deployment distinction.
- Current frontend: one full-bleed MapLibre GL map plus a single sheet. The sheet owns search, domain navigation, address overview, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Official-channel decision, 2026-11-01: keep the UI unchanged and retain Hydro-Québec Bluesky, Facebook and newsroom links as a background operational watchlist. No social-feed feature or monitoring automation is planned; source links and the reconsideration condition are recorded in `NOTES.md`.
- Westmount source expansion: detailed phased plan below under “Westmount Integration Plan”; planning only, with source semantics/access, storage, provider health and shadow validation gates before public activation.
- Current data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Quebec payloads, disclosure metadata, and runtime map-context layers.
- Current container role: Flask/Jinja shell rendering, local-compatible fallback paths, and a baked SQLite snapshot. Container-local writes are ephemeral and must not become production state.
- Current cost posture: hybrid Worker/D1/R2 reads and the low-cost mode guardrail limit container exposure. Normal Hydro ingestion follows Hydro-Quebec's documented 15-minute source cadence; cleanup and alerting run on a separate hourly maintenance cron with daily gates for retention work. D1 treats old current/planned marker rows as reconstructable derived data: raw Hydro API payloads stay in R2, `hydro_snapshots` keeps provenance, and migration `0013` rebuilt the derived current-feed tables from their latest versions before adding targeted indexes and keyed runtime summaries. The Archive summary and map-context payload are bounded materializations, not routine request-path relational rebuilds: public reads serve stored summaries, stale Archive summaries are marked stale instead of rebuilt on demand, and routine cost/status output avoids full D1 table-count scans.
- Current public API posture: route stability tiers are now written down in `docs/api-posture.md` and summarized for machine readers at `/llms.txt`. Every JSON route is explicitly `unstable`; the first `stable` contract is still deferred to `v0.5.0`.
- Resolved mobile detail-close flake: fixed in `v0.4.5` and guarded by regression tests. Keep the detailed root-cause notes in `NOTES.md` rather than this active plan.
- Current contribution posture: contributor docs and a scoped issue map exist. GitHub Quality enforces Python branch coverage, while full Playwright runs on pull requests, `main`, and manual dispatch.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; the broader `r/quebec` post remains blocked by that community's account-activity requirement.
- Address-specific dispute boundary: pannes.ca can show retained observations near an address, not certify service at that residence. Direct certification requests belong with Hydro-Quebec's official past-outage form.

## Roadmap

Completed release history lives in `CHANGELOG.md`; durable investigation details live in `NOTES.md`. Active execution is observing the deployed `v0.4.9` usage evidence and the post-release D1 cost changes across full UTC days. The `v0.4.7` evidence and no-score decision are preserved in ADR 0006 and `NOTES.md`.

### `v0.4.8`: Cost And Operational Guardrails

Make the public-read path measurable, bounded, and trustworthy before collecting product-use evidence or committing to a stable public API.

- Cursor-aware materialized archive reads and ingestion-health checks are implemented and production-verified. A source-cursor mismatch makes the served state visibly stale and appears as a health warning; a missing or internally contradictory summary makes the health probe unhealthy. Public requests must not rebuild the half-million-row archive summary. Focused tests cover matching, mismatch, missing cursors, incoherence, and the no-on-demand-rebuild guard.
- Protected container-to-Worker calls are retired. The Flask container now calls only public `map-context` and `previous-archive-summary` reads; all former protected reads and writes use local-compatible fallbacks directly. The invalid proxy-token path and trusted-host variable are removed, and focused Node/Python tests prevent a protected endpoint from being reintroduced as a container dependency.
- The authenticated Cloudflare dashboard review confirms sustained container and Durable Objects usage, Worker requests without Worker errors, and D1/R2 storage posture. It does not attribute container time to a route or wakeup, so retain the hybrid shell and do not change idling from aggregate billing evidence. The billing artifact and account-specific figures remain excluded from the repository. Use route/runtime markers and representative timings to choose one named public-read migration in a later slice.
- The shared interaction-endpoint zone rule is active and the browser has a tested autocomplete `429` response. The Free plan exposes one rule slot with a 10-second window, so `autocomplete and usage per IP` covers `GET /autocomplete` and `POST /api/usage`, blocking an IP after 10 matching requests in 10 seconds for 10 seconds. The rollback procedure is documented in `docs/operations.md`.
- Prioritize D1 storage planning this week: the 2026-11-01 probe reports `3,355,394,048` bytes (3.355 GB), leaving about 145 MB before the 3.5 GB internal review/compaction trigger. This is about 250 MB growth since October 22, roughly another week of headroom at the short observed pace. Measure geometry/bin rollup or R2 offload options while preserving raw inputs, provenance and archive-visible information.
- Production cost/health verification is substantially complete. The rolling 24-hour D1 totals on 2026-09-11 were `37,035,178` rows read and `396,087` rows written; a simple 30-day projection remains comfortably inside the Workers Paid included allowances. Ingestion was fresh, recent GitHub monitors passed, and repeated public map-context and Archive reads served unchanged stored materializations rather than request-time rebuilds. The archive cursor query, which read about `24.0 million` rows across 83 runs despite returning bounded batches, is deployed as independently indexed same-version and newer-version ranges and omits unused raw coordinates. Compare the new query signatures and total reads over a full 24-hour window before considering the hotspot closed. Account-wide Container, Durable Objects, and R2 totals still require the authenticated dashboard review.

Exit evidence is complete. `v0.4.8` deployed as Worker `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`; public homepage, Archive, autocomplete, and ingestion-health probes returned `200`. The health payload was healthy with zero consecutive failures and no archive-summary problems, which verifies the cursor-aware served-summary path.

### `v0.4.9`: Privacy-Preserving Product Usage Evidence

Measure aggregate use of substantive functions only after the operational collection boundary is explicit.

- Implemented on the `privacy-usage-evidence` branch: a fixed UTC daily aggregate schema, separate human/non-human interaction counts, and a daily collection-status heartbeat. Counts are interactions, never people or unique visitors.
- Implemented: 90-day expiry on the existing maintenance schedule. No address, query string, coordinate, IP address, user identifier, raw interaction log, user agent, or browser fingerprint is persisted.
- Implemented: allowlisted current, planned, Archive, DAI/Context, address-answer, and comparison actions. The browser sends only feature/action, omits the referrer and credentials, and respects GPC/DNT; the Worker separately classifies obvious automation and missing interaction signals.
- Implemented: token-protected operational readout with metric definitions, collection coverage, retention status, and no public usage-data response surface. The public endpoint is write-only.
- Activation complete: production D1 migration `0012_usage_evidence.sql` is applied, the shared `autocomplete and usage per IP` edge rule is active and rate-tested, and Worker/container plus D1 smoke checks pass.
- Cloudflare Browser Insights remains disabled. Revisit it only if a specific question cannot be answered by the bounded aggregates; enabling it would require a new privacy/CSP/retention decision.
- Evidence checkpoint, 2026-09-11: 21 active collection days contain `1,824` human-classified interactions, with Archive `843`, current `393`, address answer `333`, planned `128`, Context `116`, and comparison `11`. These are interactions, not people or sessions, and operator testing cannot be separated. September 4 is absent, September 11 was partial at measurement time, and only one fully complete seven-day window exists.
- Continue collection through 2026-10-23 so the September 4 incident gap does not count as a complete observation week. That is the earliest end of eight complete Friday-through-Thursday windows if September 5-11 completes normally. Then record a written continue/change/stop decision that distinguishes feature demand from infrastructure traffic and does not infer audience size or individual behavior.

Activation evidence is complete: schema, expiry, classification, browser payload, private/public access boundary, D1 aggregation, migration, edge rule, and production behavior are verified. The later eight-week continue/change/stop decision record remains in `NOTES.md` before the usage-data lifecycle is considered complete.

### `0.5.x`: Public Data Product And Analytical Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

Entry gates: ADR 0006's no-score guard remains enforced; `v0.4.8` exit evidence is complete; `v0.4.9` has completed its bounded lifecycle and decision record; a 14-day observation window shows healthy ingestion, bounded archive-summary refresh with no unexplained prolonged lag, and no unexplained archive-completeness regression; and the autocomplete rate rule is live before a stable API expands address-related traffic.

- `v0.5.0`: historical data API contract with explicit public/private boundaries, response schemas, provenance/freshness metadata, rate limits, docs, and tests.
- `v0.5.1`: public API consumer experience: examples, sample payloads, compatibility notes, caching/rate guidance, and contract tests that contributors can run locally.
- `v0.5.2`: regional analytics and research views from bounded, materialized data products, with conservative caveats, usage-informed prioritization, and no reliability-ranking overclaims.
- `v0.5.3`: source expansion and geocoder reliability after public contracts exist. Start with a municipal-distributor referral/source-discovery pass for Hydro-Sherbrooke: identify the authoritative live-outage map and address-specific historical-request path, and label it as external coverage. Do not scrape or imply archived Hydro-Sherbrooke coverage unless access terms, data quality, and retention are verified. November 1 endpoint discovery covered all nine municipal networks plus the cooperative: one openly queryable outage layer verified for Westmount; Sherbrooke is a conditional map-internal feed (direct GET 403, map Referer GET 200), not an established public API. Its actual map displayed the same zero-subscriber snapshot more than five hours after the embedded timestamp; revalidation worked, but producer freshness versus last-change-only publication remains unresolved. Hold ingestion pending supported-access and freshness confirmation. Baie-Comeau/Magog HTML-in-JSON pages were rejected as outage-ingestion candidates; no useful structured outage API was found for those two or the remaining six. Exact URLs, semantics and access limitations are in NOTES.md. Next: verify supported access/reuse, event identity, timestamps and nonempty data before implementation; operator API/export enquiries remain unsent.

Saved areas, saved-area notifications, and web push notifications are deferred out of the concrete train until repeated user demand and a privacy/cost model justify them.

## Westmount Integration Plan — proposed, 2026-11-01

Status: planning only. This authorizes no collection schedule, outreach, schema change, public UI change or production deployment. The existing `0.5.x` entry gates remain; this plan develops the source-expansion slice rather than declaring those gates complete. Westmount is the first proposed additional distributor. Sherbrooke remains deferred pending freshness and supported-access clarification.

### Outcome and scope

Integrate Hydro-Westmount into the existing map and sheet, first for current network-block status and then, separately, for retained history. Preserve the current four domains and search flow; add source labels, per-provider coverage/freshness and the minimum explanatory copy needed to avoid misleading answers. No redesign, social feed, new geocoder, reliability score or province-wide completeness claim.

A source feature is a **network block**, not a unique outage incident or a household. Two blocks affected by one upstream failure must not become two claimed independent outages. Historical Westmount coverage begins when valid production collection starts, not at the first timestamp found in a row and not at Hydro-Québec's archive start.

### Evidence, assumptions and open questions

Observed during the November 1 discovery pass:

- The [official Westmount outage page](https://westmount.org/en/services/hydro-westmount/power-outages) links a public ArcGIS map. Its current configuration identifies `https://cartes.westmount.org/server/rest/services/InfoPanneCitoyen/FeatureServer/0` as its status layer. Metadata, count/statistics, filtered outage query and one polygon sample worked without credentials or a manually supplied Referer. Exact provenance/configuration URLs and responses are recorded in `NOTES.md`.
- There were 234 polygon features; all had `CITOY=1`. The official map expression defines 1 = in service, 2 = ongoing outage, 3 = planned interruption. A query restricted to 2/3 succeeded with an empty feature set.
- Fields include `ID`, `OBJECTID`, `CITOY`, `NbClients`, `LastUpdate`, `DtEtat`, `DebutPanne`, `STATUT`, `HRETOURPLAN`, `Message` and `NoteReserve`. No global ID or upstream outage-event identifier was established. Date metadata describes Eastern time with DST; a sample polygon returned in WGS84 when requested with `outSR=4326`.
- Current durable routes/read shaping are specific to Hydro-Québec `bis`/`aip`; current tables have no distributor column. The health decision is also Hydro-specific. Browser MapLibre code already accepts Polygon/MultiPolygon geometry, but service conversion presently drops durable-feed geometry and provider identity.
- D1 was about 3.355 GB in the November 1 operational check, close to the project's 3.5 GB review trigger. Repeating all block geometries/rows at every poll is not an acceptable default archive design.

Unverified; required answers before the corresponding rollout gate:

- Permitted automated access, polling cadence, attribution and raw/history retention/redistribution. Public query access and empty licence fields do not answer these questions. Prepare an enquiry through official channels; sending it is a separate user-authorized action.
- Whether `ID` remains stable across service republishing; how split/merged/removed blocks are represented; actual coverage boundary and overlap with Hydro-Québec. Municipal limits and a union of blocks are candidate geometry, not an automatically authoritative exclusive territory.
- Whether `NbClients` is all subscribers assigned to a block or subscribers actually interrupted, especially for partial outages. The popup only establishes a client count. Do not map it to `customers_affected` or sum it into existing totals until confirmed.
- Whether `LastUpdate` records a source heartbeat, row edit or network-state change; exact meaning/timezone of `DtEtat` and string `DebutPanne`; whether `HRETOURPLAN` is an estimated restoration time; whether status 3 means an interruption occurring now, a future notice or both. The discovery aggregate maximum `LastUpdate` and a raw-feature `LastUpdate` differed by approximately four hours, with the raw sample exceeding the aggregate maximum. Treat that as an unresolved timestamp/query inconsistency; compare raw values, official-map rendering and documented ArcGIS date behavior before applying any timezone offset or using aggregate dates for freshness.
- How a real outage starts, changes and clears. Only healthy rows have been sampled so far. A supported export/documented sample or observed incident is needed to validate nonempty semantics.

### Phase 0 — source contract and feasibility gate

- [ ] Record the access/attribution/retention decision and allowed request cadence, using published terms or an operator response. Record any limits on raw fields, public geometry, retention and redistribution.
- [ ] Capture a dated schema/map-expression baseline, selected-field inventory, service item identity and source endpoint. Use an identifiable pannes.ca user agent; require no forged Referer, borrowed token, private endpoint or browser automation in production.
- [ ] Validate `ID` uniqueness, status meanings, count semantics, source timestamps, planned-state semantics and geometry coverage. Compare one active/planned example with the official map when available; do not manufacture a production incident.
- [ ] Prepare small fixtures for healthy, active, planned, null/unknown values and restoration; label synthetic fixtures as synthetic. Establish which mappings are confirmed versus provisional.
- [ ] Select a collection interval within the source's allowed cadence. Proposed starting point is five minutes, subject to confirmation; this is a product choice, not a claim that Westmount updates every five minutes.

Exit: permitted use and a field contract sufficient for current-status display are documented. Archive permissions and lifecycle semantics are an additional gate for history. If access or semantics are not sufficient, retain an official-map referral and stop before public ingestion.

### Phase 1 — provider contract and durable model

Proposed architecture: a narrowly scoped Worker adapter plus provider-aware read composition. Keep Hydro ingestion/storage behavior intact while introducing the shared identity/coverage envelope required by a second source. Do not force Westmount data into `bis`, `aip` or Hydro-specific `resolved_events`.

- [ ] Define stable provider key `hydro_westmount`, localized display name, official links and source definition version. Qualify all public/internal feature identifiers with provider and source layer/version, e.g. `hydro_westmount:block:<ID>`. Keep raw `OBJECTID` as retrieval provenance, not a promise of stable identity. A reused/split ID must not silently inherit the old block's history.
- [ ] Add additive provider-neutral tables for source state/published generation, immutable snapshot metadata, latest block state, versioned geometries and changed-state observations. Define keys before coding: provider, source, block identity/identity epoch, geometry digest, snapshot/run, parser version and publication generation. History episodes are derived materializations, not replacements for observations.
- [ ] Keep `fetched_at`, `last_successful_validation_at`, `source_updated_at`, first/last observed state and any reported event time separate. UTC storage; retain original raw timestamp values and date metadata for replay. Do not parse a string with ambiguous date/timezone into a confident event time.
- [ ] Normalize `CITOY` to `in_service`, `outage`, `planned_interruption`, `unknown`. Preserve original codes, status and messages. Keep optional count/timing fields nullable. Expose block subscriber counts under an accurate label unless an affected-count interpretation is confirmed.
- [ ] Store geometry once per version; request/convert valid Polygon/MultiPolygon to WGS84, preserving rings, holes and bounds. Validate containment/distance behavior against interior, edge, hole, multipolygon and just-outside points. Do not simplify the canonical geometry; a separate display derivative may be simplified after a measured error check.
- [ ] Define coverage as provider/source capability with `live`, `planned`, `archive` availability and collection start. A cached polygon can remain spatial evidence while live status is stale; these are separate states.
- [ ] Record the chosen multi-provider identity, observation/episode and durable-store decisions in an ADR during implementation; update `docs/architecture.md`. Preserve existing module boundaries; no runtime imports from maintenance scripts/tests.

Expected touchpoints: additive D1 migration after the current migration head (determine the next number at implementation time); new focused `src/westmount-source.js` / provider-store module; `src/worker.js` orchestration; source-neutral read/view contracts. These are proposed filenames, not changes made by this plan.

### Phase 2 — bounded collection, raw preservation and atomic publication

- [ ] Fetch **all block statuses**, not just `CITOY IN (2,3)`. Healthy rows are needed to observe restoration and distinguish zero active areas from missing data. Limit fields to the validated public contract; do not fetch address/building layers, circuit topology fields or customer-level data just because they are accessible.
- [ ] Read attributes on each accepted poll; fetch a geometry baseline and refresh geometry on an agreed daily/version cadence and new IDs. Validate geometry changes for existing IDs too; new-ID detection alone misses edited boundaries. Preserve the source definition and geometry version used for each observation.
- [ ] Use documented ArcGIS pagination/ID batching, deterministic ordering, bounded timeouts/response sizes/pages and limited retry with backoff. Honor `Retry-After`; stop on access denial. Treat JSON `error` objects as failures even with HTTP 200. Detect `exceededTransferLimit`, duplicate IDs, missing pages, unexpected block loss and invalid required fields. The previous count of 234 is a baseline for anomaly review, not a permanent hardcoded invariant. [ArcGIS query reference](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/).
- [ ] A partial/incoherent read never becomes the current generation and never resolves an episode. Record capture start/end, because a paged source need not provide a transactionally frozen snapshot. Check ID-set/count consistency and quarantine unexplained membership changes; never interpret a disappearing block as restored service.
- [ ] Archive exact response pages and relevant public headers, endpoint/query definition, timestamps, source metadata, digests and parser version in R2 under a provider prefix. Use content hashes to deduplicate unchanged bodies; link successful poll/validation metadata to the retained bytes. Store only selected public fields under the approved retention contract; never persist credentials/cookies.
- [ ] Sequence publication: validate complete response set → persist R2 inputs → write immutable D1 snapshot metadata and staged derived rows → atomically advance the provider's generation pointer. Failed writes leave the last good generation visible. Readers pin one generation. Use a provider run lease/idempotency key to prevent overlapping cron/retry publication and duplicate observations; retry/replay converges on the same result.
- [ ] Diff against the last accepted provider generation and write state observations only on meaningful changes; keep a cheap poll heartbeat for successful unchanged responses. Record missing/unknown source state explicitly. Preserve raw/message changes according to the field contract even when the main status code is unchanged.
- [ ] Give Westmount a separately enabled schedule/run name and source summary. It must execute independently of Hydro's container job; either can fail without preventing the other from running. Collection runs directly in the Worker and persists to D1/R2; it must not wake the container or write durable state there.

Cost gate: at a five-minute interval, a single attributes request is about 288 polls/day, inspecting roughly 67,392 block rows/day at the observed 234-block baseline. This is an upstream-work estimate, **not** a D1-write estimate. Measure response bytes, R2 writes/storage, changed rows, geometry sizes and Worker/D1 cost in a representative run. Avoid appending 234 full D1 rows per poll or duplicating geometry per observation. Resolve the current storage headroom concern before adding an unbounded production archive; retain raw data/provenance per ADRs 0003/0005.

### Phase 3 — provider health and private shadow validation

- [ ] Expose per-provider operational status: enabled/shadow/public, latest attempt, last complete validated fetch, source-reported update time, failure streak, last good generation, collection start, and known gaps. Distinguish collector health from upstream freshness confidence: a successful empty response or an unchanged old `LastUpdate` is neither proof of a broken feed nor proof that the upstream producer is fresh.
- [ ] Proposed starting alert policy, to tune against the accepted cadence: stale after three missed five-minute intervals (15 minutes), alert after three failed runs, with a clear no-success state. Do not reuse Hydro's three-hour allowance without a source-specific decision. Scheduled failures must not advance the successful-validation timestamp.
- [ ] Before public activation, a shadow failure is recorded operationally without making public Hydro coverage fail. Once Westmount is public, the aggregate ingestion probe reports failure for a required failed/stale provider while retaining each provider's independent status; one provider's success must never make the other's status green. Add assertions to the existing hourly GitHub health monitor, without creating another monitoring service.
- [ ] Preserve last good features during failures, marked stale with collection time and official referral. Do not turn errors into an empty map/no-outage answer. Add bounded run retention and actionable transition-based monitoring; avoid logging full payloads on every poll.
- [ ] Run a separately authorized private shadow period of at least seven days. Compare a few sampled responses with the official map; record source changes, field completeness, unknown codes, boundary membership, polling success and cost. Healthy-only observations can validate availability but do not validate outage/restoration semantics. Require an actual incident transition or operator-confirmed nonempty examples plus replay evidence before promoting those semantics.

Exit: zero unexplained partial-publication events, no false all-clear in fault tests, replay/idempotency confirmed, documented source freshness limitations and accepted cost/retention budget. A quiet week is not proof of archive completeness or ongoing outage accuracy.

### Phase 4 — current/planned display and address answers

- [ ] Add a provider-aware normalized read contract to compose HQ and Westmount results. Keep `/api/durable/hydro` explicitly Hydro-specific for compatibility; use an explicitly unstable source-neutral route/read composer for combined data. Specify query bounds, pagination, provider filter, generation, coverage, freshness and count units. Do not leak raw upstream fields automatically through `include_raw` or a generic public export.
- [ ] Carry provider-qualified IDs, provider label/link, geometry, freshness, count unit and reported/observed time semantics through `src/durable-read-handlers.js`, `app/services.py`, presentation/sheet view models and map payloads. Remove conversions that silently drop these fields. Extend local fallback and both Python/E2E service fakes; the local HQ SQLite fallback must not silently assert fresh Westmount coverage when durable Westmount reads fail.
- [ ] Display Westmount polygons in existing Current/Planned domains and existing detail cards with a small source label. Keep existing semantic colors. Selection/render/cache/history keys include provider identity. Block counts are labelled affected blocks, not independent outages; unknown customer counts remain unknown and are excluded from combined affected-customer totals. Do not combine unlike count units in one headline.
- [ ] Route planned state according to the validated source contract. Do not invent a future start/end date from status 3, `DtEtat` or `HRETOURPLAN`. If the source provides only a currently planned interruption, present that fact without creating a scheduled event.
- [ ] Address answers use polygon containment before nearby-block distance. Label a match as within a reported affected block, not a certified household outage. Use exact geometry/distance for nearby filtering rather than rejecting a polygon because its centroid is outside the search radius. Coverage outside known provider polygons remains unknown unless a verified service territory supports a stronger answer.
- [ ] Keep provider overlap explicit: a city name or Westmount polygon must not automatically suppress a nearby HQ result or reassign an HQ account. Do not deduplicate across providers from proximity/time alone. On borders or unverified overlaps, show attributed nearby results and coverage uncertainty.
- [ ] Update French/English empty-state, source/provenance, About/SEO and machine-readable coverage copy only where needed. A valid current dataset with no active blocks says no reported interruption in the monitored source at the stated check time. Missing/stale/uncovered says so instead. Do not imply Westmount Archive/Context coverage at live launch.

Exit: desktop/mobile search, all four domains, map selection, details, back navigation and comparison work with HQ-only, Westmount-only, overlap, empty and stale fixtures. No misleading totals or provider loss. Public activation requires the source contract, data and shadow gates; deployment is separately authorized.

### Phase 5 — observed Westmount history, separate release gate

- [ ] Retain block status transitions with successful observation times and capture gaps. Derive **block status episodes**, not claimed utility incident IDs. Adjacent blocks sharing a timestamp are not automatically merged into a unique event. A category change between outage/planned is recorded as a state transition; it must not inflate a count of independent outages.
- [ ] Close a block episode only after explicit in-service observations from complete accepted generations; proposed confirmation is two consecutive healthy polls. Record the first healthy observation as the observed restoration upper bound and the last active observation as the lower bound. The second confirms the transition, not a later invented restoration time. A missing block/error is not a closure. Bootstrap an already-active block as left-censored unless a validated source-reported start time is available.
- [ ] Preserve ambiguity across collection gaps: there may have been an unseen restoration/reopening. Record that limitation; do not infer continuous outage, exact duration, customer-hours or an exact restoration timestamp. Store reported times separately from observation bounds. Rebuild/reprocess derived episodes from raw inputs without rewriting the evidence.
- [ ] Add Westmount history to bounded materialized reads only after metric names, denominators, chronology, retention and gap handling are verified. Do not insert block episodes into the existing HQ municipal archive bins/outage count unchanged. Namespace archive cursors/summaries by provider and metric unit, with explicit collection-start metadata; comparison periods lacking Westmount collection are unavailable, not zero.
- [ ] Keep HQ disclosure documents/regional continuity context identified as HQ. No Westmount reliability comparison or synthetic historical backfill. If a supported official history export is later offered, make that a separate provenance/model decision.

Exit: replay covers outage→healthy, planned→active, changed counts, repeated outage, block split/removal, boundary revisions, stale periods and parser correction. Summary coherence guards prevent blocks, episodes, customers and incidents from being relabelled interchangeably. Archive enablement is independent of current-feed enablement.

### Implementation slices, verification and rollout

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
- D1 measured `3,355,394,048` bytes (3.355 GB) on 2026-11-01; approximately 145 MB remains before the 3.5 GB internal action trigger. Address storage growth this week. Reducing or offloading bulky derived geometry and archive-bin materializations remains open; raw R2 payloads, geometry provenance, archive-visible information and snapshot metadata remain out of scope for automatic deletion. See ADR 0005.
- Browser proof gaps remain: real-device geolocation/permission recovery, visible freshness/change cues, dense live-data readability, and practical keyboard/screen-reader checks.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes; the remaining proof gaps are ongoing maintenance work, not an unfinished `v0.4.5` release item.
- First-party JS modules improve maintainability but increase module requests; measure on Cloudflare before assuming native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and visually fragile; keep checking overlap, horizontal scrolling, and dense-row readability.
- Bad in-app URLs and unhandled Flask exceptions still need minimal branded 404/500 pages.
- SEO announcement-readiness follow-up: consider `noindex,follow` for user-entered address/current-location result pages so arbitrary searches do not become indexable landing pages. Absolute social-image URLs, large-card metadata, and French/English/`x-default` alternates are implemented and production-verified.
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
