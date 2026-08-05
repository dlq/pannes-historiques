# Current Snapshot

Last updated: 2026-08-05

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release: `v0.4.6`.
- Package metadata: `0.4.6` in `pyproject.toml` and `package.json`.
- Last recorded production deployment: Worker version `d62049e6-f4f3-468c-a0bc-98589a61c67e`, deployed 2026-08-05 with the Archive figure correction, archive coherence checks, and sheet number formatting. The `v0.4.6` release deployment and container digest are retained in `NOTES.md`.
- `main` also contains untagged SEO and map-startup follow-ups from 2026-08-02, plus the UI redesign work and Archive corrections through 2026-08-05. Do not treat a merge to `main` as proof of production deployment; record deployment evidence in `PLANS.md` and `CHANGELOG.md`.
- Current development direction: `v0.4.7` Hydro Score / regional analytics framing, followed by privacy-preserving aggregate feature-use evidence in `v0.4.8`.
- `v0.5.0` remains gated on the score decision, bounded usage-data design, a dated cost review, healthy ingestion/archive operations, and an edge rate limit for `/autocomplete`.

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
- Displayed figures are now checked against each other, not only against their source queries, after the Archive report presented a count of municipalities as a count of outages while every test and health probe passed. The checks run in `GET /api/health/ingestion`; see the regression guard in `PLANS.md`.
- The materialized archive summary is still served indefinitely when its contents go stale. A shape guard catches payload-format drift, but no cursor or age comparison exists yet.
