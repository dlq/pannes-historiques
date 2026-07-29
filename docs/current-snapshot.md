# Current Snapshot

Last updated: 2026-07-29

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release: `v0.4.6`.
- Package metadata: `0.4.6` in `pyproject.toml` and `package.json`.
- Production deployment: Worker version `184be6cc-8a00-49cf-81ad-acddceaec1c3`; container image digest `sha256:522384da1eefe4ef3630b1cb3aa615d3da77eeb8e305a0270f54822e99b7d0b3`.
- Current development direction: `v0.4.7` Hydro Score / regional analytics framing, followed by privacy-preserving aggregate feature-use evidence in `v0.4.8`.

## Product Shape

- Browser UI: one full-bleed MapLibre map plus one sheet.
- Sheet modes: explore domains (`current`, `planned`, `archive`, `context`) and address overview.
- Address overview includes current/planned status, local history, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Typed-address searches default to a 2 km local radius and offer 1/2/5/10 km choices; coordinate and explore flows default to 5 km.
- Public positioning: retained outage observations and public disclosure context, not official Hydro-Quebec service certification.

## Runtime Shape

- `app/`: Flask/Jinja shell, Python service orchestration, collectors, local SQLite fallback paths.
- `app/static/`: browser ES modules and static assets.
- `src/`: Cloudflare Worker, routing, runtime policy, D1/R2 helpers, container proxy, municipal/archive helpers.
- D1/R2: durable production state and raw/source archives.
- Container: still renders public Flask pages and keeps a baked SQLite snapshot; container-local writes are ephemeral.

## Active Decision

`v0.4.3` selected the hybrid renderer: Flask/Jinja still renders browser pages while the Worker
owns D1/R2 durable reads, operational map layers, and runtime attribution. Revisit a Worker-first
browser shell only if measured traffic shows container-rendered pages are the material recurring
cost.

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
- Archive health controls are deployed: stale ingestion rows expire after three hours, terminal runs retain 30 days, latest rows are de-duplicated, and archive-bin completeness is privately auditable. Continue monitoring D1 growth against the ADR 0005 trigger.
- All public JSON routes remain explicitly unstable until the `v0.5.0` API contract.
- Browser proof gaps: real-device geolocation, visible freshness cues, dense data readability, and practical screen-reader checks.
