# Roadmap History: Hydro-Québec Outage History App

Date: 2026-05-30

This file records completed release and implementation history. Keep active execution state in `plan.md` and source/evidence research in `research.md`.

## Release History

### `v0.1.3`

- Established the formal `pytest` test baseline.
- Added deterministic service/geocoding tests.
- Added route smoke coverage.

### `v0.1.4`

- Added browser-regression setup for the then-current UI.
- Hardened Nominatim geocoding and autocomplete behaviour.
- Added operational/docs cleanup.
- Added verified Hydro status-code decoding for known codes.
- Added small UI consistency fixes.

### `v0.2.0`

- Delivered the map-first responsive shell.
- Added desktop side-panel and mobile bottom-sheet layouts.
- Preserved lazy map-context loading so cards/search feedback can render before heavier geometry.
- Connected production current/planned/previous map context to D1-backed Worker runtime endpoints where durable URLs are configured.

### `v0.2.1`

- Improved result/detail interaction.
- Strengthened persistent selected-row state after row clicks, keyboard activation, and map-feature selection.
- Reduced duplicate searched-place summary information.
- Fixed stacked map-context result sections in the side panel.
- Added browser coverage for selected-row behaviour.

### `v0.2.2`

- Added PWA/installability basics: manifest, icons, mobile app metadata, service worker, and offline fallback.
- Made address and current-location URL state reloadable/shareable.
- Removed obsolete public `radius_m`, `days`, and `include_planned` query controls from the primary URL contract.
- Improved mobile sheet layout and mobile detail overlay behaviour.
- Split frontend helpers into `app/static/ui-format.js` and map styling/rendering helpers into `app/static/map-layers.js`.
- Updated service-worker/static-version handling for the new ES modules.
- Fixed the Cloudflare container deploy configuration so the deployed container image is built from the repo `Dockerfile` instead of staying pinned to an old registry image.

## Implementation Checkpoints

### Status-Code Decoding

- Hydro-Québec open-data documentation verifies status codes `A`, `L`, and `R`.
- The app decodes those codes in `app/views.py` and `app/i18n.py`.
- Unknown codes such as `N` are intentionally preserved as raw source codes until source evidence verifies their meaning.

### Disclosure Ingestion

- The prototype ingests several published access-to-information extracts:
  - `DAI-2022-0386` Côte Saint-Luc XLSX
  - `DAI-2025-0275` Outremont PDF
  - `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF
  - `DAI-2025-0333` Saint-Félix-de-Kingsey PDF
- Disclosure records are stored separately from live Info-pannes API records.
- DAI areas render as broad historical context behind more granular live/API outage layers.

### Durable Production Data Path

- Production uses Cloudflare Workers + Containers, D1, and R2.
- D1 stores normalized feed versions, current outage rows, planned-interruption rows, resolved previous events, disclosure mirror metadata, runtime geocode/address/query state, and map-context metadata.
- R2 stores raw Hydro-Québec feed payloads and raw DAI/access-to-information files.
- The container still renders the Flask/Jinja shell and keeps a baked-in SQLite snapshot for local-compatible fallback paths.
- Runtime container writes are ephemeral and should not be treated as durable production storage.

### Hydro Cron And D1/R2 Handoff

- The 30-minute Worker cron checks Hydro feed versions and coordinates changed-feed ingestion.
- Direct Worker-origin fetches to Hydro produced HTTP 406 in May 2026, while container-origin fetches worked.
- The production handoff therefore uses the container to fetch/parse Hydro payloads and the Worker to archive raw bytes in R2 and mirror normalized rows into D1.
- Hydro polygon KMZ payloads are parsed into D1 `hydro_polygon_geometries` for runtime map-layer attachment.

### Disclosure Mirror Handoff

- The container remains the parser/workspace for disclosure sources.
- Worker-side disclosure jobs mirror parsed disclosure sources, events, annual metrics, and geometry metadata into D1.
- Raw DAI source files are archived in R2.
- Large GeoJSON geometry blobs are not mirrored into D1; D1 stores metadata such as centroid and bounding boxes.
- May 2026 catch-up completed with all 32 known disclosure sources archived and parsed.

### Runtime Map-Layer Fix

- A May 2026 production deployment exposed two map-context regressions:
  - previous-outage context was empty on the default page
  - current/planned sections rendered centroid markers instead of polygons
- The fix added Worker runtime endpoints for operational and previous map layers.
- Flask now prefers those runtime endpoints when `DURABLE_RUNTIME_URL` is configured, then falls back to older durable/local paths.
- Deployment verification should prime `/healthz` and then verify page/map payload geometry counts because a new Cloudflare container can briefly report that it is not running.

### Production Performance Optimizations

- Early production search profiling found the largest costs in regional/disclosure map context, archived-outage matching, current matching, and large embedded map payloads.
- Removing global regional/disclosure layers from per-address search responses, short-circuiting far-away geometry matching, and lazy-loading context reduced response size and latency materially.
- Moving current and previous nearby matching to D1 reduced app-side query cost.
- Trimming disclosure popup data and using centroid markers for previous outages reduced `/search-map` payload size substantially.

### Post-`v0.2.2` Structural Cleanup

- Removed stale Worker direct-Hydro ingestion helpers after verifying their branch was superseded by the container-fetch/D1-R2 handoff.
- Removed obsolete address-level disclosure match/metric result fields after disclosure context became map-layer based.
- Gated `/debug/timing/search` behind `ENABLE_DEBUG_ROUTES=1`; production now returns `404` for that route by default.
- Fixed `OutageMap` `ResizeObserver` cleanup for HTMX/custom-element reconnects.
- Updated disclosure source metadata so parsed PDF sources no longer claim row extraction is pending.
- Removed merged remote Codex branches after confirming their tips were contained in `main`.

## Deployment Lessons

- Do not consider a deploy complete just because Wrangler reports a new Worker version.
- Verify that the Cloudflare container image/version actually changed after deploys touching container code.
- A stale container image can continue serving old app code even when D1/R2 data is current.
- Production checks should include `/healthz`, a representative search, `/api/durable/status`, static app assets, service worker, and container status/image when relevant.
