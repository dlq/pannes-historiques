# Pannes Historiques

Address-first Hydro-Quebec outage history prototype built from the `plan.md` direction.

## What is implemented

- bilingual French/English server-rendered UI
- HTMX search flow
- plain Web Components for timeline, cache freshness, and map shell
- SQLite persistence for addresses, queries, raw snapshots, parsed outages, planned interruptions, geometries, and derived matches
- raw Hydro-Quebec snapshot archival on local disk
- normalization and parsing pipeline for marker and KMZ/KML polygon feeds
- address normalization and cached geocoding with Nominatim plus a Quebec city-centroid fallback
- address-to-outage matching using polygon containment, centroid radius, and municipality fallback
- first-pass resolved event deduplication across repeated snapshots

## Run

```bash
python3 server.py serve
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Collect live Hydro-Quebec data

```bash
python3 server.py collect
```

This stores raw files under `data/raw/hydro_quebec/` and ingests normalized records into `data/app.db`.

## Notes

- The app preserves raw evidence and derives address views from it.
- The live collector depends on outbound network access.
- Geocoding first tries Nominatim. If that fails, the app falls back to municipality centroids for a small set of Quebec cities so the UX can still function during early development.
