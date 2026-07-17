# Current Snapshot

Last updated: 2026-07-17

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release: `v0.4.3`.
- Package metadata: `0.4.3` in `pyproject.toml` and `package.json`.
- Production deployment before the v0.4.3 release: Worker version `9ddad2ec-ea03-4b4a-80d2-7bee40ddfa92`; container image `pannes-historiques-pannescontainer:9ddad2ec`.
- Current development direction: `v0.4.4` contributor readiness, contract tests, and CI hardening.

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

`v0.4.3` selected the hybrid renderer: Flask/Jinja remains the browser-page renderer while the Worker
owns D1/R2 durable reads and runtime attribution. Revisit a Worker-first browser shell only if
measured traffic shows container-rendered pages are the material recurring cost.

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

- The trusted Worker host is deployment configuration in `wrangler.jsonc`; keep it synchronized with
  the actual Worker host and avoid embedding it in runtime code.
- Container-backed search/render paths still wake the container.
- Archive health: stale ingestion rows, latest-row de-duplication, archive-bin completeness, and D1 retention.
- Public/private JSON route posture needs a machine-readable/API-boundary pass.
- Browser proof gaps: real-device geolocation, visible freshness cues, dense data readability, and practical screen-reader checks.
