# Maintenance Backlog

This backlog holds durable cleanup opportunities that are too detailed for `PLANS.md`.

## Simplify/Refactor Backlog

An adversarially verified simplify/refactor review on 2026-07-11 confirmed 47 behavior-preserving opportunities. The low-risk dead-code and dedup subset is applied and merged into `main` across services, views, sheet views, db, geocoding, hydro, web helpers, and client JS duplicates; net change was about `-100` lines with the full suite green.

Deferred, in rough priority:

- Server dedup not yet applied: `web.py` `require_*_route` guard boilerplate across 13 routes; `sheet_views.py` `address_domain_sheet_context` double domain dispatch and `radius_km` reuse.
- Done and merged into `main`: `disclosures.py` shared `_DISCLOSURE_EVENT_INSERT` constant across xlsx/pdf ingest, and `_regional_metric_base` helper deduping the province/admin ternary across the three regional-metric parsers. Key order was preserved because those rows are `json.dumps`'d whole into `disclosure_annual_metrics`.
- Implemented on `location-offline-cleanup` (not deployed): shared `ph_metric`, `ph_status_line` and `ph_date_tile` macros replace the repeated blocks. A before/after rendering comparison preserves semantic HTML for ten FR/EN overview/domain fragments; browser regression covers existing map/sheet interactions.
- Worker follow-up in `src/worker.js`: hold until after beta/cost work because this is a deployed hot path. Candidate cleanup includes `callContainer*`/`fetchContainer*` POST/bytes boilerplate, `markDisclosure*` helpers, repeated map-rows-to-prepared-statements-to-`batchInChunks` skeletons, and eventual module splitting of the large Worker file.
- Judgment calls with higher effort/risk: factor the shared post-geocode tail out of `search()` and `search_location()` in `services.py`; add a `DurableRuntimeClient` full-URL GET helper; merge near-identical `_operational_map_item` and `_previous_operational_map_item`; reduce `hydro.py` `*_if_changed` scaffold duplication; reconcile duplicated month/weekday tables between Python and JS.
- Explicitly do not change as simple cleanup: archive-summary windows/largest/latest shaping intentionally exists in both `services.py` and `src/worker.js` for Python container fallback versus Worker D1 paths.

## Behavior-Changing Bugs To Fix Deliberately

- Fixed on `location-offline-cleanup` (not deployed): geolocation denied, unavailable, timeout and absent-API states show the existing localized messages; controls recover and address search remains usable.
- Verified in the same cleanup: the asset-version generator updates browser import tokens and its check guards drift. The offline-only service-worker cache is bumped for the bilingual retry asset; app/search responses remain network-only.
