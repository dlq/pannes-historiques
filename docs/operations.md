# Operations

This document keeps production and release-check details out of `PLANS.md`.

## Local Runtime

Run the local app:

```bash
uv run python server.py serve
```

The default local URL is `http://127.0.0.1:8000`.

## Deployment

Production deploy command:

```bash
npx wrangler deploy
```

Do not deploy unless explicitly requested. For deployment-related changes, run a dry run first:

```bash
npx wrangler deploy --dry-run
```

After every production deploy, verify the container image/version changed, not just the Worker version.

## Production Smoke Checks

Include these after a deploy:

- `/healthz`
- homepage in English and French
- representative address search
- private durable status through an authorized operational check, not a public unauthenticated URL
- static app assets and service worker
- container status/image if the deploy touched container code

## Ingestion Monitoring And Archive Health

`GET /api/health/ingestion` is public, exposes only ingestion freshness facts, and returns `503` when the latest Hydro snapshot is stale or the recent failure streak is sustained. The `Ingestion health monitor` GitHub Actions workflow polls it at minute 17 and 47 of every hour; a failing run is the alert signal.

For the private archive audit, use an operation token to query:

```bash
curl -fsS -H "X-Pannes-Operation-Token: $PANNES_OPERATION_TOKEN" \
  https://pannes.ca/api/durable/runtime/municipal-archive/completeness
```

The response distinguishes polygons with a municipal assignment, overlap-only polygons, polygons outside all administrative-territory bounding boxes, and polygons that intersect a territory bounding box but have no assignment. The latter require backfill or geometry review.

The normal Hydro schedule expires `ingestion_runs` left in `running` for more than three hours and purges terminal run records older than 30 days. It does not delete raw R2 inputs, D1 geometry, municipal archive bins, or resolved-event history. See [ADR 0005](adr/0005-d1-archive-retention-and-compaction.md).

Before deploying a Worker release that includes a D1 migration, apply the reviewed migration explicitly, then run the Worker deployment. For this slice:

```bash
npx wrangler d1 execute pannes-historiques --remote --file migrations/0011_archive_health_indexes.sql
```

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
