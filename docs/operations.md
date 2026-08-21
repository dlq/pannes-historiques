# Operations

This document keeps production and release-check details out of `PLANS.md`.

## Local Runtime

Run the local app:

```bash
uv run python server.py serve
```

The default local URL is `http://127.0.0.1:8000`.

This standalone Flask path does not emulate the Worker's D1-backed `POST /api/usage` route. A local
`404` for that optional write is expected and does not block interface actions. Exercise the route's
validation, aggregation, retention, and authorization behavior through the Node tests and a Wrangler
dry run before deployment.

## Deployment

Production deploy command:

```bash
npx wrangler deploy
```

Do not deploy unless explicitly requested. For deployment-related changes, run a dry run first:

```bash
npx wrangler deploy --dry-run
```

For a release that changes `app/`, `pyproject.toml`, or other container image inputs, verify that
the container image/version changed as well as the Worker version, and roll out the container
immediately:

```bash
npx wrangler deploy --containers-rollout immediate
```

`--containers-rollout=none` is appropriate only for Worker-only changes. It leaves Flask-rendered
pages and assets, including `/service-worker.js`, on the prior container image.

## Production Smoke Checks

Include these after a deploy:

- `/healthz`
- `/api/health/ingestion` returns `200` with an empty `problems` array, covering both ingestion freshness and archive-summary coherence
- homepage in English and French
- representative address search
- private durable status through an authorized operational check, not a public unauthenticated URL
- static app assets and service worker
- container status/image if the deploy touched container code

## Ingestion Monitoring And Archive Health

`GET /api/health/ingestion` is public, exposes ingestion freshness facts, and returns `503` when the latest Hydro snapshot is stale or the recent failure streak is sustained. The `Ingestion health monitor` GitHub Actions workflow polls it at minute 17 and 47 of every hour; a failing run is the alert signal.

It also returns `503` when the materialized archive summary is stale or contradicts itself. The stored source cursor must match the current archive cursor; a missing summary for a non-empty archive or a mismatch is rebuilt on the next Archive request and remains alertable until then. Coherence checks cover a shorter window exceeding the longer one containing it, a territory holding more outages than the whole year, or a largest single outage above the year's cumulative total. Those checks run against the summary actually being served, not a freshly built one. A failure here is a data-plane fault: ingestion may be perfectly current while the Archive report is stale or shows impossible figures. Read the `problems` array to tell the conditions apart.

For the private archive audit, use an operation token to query:

```bash
curl -fsS -H "X-Pannes-Operation-Token: $PANNES_OPERATION_TOKEN" \
  https://pannes.ca/api/durable/runtime/municipal-archive/completeness
```

The response distinguishes polygons with a municipal assignment, overlap-only polygons, polygons outside all administrative-territory bounding boxes, and polygons that intersect a territory bounding box but have no assignment. The latter require backfill or geometry review.

The normal Hydro schedule expires `ingestion_runs` left in `running` for more than three hours and purges terminal run records older than 30 days. It does not delete raw R2 inputs, D1 geometry, municipal archive bins, or resolved-event history. See [ADR 0005](adr/0005-d1-archive-retention-and-compaction.md).

Before deploying a Worker release that includes a D1 migration, apply only the reviewed migration file or files introduced by that release, then run the Worker deployment. Record the migration identifiers in the release evidence. Do not re-run an already-applied historical migration such as `0011_archive_health_indexes.sql`:

```bash
npx wrangler d1 execute pannes-historiques --remote --file migrations/NNNN_descriptive_name.sql
```

## Private Usage Evidence

The browser sends only allowlisted `feature` and `action` pairs to `POST /api/usage`. The Worker aggregates them directly into UTC daily rows and never persists raw events, addresses, queries, coordinates, IP addresses, user agents, identifiers, or fingerprints. Rows older than 90 days are deleted by the normal Hydro maintenance schedule.

Read the private operational report with the operation token:

```bash
curl -fsS -H "X-Pannes-Operation-Token: $PANNES_OPERATION_TOKEN" \
  https://pannes.ca/api/ops/usage-evidence
```

Treat every value as an interaction count, never a person, session, or unique visitor. Check `collection_status`, the human/non-human split, and the retention cutoff before using the figures. Apply `migrations/0012_usage_evidence.sql` before deploying the first release that enables collection.

Before enabling the endpoint, configure a zone-level rate-limiting rule named `usage evidence per IP`:

- expression: `http.request.method eq "POST" and http.request.uri.path eq "/api/usage"`
- counting characteristic: IP, used only by Cloudflare's edge rule and never written to the usage tables
- threshold: 30 requests per 10 seconds
- action: Block, status `429`, mitigation timeout 10 seconds

The threshold permits ordinary bursts of interface actions while bounding D1 write amplification and obvious counter flooding. Roll back by disabling the named rule; disabling collection also requires removing or pausing the browser calls so a missing endpoint is not mistaken for an active zero-use day.

## Autocomplete Rate Limit

Cloudflare, not Flask, enforces the public abuse boundary for `GET /autocomplete`. Configure one zone-level rate-limiting rule named `autocomplete per IP` with:

- expression: `http.request.method eq "GET" and http.request.uri.path eq "/autocomplete"`
- counting characteristic: IP
- threshold: 10 requests per 10 seconds
- action: Block, status `429`, mitigation timeout 10 seconds

This is the Free-plan-compatible equivalent of the intended per-minute boundary: that plan exposes only a 10-second counting period and mitigation duration. Create it in **Security rules** > **Create rule** > **Rate limiting rules**. Do not apply it to cached assets. The browser shows a concise retry message for `429`; non-browser callers receive Cloudflare's block response. Roll back by disabling this named rule. Do not lower its threshold by editing a live rule during an incident: deploy a second, stricter rule, wait for the original 10-second mitigation window to expire, then remove the old rule.

Verify after deployment from an operator-controlled test IP: confirm a normal request returns `200`, then exceed the threshold within 10 seconds and confirm the next request returns `429`; wait 10 seconds and confirm the same request returns `200` again. Record only the date, rule name, and outcome in `NOTES.md`; do not commit dashboard exports or account data.

## Static Asset Performance Checks

For Cloudflare static-asset performance work, use cold and warm `curl -fsS -w` probes for:

- `/static/app.css`
- `/static/app.js`
- each first-party ES module
- `/static/icons.svg`
- `/service-worker.js`
- `/static/manifest.webmanifest`
- Noto Sans font files
- vendored MapLibre assets

Record HTTP status, `cf-cache-status`, `cache-control`, `etag`, `content-encoding`, transfer size, TTFB, and total time. Repeat with a cache-busting query and without one. Compare browser DevTools waterfalls and Cloudflare Observatory/Lighthouse results before deciding whether a bundler or different asset strategy is justified.

## Generated Evidence

Playwright screenshots, JSON snapshots, live UI audit output, and other temporary test or audit outputs belong under the ignored repository-local `tmp/` directory. Commit durable conclusions to `NOTES.md`, `PLANS.md`, `CHANGELOG.md`, or focused docs rather than committing raw generated artifacts.
