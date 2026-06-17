# Municipal Archive Bins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed in `v0.2.7` and followed by cursor hardening at `9875b1a`. `main` includes the `c7fe3cb` merge of `codex/frontend-stability-summary`. Production includes that frontend slice, and the service worker currently advertises `pannes-historiques-v0.2.7-outage-pin-icon`. Remaining work is operational maintenance/import/backfill hardening, not initial implementation.

**Goal:** Build a derived municipal/TNO/Indigenous-territory archive layer for previously seen outage polygons while preserving raw Hydro snapshots and per-version polygon evidence.

**Architecture:** Add official territory storage sourced from Données Québec/ArcGIS, pure geometry helpers for centroid/overlap assignment and display simplification, and D1 tables for derived outage-territory bins. Runtime endpoints should prefer the new bins when populated and fall back to the existing `resolved_events`/Hydro polygon path while the backfill is incomplete.

**Tech Stack:** Cloudflare Worker, D1, ArcGIS REST GeoJSON, plain JavaScript geometry helpers, Node test runner, Wrangler migrations.

---

### Task 1: Pure Geometry And Territory Mapping Helpers

**Files:**
- Create: `src/municipal-archive.js`
- Test: `tests/municipal-archive.test.js`

- [x] **Step 1: Write tests for point containment, bbox overlap, simplification, and hybrid assignment**

Run: `node --test tests/municipal-archive.test.js`

Expected before implementation: FAIL because `src/municipal-archive.js` does not exist.

- [x] **Step 2: Implement geometry helpers**

Create exported functions:
- `geometryBbox(geometry)`
- `geometryCentroid(geometry)`
- `pointInGeometry(point, geometry)`
- `bboxIntersects(left, right)`
- `simplifyGeometry(geometry, toleranceDegrees)`
- `territoryFromFeature(feature)`
- `assignPolygonToTerritories(polygonRow, territories)`

Assignment must return one `primary` row for the territory containing the polygon centroid when found, and `overlap` rows for every territory whose bbox intersects and whose geometry contains at least one polygon vertex, has at least one territory vertex inside the outage polygon, or contains the polygon centroid.

- [x] **Step 3: Run tests**

Run: `node --test tests/municipal-archive.test.js`

Expected: PASS.

### Task 2: D1 Schema For Territory Archive

**Files:**
- Create: `migrations/0009_municipal_archive_bins.sql`

- [x] **Step 1: Add territory and bin tables**

Create:
- `admin_territories`
- `previous_outage_territory_bins`
- `municipal_archive_build_state`

Indexes must support territory lookup by bbox, bin lookup by assignment type/territory/time, and resumable backfill by `hydro_polygon_id`.

- [x] **Step 2: Validate migration syntax**

Run: `npx wrangler d1 migrations list pannes-historiques`

Expected: Wrangler can parse the migrations directory.

### Task 3: Worker Import And Backfill Endpoints

**Files:**
- Modify: `src/worker.js`
- Modify: `src/municipal-archive.js`

- [x] **Step 1: Import helper functions into Worker**

Add imports from `./municipal-archive.js`.

- [x] **Step 2: Add operational-only runtime endpoints**

Add `/api/durable/status`-guarded paths under `/api/durable/runtime`:
- `POST /api/durable/runtime/admin-territories/import`
- `POST /api/durable/runtime/municipal-archive/backfill`
- `GET /api/durable/runtime/municipal-archive/status`

These must require `isOperationalRequest(request, env)`.

- [x] **Step 3: Implement territory import**

Fetch ArcGIS municipality layer `MapServer/2/query` as GeoJSON with `outSR=4326`. Upsert the 1,343 territory rows into `admin_territories`, including full and simplified display geometry.

- [x] **Step 4: Implement resumable bin backfill**

Process a bounded `limit` of `hydro_polygon_geometries` rows where `source_type='bispoly'`, assign each polygon to territories, and upsert rows into `previous_outage_territory_bins`.

- [x] **Step 5: Implement status endpoint**

Return counts for territories, total bins, primary bins, overlap bins, and processed polygon rows.

### Task 4: Runtime Archive Reads

**Files:**
- Modify: `src/worker.js`

- [x] **Step 1: Prefer municipal bins in no-address archive summary**

Update `runtimePreviousArchiveSummaryResponse` to read territory-binned previous outages when primary bins exist, including territory counts and latest/largest items.

- [x] **Step 2: Add fallback**

If no primary bins exist, preserve the existing `resolved_events` summary behavior.

- [x] **Step 3: Keep map-layer fallback**

Do not remove the current previous map-layer path in this change. It remains the fallback until the UI is explicitly changed to display territory bins.

### Task 5: Verification

**Files:**
- Existing files only

- [x] **Step 1: Run JavaScript tests**

Run: `node --test tests/municipal-archive.test.js`

- [x] **Step 2: Run JS formatting/checks**

Run: `npm run format`
Run: `npm run check`

- [x] **Step 3: Run Wrangler dry run**

Run: `npx wrangler deploy --dry-run`

- [x] **Step 4: Report production follow-up**

Do not apply remote migrations or deploy unless explicitly asked. Report the commands needed to import territories and backfill bins after deployment.

Current follow-up after completion:

- Continue using `scripts/maintenance/municipal-archive-backfill.mjs` for bounded resumable maintenance.
- Keep operational runtime endpoints private and require the operation token.
- Verify both the Worker version and container/static marker after any future deploy that touches archive-bin display or Worker runtime code.
