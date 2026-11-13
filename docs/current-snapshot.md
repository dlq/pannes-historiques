# Current Snapshot

Last updated: 2026-11-13

Read this first for quick orientation. Use `PLANS.md` for the active roadmap, `docs/architecture.md` for runtime boundaries, `docs/cost-containment.md` for cost strategy, and `CHANGELOG.md` for completed release history.

## Version And Deployment

- Shipped release and package version: `v0.4.9`, tagged 2026-11-13. The tag includes release documentation for the deployed application.
- Latest production deployment: application commit `40e6266`, deployed 2026-11-13 as Worker `95622681-526c-40eb-a777-bd29711a2a00` at 100%. Container application version 134 uses immutable amd64 image `sha256:ac2d77c330755cd896ae876a8b80f8c68bf76f83486c0f9ae9c106595d95ddb5` from `0a8c8dd`. The Worker fix checks whether the Archive summary is due even when no new polygons are found. CI passed and live ingestion is healthy. A follow-up will verify the next due automatic refresh.
- Do not treat a merge to `main` as proof of production deployment; record deployment evidence in `PLANS.md` and `CHANGELOG.md`.
- Current development direction: the `v0.4.9` identifier-free daily feature/action evidence is deployed, with 90-day retention, a private readout, migration `0012`, and the shared interaction-endpoint edge rule active. The eight-week usage decision is recorded in NOTES.md: continue existing bounded collection without analytics expansion. The post-release archive cursor query optimization is deployed and awaits a 24-hour D1 read comparison. `v0.4.8` completed the authenticated cost decision, container-runtime retirement, archive cursor health guard, and autocomplete edge protection.
- `v0.5.0` remains gated on `v0.4.9`'s bounded usage-data lifecycle and a 14-day observation window with healthy ingestion, bounded archive-summary refresh without unexplained prolonged lag, and no unexplained archive-completeness regression.

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
- Usage collection is active in production. The write-only response, public `404` on the private readout, daily D1 aggregate, active collection heartbeat, browser module, and `autocomplete and usage per IP` Cloudflare rule are verified; continue watching classification quality and the 90-day lifecycle during continuing bounded collection; the eight-week decision is complete.
- Shipped: localized location errors/offline retry, dialog keyboard checks, narrow disclosure wrapping and provenance wording about separate Archive refreshes. The local axe audit additionally covers 44 states, with zero post-fix violations; manual-review items remain. Remaining proof: real-device permission recovery, dynamic freshness indicators, exhaustive live-data density and assistive-technology speech.
- Displayed figures are now checked against each other, not only against their source queries, after the Archive report presented a count of municipalities as a count of outages while every test and health probe passed. The checks run in `GET /api/health/ingestion`; see the [regression guard](maintenance-backlog.md#regression-guard-figures-that-contradict-each-other-2026-08-05).
- Archive-summary cursor checks are production-verified: a routine cursor mismatch marks the served summary stale and appears as a health warning, while a missing summary for a non-empty archive or an internally contradictory summary fails ingestion health. Public requests do not rebuild the summary. The shape guard still handles format drift separately.
