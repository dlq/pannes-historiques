# Cost Containment

This project has no current monetization model: no ads, subscriptions, paid API, or sponsor-backed operating budget. Treat it as a public-interest/research prototype with a near-zero marginal-cost target.

## Budget Posture

- Target steady-state cost: Workers Paid baseline plus domain registration, with D1/R2 remaining within included usage where possible.
- Acceptable overage: small, occasional, explainable spikes from development deploys, manual backfills, or one-time data migrations.
- Unacceptable steady state: recurring Durable Object/container overage caused by normal public browsing, searching, or map interaction.
- Cost decision rule: any feature that increases recurring Cloudflare runtime cost needs an explicit research/user-value justification and a fallback or disable path.

## Architecture Direction

- Public user traffic should not wake the Python container.
- Ordinary browsing, startup map context, address search, layer toggles, archive summaries, disclosure summaries, language switches, and static assets should be served by Worker/static/D1/R2 paths.
- The Python container should become an internal parser/batch service for scheduled ingestion, complex one-off maintenance, and local-compatible development behavior.
- Production writes and durable state should stay in D1/R2; container-local writes remain ephemeral and should not be part of the production data contract.

## Architecture Options

1. Worker-first public reads, container for parsing/batch/fallback.
   - Most aligned with cost containment: public routes read from D1/R2/materialized artifacts, and the container wakes only for scheduled ingestion, heavy parser jobs, local parity, or explicit fallback.
   - Tradeoff: some Jinja/Flask rendering logic must be moved, duplicated, or replaced by static/Worker-rendered fragments.
2. Hybrid renderer: Flask remains canonical, Worker caches/materializes the expensive reads.
   - Lowest migration risk: keep current Flask templates and move only data-heavy endpoints and summaries to D1/R2-backed Worker routes.
   - Tradeoff: public browsing can still wake the container unless cache and low-cost mode are strict.
3. Static shell plus Worker APIs.
   - Cleanest long-term public-read shape: static HTML/JS/CSS shell, Worker APIs for data, container only for ingestion/maintenance.
   - Tradeoff: larger frontend rewrite and more API contract pressure before the product semantics are fully settled.

Decision for `v0.4.3`: use option 2, with Worker-first durable reads. It preserves the settled Flask/Jinja interaction model while the Worker owns D1/R2 data routes, operational reads, and runtime attribution. Revisit option 1 only after production markers and monthly usage evidence show that normal shell traffic is a material recurring container cost. Option 3 remains deferred.

## Delivered Guardrails

- Production routes are classified as `edge-safe`, `container-needed`, or `internal-only` in `docs/architecture.md`. `X-Pannes-Runtime` and `Server-Timing` show whether a response used Worker/D1 or the container.
- The private `/api/ops/cost-health` check reports container, ingestion, archive-materialization, table-count, and optionally dated D1/R2 size facts.
- `PANNES_LOW_COST_MODE=1` stops public container wakes during an incident while durable public APIs continue to serve last-known D1/R2 data. It is an emergency guardrail, not a substitute browser shell.

## Current Baseline

- A private billing review has crossed this project's container and Durable Objects investigation thresholds. The account document and its billing figures are intentionally not kept in the repository.
- This is a cost signal, not route attribution. It cannot establish whether public shell traffic, scheduled ingestion, or another workload drove the usage, and it does not justify changing container idling by itself. The resulting decision and measurement gap are in `NOTES.md`.

## Remaining Evidence And Migration Work

1. Maintain dated monthly cost evidence.
   - Compare Durable Object/container duration, container memory/vCPU/disk usage, D1 storage and operations, and R2 storage and operations against the target posture.
   - Record the measurement date with any optional D1/R2 size values so a stale estimate is not treated as live telemetry.
2. Prove the next public-read migration boundary.
   - Use runtime markers and representative browser flows to measure whether shell requests, rather than durable reads, are a material recurring container cost.
   - Include `/`, `/sheet`, static assets, language switching, typed-address search, current-location search, and current/planned/archive/disclosure layers.
3. Move public reads off the container only when evidence justifies it.
   - Prioritize startup data, representative search, operational map layers, archive summaries, and disclosure summaries.
   - Keep D1 for indexed relational rows and compact materialized summaries.
   - Keep R2 for raw feeds, DAI/source files, and bulky precomputed geometry/map payload artifacts.
4. Keep cron/parser work bounded as ingestion evolves.
   - Split scheduled ingestion into resumable phases: version check, raw download to R2, parse, D1 write, summary/materialization update, and cleanup.
   - Add max runtime, retry/backoff, and resume cursors for long parser jobs.
   - Incrementally bin only newly resolved outage sightings where possible instead of rebuilding global archive summaries on every run.

## Operating The Guardrails

- `X-Pannes-Runtime` and `Server-Timing` distinguish Worker/D1 from container responses in smoke checks and live-tail investigation.
- `/api/ops/cost-health` is operation-token protected. It exposes live container state, the latest ingestion run, archive materialization state, table counts, and optional manually refreshed D1/R2 size estimates.
- Keep `PANNES_LOW_COST_MODE=0` normally. Set it to `1` only to stop public container wakes during an incident; durable APIs remain available, while Flask-shell routes return `503` rather than claiming a partial browser experience is complete.
- Once each month, record the Cloudflare dashboard's daily Durable Object/container usage, Worker request volume, D1 storage and operations, and R2 storage and operations. Reconcile any billed quantity against the applicable included allowance before treating it as a workload estimate. Refresh the optional size fields only with that dated check.
- For the dated review, also record Worker request volume, representative public-read timings, route runtime markers, and the resulting decision: retain the hybrid shell or prioritize one named Worker/static migration. Store the evidence and decision in `NOTES.md`, not in this standing policy.

## Follow-Up Thresholds

- Durable Object duration above roughly `$5/month`: investigate immediately.
- Container runtime above roughly `$3/month`: audit public route wakeups and migrate the highest-traffic route first.
- D1 approaching the included 5 GB storage threshold: define retention, rollup, compaction, or archive-offload policy before it becomes a recurring charge.
- R2 leaving included storage/operation ranges: review raw-file retention and precomputed geometry payload strategy.
