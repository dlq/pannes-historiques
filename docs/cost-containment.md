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

## Execution Plan

1. Public route/runtime audit.
   - Classify production routes as `edge-safe`, `container-needed`, or `internal-only`.
   - Add response headers or `Server-Timing` markers such as `x-pannes-runtime: worker` and `x-pannes-runtime: container` so production smoke tests can prove whether a browser path touched the container.
   - Include `/`, `/sheet`, static assets, current/planned/archive/disclosure layer endpoints, language switching, address search, and current-location search.
2. Cost health endpoint and monthly evidence.
   - Add a private `/api/ops/cost-health` or equivalent operational check reporting container live-instance state, last container wake, last cron run, D1 size, R2 approximate storage/object counts where available, latest ingestion status, and archive-bin materialization status.
   - Add a monthly bill/usage review checklist that compares Durable Object duration, container memory/vCPU/disk usage, D1 storage, D1 row reads/writes, and R2 storage/operations against the target posture.
3. Move public reads off the container.
   - Prioritize startup data, representative search, operational map layers, archive summaries, and disclosure summaries.
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

## Operating The Guardrails

- `X-Pannes-Runtime` and `Server-Timing` distinguish Worker/D1 from container responses in smoke checks and live-tail investigation.
- `/api/ops/cost-health` is operation-token protected. It exposes live container state, the latest ingestion run, archive materialization state, table counts, and optional manually refreshed D1/R2 size estimates.
- Keep `PANNES_LOW_COST_MODE=0` normally. Set it to `1` only to stop public container wakes during an incident; durable APIs remain available, while Flask-shell routes return `503` rather than claiming a partial browser experience is complete.
- Once each month, record the Cloudflare dashboard's Durable Object/container duration, D1 storage and operations, and R2 storage and operations. Refresh the optional size fields only with that dated check.

## Follow-Up Thresholds

- Durable Object duration above roughly `$5/month`: investigate immediately.
- Container runtime above roughly `$3/month`: audit public route wakeups and migrate the highest-traffic route first.
- D1 approaching the included 5 GB storage threshold: define retention, rollup, compaction, or archive-offload policy before it becomes a recurring charge.
- R2 leaving included storage/operation ranges: review raw-file retention and precomputed geometry payload strategy.
