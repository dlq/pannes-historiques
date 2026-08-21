# Current Snapshot

Last updated: 2026-08-21

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release: `v0.4.8`.
- Development package metadata: `0.4.9` in `pyproject.toml` and `package.json`; the latest shipped/tagged release remains `v0.4.8`.
- Tagged-release deployment: Worker version `e6fe9a87-df8f-4cf4-a82b-b0dcdc07fa4c`, deployed 2026-08-14 from tagged release commit `f6df621` with the `pannes-historiques-pannescontainer:e6fe9a87` image.
- Latest production deployment: post-release `main` commit `e212841`, deployed 2026-08-21 as Worker version `6aebc224-ee26-4be4-b7a1-a9add596f98a` with container image digest `sha256:f7e3b21ecabb44ced653c8c5c7ad263cfd8d64ce49495e76a865b4977111e985`. The live canonical social preview and large-card metadata are verified.
- Do not treat a merge to `main` as proof of production deployment; record deployment evidence in `PLANS.md` and `CHANGELOG.md`.
- Current development direction: the `v0.4.9` identifier-free daily feature/action evidence candidate is implemented and locally verified, with 90-day retention and a private readout. Migration `0012`, the documented edge rate rule, and production smoke checks remain release gates. `v0.4.8` completed the authenticated cost decision, container-runtime retirement, archive cursor health guard, and autocomplete edge protection.
- `v0.5.0` remains gated on `v0.4.9`'s bounded usage-data lifecycle and a 14-day observation window with healthy ingestion, cursor-fresh archive summaries, and no unexplained archive-completeness regression.

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
- `v0.4.9` collects only allowlisted daily interaction counts, never visitor profiles or unique visitors. It persists no address, query, coordinate, IP address, identifier, fingerprint, user agent, or raw event; GPC/DNT disable browser reporting. See ADR 0007.

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

- The attempted protected container-to-Worker authentication path is retired. The container calls
  only public materialized `map-context` and `previous-archive-summary` reads; former protected
  runtime work takes local-compatible paths. `map-context` is deliberately public.
- Container-backed search/render paths still wake the container.
- Archive health controls are deployed: stale ingestion rows expire after three hours, terminal runs retain 30 days, latest rows are de-duplicated, and archive-bin completeness is privately auditable. Continue monitoring D1 growth against the ADR 0005 trigger.
- All public JSON routes remain explicitly unstable until the `v0.5.0` API contract.
- Usage collection is not yet active in production. Do not deploy the browser calls before migration `0012` and the `usage evidence per IP` Cloudflare rule are active; verify the private readout and retention heartbeat after deployment.
- Browser proof gaps: real-device geolocation, visible freshness cues, dense data readability, and practical screen-reader checks.
- Displayed figures are now checked against each other, not only against their source queries, after the Archive report presented a count of municipalities as a count of outages while every test and health probe passed. The checks run in `GET /api/health/ingestion`; see the regression guard in `PLANS.md`.
- Archive-summary cursor checks are production-verified: a cursor mismatch or missing summary for a non-empty archive makes the summary a rebuildable cache miss and fails ingestion health. The shape guard still handles format drift separately.
