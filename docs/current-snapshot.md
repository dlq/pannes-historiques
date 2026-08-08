# Current Snapshot

Last updated: 2026-08-08

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release: `v0.4.7`.
- Package metadata: `0.4.7` in `pyproject.toml` and `package.json`.
- Last recorded production deployment: Worker version `87dc841e-ca99-4adf-952f-4adc9df6baba`, deployed 2026-08-08 from tagged release commit `32ce9f6` with container digest `sha256:e868f2c313acc7bff04152d585c54f1ebaf239b16f67afcf7399c8fa5477f6b8`.
- Do not treat a merge to `main` as proof of production deployment; record deployment evidence in `PLANS.md` and `CHANGELOG.md`.
- Current development direction: privacy-preserving aggregate feature-use evidence in `v0.4.8`.
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

## Active Decisions

- `v0.4.3` selected the hybrid renderer: Flask/Jinja still renders browser pages while the Worker owns D1/R2 durable reads and runtime attribution. Revisit a Worker-first browser shell only if measured traffic shows container-rendered pages are the material recurring cost.
- `v0.4.7` rejects a composite Hydro Score with current evidence. Show Hydro's normalized annual continuity index only at regional granularity, and describe local retained observations without grading an address or municipality. See ADR 0006.

## Useful Commands

```bash
git status --short --branch
git describe --tags --always --dirty
uv run pre-commit run --all-files
uv run pytest -q
npm run test:unit
npm run test:e2e
npx wrangler deploy --dry-run
```

Pre-commit runs formatters and linters only. Run the relevant Python, Node, and Playwright suites
separately; any service method, route, template, or browser-JavaScript change requires `npm run test:e2e`.

## Known Risk Areas

- The trusted Worker host is deployment configuration in `wrangler.jsonc`; keep it synchronized with
  the actual Worker host and avoid embedding it in runtime code.
- The container cannot currently authenticate to protected Worker runtime endpoints, so those calls
  fall back to public durable reads or local-compatible paths. `map-context` is deliberately public.
- Container-backed search/render paths still wake the container.
- Archive health controls are deployed: stale ingestion rows expire after three hours, terminal runs retain 30 days, latest rows are de-duplicated, and archive-bin completeness is privately auditable. Continue monitoring D1 growth against the ADR 0005 trigger.
- All public JSON routes remain explicitly unstable until the `v0.5.0` API contract.
- Browser proof gaps: real-device geolocation, visible freshness cues, dense data readability, and practical screen-reader checks.
- Displayed figures are now checked against each other, not only against their source queries, after the Archive report presented a count of municipalities as a count of outages while every test and health probe passed. The checks run in `GET /api/health/ingestion`; see the regression guard in `PLANS.md`.
- The materialized archive summary is still served indefinitely when its contents go stale. A shape guard catches payload-format drift, but no cursor or age comparison exists yet.
