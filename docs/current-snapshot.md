# Current Snapshot

Last updated: 2026-07-12

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release: `v0.4.2`.
- Package metadata: `0.4.2` in `pyproject.toml` and `package.json`.
- Production deployment: Worker version `395dd418-e47b-443e-a60c-ecc8c0305b51`; container image `pannes-historiques-pannescontainer:395dd418`.
- Current development direction: `v0.4.3` cost-containment architecture, runtime instrumentation, and first public-read migration.

## Product Shape

- Browser UI: one full-bleed MapLibre map plus one sheet.
- Sheet modes: explore domains (`current`, `planned`, `archive`, `context`) and address overview.
- Address overview includes current/planned status, local history, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Public positioning: retained outage observations and public disclosure context, not official Hydro-Quebec service certification.

## Runtime Shape

- `app/`: Flask/Jinja shell, Python service orchestration, collectors, local SQLite fallback paths.
- `app/static/`: browser ES modules and static assets.
- `src/`: Cloudflare Worker, routing, runtime policy, D1/R2 helpers, container proxy, municipal/archive helpers.
- D1/R2: durable production state and raw/source archives.
- Container: still renders public Flask pages and keeps a baked SQLite snapshot; container-local writes are ephemeral.

## Active Decision

`v0.4.3` should measure and choose between:

1. Worker-first public reads with the container kept for parsing/batch/fallback.
2. Hybrid renderer where Flask remains canonical while Worker/D1/R2 take over expensive reads.

Avoid a static-shell rewrite until evidence shows the Flask/Jinja path itself is the main cost problem.

## Useful Commands

```bash
git status --short --branch
git describe --tags --always --dirty
uv run pre-commit run --all-files
npm run test:unit
npm run test:e2e
npx wrangler deploy --dry-run
```

## Known Risk Areas

- Hardcoded trusted Worker host in runtime policy.
- Container-backed search/render paths still wake the container.
- Archive health: stale ingestion rows, latest-row de-duplication, archive-bin completeness, and D1 retention.
- Public/private JSON route posture needs a machine-readable/API-boundary pass.
- Browser proof gaps: real-device geolocation, visible freshness cues, dense data readability, and practical screen-reader checks.
