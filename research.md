# Research: Hydro-Québec Historic Outage Data

Date: 2026-04-25
Last updated: 2026-05-04

## Implementation note

The prototype now ingests several of the published access-to-information extracts identified in this research:

- `DAI-2022-0386` Côte Saint-Luc XLSX: row-level events are extracted.
- `DAI-2025-0275` Outremont PDF: regular row-level table extraction is implemented.
- `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF: regular row-level table extraction is implemented.
- `DAI-2025-0333` Saint-Félix-de-Kingsey PDF: regular row-level table extraction is implemented.

The app stores those records separately from live Info-pannes API records, attaches disclosed-area outlines from OSM/Nominatim/Overpass where available, and renders DAI areas as broad historical context behind the more granular live/API outage layers.

## Short answer

Yes, Hydro-Québec exposes machine-readable outage data, but it appears to be designed for **current / near-real-time** outages and **upcoming planned interruptions**, not a published long-term historical archive.

The strongest findings are:

1. Hydro-Québec has a documented open-data API for current outages and planned interruptions.
2. The API is live today and returns JSON plus KMZ/KML geometry.
3. I did **not** find a public bulk dataset for multi-year historical outages across Quebec.
4. Hydro-Québec clearly has some internal history, because it offers a form to request outage history for a **specific address** for the **past five years**.
5. If we want province-scale historical hotspot analysis, the most reliable path is probably:
   - start archiving the live API now, and
   - separately ask Hydro-Québec for bulk historical data through the open-data team and/or a formal access request.

## What exists publicly

### 1. Official Hydro-Québec outage API

Hydro-Québec publishes an open-data page for **ongoing outages and planned service interruptions**:

- [Hydro-Québec open-data page for outages](https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/)
- [French API description](https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/information/?flg=fr-fr)

That page documents these endpoints:

- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/bisversion.json`
- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/bismarkers{BIS_VERSION}.json`
- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/bispoly{BIS_VERSION}.kmz`
- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/aipversion.json`
- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/aipmarkers{AIP_VERSION}.json`
- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/aippoly{AIP_VERSION}.kmz`

Hydro-Québec says this dataset is:

- updated every 15 minutes
- available since 2018-04-23
- daily temporal coverage
- licensed under CC BY-NC 4.0 on the Hydro open-data pages

Relevant sources:

- [Ongoing outages and planned service interruptions](https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/?flg=en-us)
- [Open data overview](https://www.hydroquebec.com/documents-donnees/donnees-ouvertes/)
- [French dataset page mentioning outages](https://www.hydroquebec.com/documents-donnees/donnees-ouvertes/pannes-interruptions.html)

### 2. Live verification performed today

I verified the live endpoints on 2026-04-25.

Current versions returned:

- `bisversion.json` -> `"20260425130004"`
- `aipversion.json` -> `"20260425130005"`

Observed payload shape today:

- `bismarkers...json`
  - top-level object with keys `messages` and `pannes`
  - `pannes` is an array of 10-element arrays
  - current sample size at fetch time: `18`
- `aipmarkers...json`
  - top-level array
  - each element is a 16-element array
  - current sample size at fetch time: `153`

Observed outage sample:

```json
[
  1,
  "2026-04-25 12:53:55",
  "",
  "P",
  "[-71.55149385984295, 46.628426225317064]",
  "N",
  "",
  "",
  "6051",
  ""
]
```

Observed planned interruption sample:

```json
[
  1,
  "126977",
  "2026-05-12 17:30:00",
  "2026-05-12 23:59:59",
  "2026-05-12 17:30:00",
  "2026-05-12 23:59:59",
  "",
  "",
  "",
  "",
  "67",
  "85",
  "",
  "38010",
  "N",
  "[-72.36269506393316, 46.380284498884436]"
]
```

I also verified that the polygon file is real and usable. The live `bispoly...kmz` currently contains a `doc.kml` file with polygon geometries and centroid metadata for outage areas.

Important nuance:

- the documentation explains many fields, but the current live payload includes some values not fully described in the docs, such as status `"N"`.
- that means we should archive the raw payloads exactly as received and only normalize them in a second step.

### 3. “Archive mode” is not a real historical archive we can rely on

The Hydro-Québec open-data page mentions a **Current outages - Archive mode** and links to:

- `https://pannes.hydroquebec.com/pannes/donnees/v3_0/open_data/`

But when checked on 2026-04-25, that URL redirected to a Hydro-Québec 404 page.

So although the docs mention an archive mode, I did **not** find a working public day-by-day archive index that we can rely on for bulk historical recovery.

## What does not seem to exist publicly

### 1. No obvious bulk historical outage dataset

I checked Hydro-Québec’s open-data materials and Données Québec listings. Hydro-Québec’s public data catalog clearly exposes power-related datasets, but I did not find a dataset that looks like:

- multi-year outage history
- outage durations by municipality
- repeated outage hotspot summaries
- feeder-level SAIDI/SAIFI-style public reliability metrics

Useful references:

- [Hydro-Québec organization on Données Québec](https://donneesquebec.ca/recherche/organization/about/hydro-quebec)
- [Hydro-Québec open datasets listing on Données Québec](https://www.donneesquebec.ca/recherche/dataset/?inv_access_level=open&organization=hydro-quebec)

That organization listing showed open Hydro-Québec datasets, but nothing I found looked like a province-wide historical outage archive.

### 2. Brownout data is probably not available in this feed

The public outage materials consistently talk about:

- outages (`pannes`)
- planned interruptions
- emergency interruptions

I did **not** find evidence that the public API exposes true **brownout / undervoltage** events as a separate class.

So if the product goal is specifically “blackouts and brownouts,” the likely situation is:

- **blackouts / interruptions:** yes, the public feed supports them
- **brownouts / low-voltage events:** probably not, at least not in the public outage API I found

If brownouts matter, that becomes a separate data-acquisition problem and likely requires Hydro-Québec cooperation.

Relevant source:

- [Hydro-Québec outages FAQ](https://www.hydroquebec.com/poweroutages/understand-and-prevent/faq.html)

## Evidence Hydro-Québec has historical data internally

This is the strongest signal that history exists behind the scenes:

- [Past power failure or scheduled outage information form](https://www.hydroquebec.com/sefco2016/contact-us/past-outage.html)

That form says users can request information about outages that occurred in the **past five years** for a **particular address**.

This does not give us bulk machine-readable access, but it shows Hydro-Québec likely stores outage history with address-level lookup capability.

## Published access-to-information outage extracts

Hydro-Québec also publishes responses to access-to-information requests:

- [Responses to access-to-information requests](https://www.hydroquebec.com/documents-donnees/loi-sur-acces/diffusion-informations/reponses-acces-information.html)

On 2026-05-01, I reviewed the published entries whose titles contain `pannes`. This is an important new data source because it shows Hydro-Québec has already disclosed outage history in several forms:

1. regional annual aggregates
2. municipality or borough-level event lists
3. at least one machine-readable XLSX extract
4. event/storm summaries

These documents are not a complete province-wide historical archive, but they are useful evidence and can be partially ingested.

### Most useful row-level extracts

The most useful documents are row-level extracts with start time, end time, duration, cause, and sometimes municipality:

- [DAI-2025-0275 document: Pannes dans l'arrondissement Outremont - 2023-2025](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0275-document.pdf)
  - PDF table
  - area: Outremont
  - fields observed: start datetime, end datetime, duration in seconds, cause
  - the letter says the request asked for outage records for the Outremont area for the last 24 months, including date, length, and cause
- [DAI-2026-0042 document: Pannes 2024-2025 - Municipalités de Sheenboro, Chichester, Allumettes et Waltham](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2026-0042-document.pdf)
  - PDF table
  - areas: Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, Waltham
  - fields observed: start datetime, end datetime, duration in seconds, cause, Hydro-Québec municipality name
- [DAI-2025-0333 document: Pannes à Saint-Félix-de-Kingsey - 2022-2024](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0333-document.pdf)
  - PDF table
  - area: Saint-Félix-de-Kingsey
  - fields observed: start datetime, end datetime, duration in seconds, cause, municipality
- [DAI-2024-0460 annexe: Pannes du 22 et 23 mai 2024 de la ville de Montréal](https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0460-annexe.pdf)
  - PDF table with an XLSX-origin title
  - area: Montreal and nearby island municipalities/boroughs
  - fields observed: start datetime, end datetime, duration in seconds, cause, municipality/borough

These row-level PDFs do not appear to provide exact outage polygons. They should be treated as area-level historical records, not precise building-level events.

### Machine-readable XLSX extract

The strongest machine-readable example is:

- [DAI-2022-0386 document: Côte Saint-Luc XLSX](https://www.hydroquebec.com/data/loi-sur-acces/xls/dai-2022-0386-document.xlsx)

The workbook has sheets including:

- `Sources`
- `Détails_Année_2020`
- `Détails_Année_2021`
- `Détails_Année_2022`
- `Sommaire`

Observed row-level columns include:

- `INT_COD_CED`
- `CLIENTS` / `NOMBRE_CLIENTS`
- `DATE_DEBUT_INTERRUPTION`
- `INT_DATE_FIN_INTERRUPTION`
- `DUREE (SEC)`
- `DUREE (HEURE)`
- `TYPE D'INTERRUPTION`
- `DESCRIPTION CAUSE DETAILLEE`
- `DESCRIPTION EQUIPEMENT`
- `GROUPECAUSE` / `GROUPE CAUSE`
- `CATEGORIE`

This workbook is useful for implementation because it proves that Hydro-Québec can disclose native electronic extracts with customer counts, interruption type, equipment, cause group, and category.

### Regional aggregate extracts

Several published documents provide annual metrics by administrative region:

- [DAI-2026-0077 document: Pannes par région administrative - 2025](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2026-0077-document.pdf)
- [DAI-2025-0479 document 1: Pannes par région administrative - 1er janvier au 30 septembre 2025](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0479-document-1.pdf)
- [DAI-2025-0479 document 2: Pannes par région administrative - 2024](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0479-document-2.pdf)
- [DAI-2025-0305 document: Pannes par région administrative - 2024](https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2025-0305-document.pdf)
- [DAI-2024-0012 document 1: Informations sur les pannes par régions administratives pour les années 2019 à 2023](https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0012-document-1.pdf)
- [DAI-2024-0237 document: Nombre de pannes de plus de 8 heures par région administrative, 2019 à 2023](https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0237-document.pdf)

Observed regional metrics include:

- number of raw outages of 5 minutes or more
- average raw outage duration in minutes
- gross continuity index in minutes
- count of raw outages over 8 continuous hours

These are useful for regional choropleth maps and trend charts, but not for address-level matching.

### Important limitation from sector-specific requests

The Joliette response is a useful warning:

- [DAI-2026-0033 letter: Indicateurs en lien avec les pannes (Joliette)](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2026-0033-lettre-reponse.pdf)

The requester asked for specific neighborhoods defined by street lists. Hydro-Québec replied that it did not hold a compiled document for those sectors and invoked article 15 because producing the requested sector-level compilation would require calculations or comparisons in its information systems. Hydro-Québec still provided municipal-level annual indicators for Joliette.

Planning implication:

- requests are more likely to succeed when they ask for existing extracts or records, not newly computed custom sectors
- the Outremont precedent is especially useful because a broad borough/area request was granted with row-level records
- the Côte Saint-Luc XLSX precedent is especially useful because native electronic data was disclosed

### Ingestion implication

These access-to-information records should be stored separately from live Info-pannes snapshots because they have different provenance, precision, and geometry assumptions.

Recommended data classes:

- `disclosure_sources`: one row per DAI document or attachment
- `disclosure_outage_events`: row-level historical events extracted from PDFs/XLSX
- `disclosure_annual_metrics`: regional or municipal aggregate metrics from PDF tables

For map display, disclosed records should carry a precision label such as:

- exact or approximate point
- municipality-level record
- borough-level record
- administrative-region aggregate

They should not be mixed visually with live API polygons without a clear legend.

## Paths to get older data

### Option A. Ask the Hydro-Québec open-data team for a bulk historical export

Hydro-Québec has a contact form specifically for open-data requests:

- [Contact the Open Data team](https://www.hydroquebec.com/sefco2016/en/open-data-contact-us.html)

This is probably the best first move if the request is framed precisely:

- desired geography: all Quebec
- desired period: from 2018-04-23 onward, or the longest available
- desired granularity: outage event records and polygons if possible
- desired fields: start time, estimated restoration time, final restoration time if available, affected customers, municipality code, outage cause, geometry/polygon or centroid
- desired format: NDJSON, GeoJSON, CSV + geometry, or parquet
- usage: non-commercial public-interest visualization / research

### Option B. File a formal access-to-information request

Hydro-Québec has a formal access request process:

- [Access to information section](https://www.hydroquebec.com/documents-donnees/loi-sur-acces/)
- [Request access to documents](https://www.hydroquebec.com/documents-donnees/loi-sur-acces/demande-acces-document.html)
- [Access request form](https://www.hydroquebec.com/sefco2016/nous-joindre/acces-document.html)

Important limitation from Hydro-Québec’s own page:

- they only have to provide **existing documents**
- they do **not** have to create a new document for the request

So the request should be framed around an existing dataset or export, not “please compute hotspot scores for me.”

Best framing:

- request copies of existing historical outage datasets, extracts, or logs used by Info-pannes
- ask for existing documentation/data dictionary for BIS/AIP formats and any historical retention policy
- ask whether there is an existing archived export for `bismarkers`, `bispoly`, `aipmarkers`, `aippoly`

### Option C. Recover partial history from public web archives

I checked the Internet Archive / Wayback Machine index for Hydro-Québec outage endpoints.

Findings:

- `bisversion.json` has archived captures.
- `bismarkers...json` also has archived captures, but they appear sparse.
- I successfully recovered an archived outage payload from 2018-02-01 via Wayback.
- A quick prefix count suggested only **3** archived `bismarkers` captures were easily discoverable this way in the CDX index query I ran.

That means Wayback is potentially useful for:

- proving the feed existed earlier
- recovering a handful of historical examples

But it does **not** look like a dependable path for a complete province-wide historical dataset.

## Recommended data-collection strategy

If the goal is a serious historical hotspots app, the practical strategy is:

1. Start your own collector immediately.
2. Ingest published access-to-information disclosures as a separate historical source.
3. In parallel, request broader bulk history from Hydro-Québec.
4. Use sparse public archive recovery only as a supplement.

### What to collect every 15 minutes

From the live feed, archive:

- raw `bisversion.json`
- raw `bismarkers{version}.json`
- raw `bispoly{version}.kmz`
- raw `aipversion.json`
- raw `aipmarkers{version}.json`
- raw `aippoly{version}.kmz`

Why archive both markers and polygons:

- markers give customer count, timestamps, cause codes, municipality ID, and centroid
- polygons give the approximate footprint needed for maps and hotspot aggregation

### Storage design

Use a layered approach:

#### Bronze: immutable raw snapshots

Store the original responses exactly as returned.

Suggested path scheme:

```text
raw/
  hydro_quebec/
    bisversion/date=2026-04-25/time=2026-04-25T13-00-04Z.json
    bismarkers/version=20260425130004.json
    bispoly/version=20260425130004.kmz
    aipversion/date=2026-04-25/time=2026-04-25T13-00-05Z.json
    aipmarkers/version=20260425130005.json
    aippoly/version=20260425130005.kmz
```

Recommended object store:

- Cloudflare R2
- S3
- Backblaze B2
- even local disk at first, if volume is still modest

#### Silver: normalized event tables

Normalize into tables such as:

- `outage_snapshots`
  - snapshot_time
  - version
  - record_index
  - customers_affected
  - outage_start_time
  - estimated_restore_time
  - interruption_type
  - crew_status
  - cause_group_code
  - cause_detail_code
  - municipality_code
  - centroid_lon
  - centroid_lat
  - raw_record_json
- `outage_polygons`
  - snapshot_time
  - version
  - polygon_id
  - centroid_lon
  - centroid_lat
  - geometry
- `planned_interruptions`
  - snapshot_time
  - version
  - notice_id
  - customers_affected
  - scheduled_start
  - scheduled_end
  - actual_start
  - actual_end
  - postponed_start
  - postponed_end
  - rescheduled_start
  - rescheduled_end
  - cause codes
  - municipality_code
  - centroid
  - raw_record_json

#### Gold: analytic tables for the app

Build derived tables such as:

- `outage_events_deduped`
- `hotspots_hex_5km_daily`
- `municipality_monthly_reliability`
- `cause_mix_by_area`
- `storm_clusters`

### The hard part: deduplicating snapshots into events

The API is a stream of snapshots, not a clean historical event table. So one outage will appear in multiple consecutive snapshots.

You will need reconciliation logic that groups records into the same outage event using a combination of:

- outage start time
- municipality code
- centroid proximity
- geometry overlap
- customer count trajectory
- type (`P` vs `I`)

Best practice:

- preserve raw snapshots forever
- build a separate event-resolution pipeline that can be improved over time

## Strategic interpretation

The most important product question remains:

`How likely is this area to lose power, based on what has happened before?`

The latest findings make that question more approachable than it first appeared.

At the beginning, the historical-data outlook looked like a hard binary:

- either wait one or two years for a self-built archive to mature
- or hope Hydro-Québec provides a broad historical export

The published access-to-information disclosures create a meaningful middle path.

They do not provide a complete province-wide archive, and they should not be treated as equivalent to the live Info-pannes feed. But they do show that:

- Hydro-Québec has structured historical outage data internally
- some row-level history has already been released publicly
- at least some disclosures can be delivered in machine-readable form
- historical usefulness does not need to wait entirely on our own archive

This changes the strategic outlook.

The future data strategy is better understood as three parallel tracks:

1. live-feed archival
2. published access-to-information disclosures
3. direct requests for broader historical backfill

This matters because it means the product does not need to jump directly from "thin local archive" to "complete Quebec reliability map." There is now a realistic intermediate layer of historical area context.

## What this means for product viability

The project looks more viable now than it did when it depended only on forward collection.

A useful early product can plausibly combine:

- address-level and nearby history derived from the live archived feed
- broader area history where disclosure records exist
- regional context from annual aggregate disclosures
- explicit coverage and provenance language so users can see what kind of evidence supports a result

This still leaves important limitations:

- historical coverage will remain uneven for a while
- many disclosed records are area-level rather than geometry-rich
- event reconstruction from repeated live snapshots remains a central technical problem

But the combined evidence model is strong enough to support a real public-interest product before full historical completeness exists.

## What to present in the web app

If we can gather enough history, the most useful presentation is not a map of single outages but a **reliability map**.

### Core views

1. Hotspot map
   - hexbin or grid map of Quebec
   - color by cumulative outage-hours or customer-hours
   - optional toggle for outage count vs duration vs customer impact

2. Municipality ranking
   - rank municipalities by:
     - total outage-hours
     - customer-hours interrupted
     - median restoration time
     - interruptions per 1,000 customers

3. Time explorer
   - monthly / seasonal trend charts
   - storm-event overlays
   - year-over-year comparison

4. Cause explorer
   - weather vs vegetation vs equipment vs accident/incident

5. Single-place profile
   - show one municipality / MRC / region over time
   - outage burden
   - typical causes
   - most severe days

### Best metric for “hotspot”

Simple outage count is not enough. Better metrics:

- **customer-hours interrupted**
  - affected customers x outage duration
  - best public-impact proxy if we only have snapshot data
- **outage-hours**
  - total duration of unique outage events
- **frequency**
  - count of unique outage events
- **severity**
  - percentile-based score combining duration and customer impact

If customer denominators are available by municipality or region, also compute:

- interruptions per 1,000 customers
- customer-hours interrupted per 1,000 customers

That avoids maps being dominated only by dense urban areas.

## Practical recommendation

If I were advising on next steps without coding yet, I would do this:

1. Treat the public API as confirmed and usable.
2. Assume public historical coverage is incomplete.
3. Start archiving the live API immediately at 15-minute intervals.
4. Ingest the highest-value published access-to-information disclosures first, especially machine-readable extracts and regular row-level PDF tables.
5. Send two formal requests in parallel:
   - an open-data request for bulk historical outage exports
   - an access-to-information request for any existing historical extracts/docs used by Info-pannes
6. Design the product around **blackouts / interruptions** first.
7. Treat **brownouts** as a separate stretch goal unless Hydro-Québec confirms they expose them somewhere else.

## Suggested wording for outreach

### Open-data team request

I’m building a non-commercial research/public-interest project about historic outage hotspots in Quebec. I found your real-time Info-pannes open-data endpoints (`bismarkers`, `bispoly`, `aipmarkers`, `aippoly`) but I could not find a public bulk historical archive. Does Hydro-Québec offer an existing export of historical outage and planned interruption data, ideally from 2018-04-23 onward, including timestamps, affected customer counts, municipality identifiers, and geometry or centroids? If so, I would appreciate the dataset, schema, retention policy, and license details.

### Access request framing

Please provide any existing documents, datasets, extracts, retention schedules, or technical documentation held by Hydro-Québec relating to the historical data behind the Info-pannes / Power Outages service, including but not limited to the BIS and AIP datasets, `bismarkers`, `bispoly`, `aipmarkers`, and `aippoly`, for the longest period available. If full historical extracts are available as existing records, please provide them in their native electronic format along with any existing data dictionary or schema documentation.

## Bottom line

There is enough public evidence to justify the project.

- The live outage feed is real.
- It is machine-readable.
- It includes timestamps, customer counts, municipality codes, centroids, and polygons.
- Public long-term history does not appear to be cleanly published.
- Hydro-Québec almost certainly has historical data internally.

So the viable strategy is:

- build your own archive now,
- try to obtain bulk history officially,
- and present the results as a reliability / outage-hotspot product rather than a replay of the current outage map.

## 2026-05-04: D1 and deployment performance research

This section records the first storage/deployment research pass after putting the prototype on Cloudflare Workers + Containers at `pannes.ca`. It is intentionally not a migration plan yet.

### Current production/storage shape

The deployed app is currently:

- a Python Flask app running in Cloudflare Containers behind a Worker route
- using a baked-in SQLite snapshot inside the container image
- configured with production search refresh disabled, so a user search should not synchronously refresh Hydro-Quebec feeds
- using in-process caching for static search context such as coverage stats and map layers

The current local SQLite snapshot is small enough for D1 storage limits, but its contents are unevenly distributed:

- `data/app.db`: about 128 MB on disk locally
- `data/app.db.gz`: about 28 MB
- `data/raw`: about 20 MB
- largest SQLite tables by page size:
  - `disclosure_geometries`: about 104.7 MB
  - `outage_geometries`: about 6.8 MB
  - `planned_interruptions`: about 3.6 MB
  - `disclosure_outage_events`: about 1.8 MB
- important row counts:
  - `disclosure_geometries`: 126
  - `outage_geometries`: 7,008
  - `disclosure_outage_events`: 2,680
  - `raw_snapshots`: 470
  - `geocode_cache`: 21
  - `query_history`: 293

The key observation is that database size is dominated by a small number of large geometry rows, especially `disclosure_geometries`. That makes a pure "move the whole SQLite file to D1" migration less attractive than splitting relational/queryable data from bulky geometry payloads.

### Performance bottlenecks observed so far

Observed or inferred bottlenecks:

- container cold start and/or container wake can make the first request feel slow
- first address query does more work than a repeated query because app context and map layers may need to be loaded
- local service profiling after caching showed roughly 1.6 seconds for the first warm query and roughly 0.6 seconds for the repeated same-address query in the same process
- in production, the user still observed slow first and repeated same-address searches, so the remaining delay may include container wake, network/geocoding, map payload transfer, or browser-side rendering
- earlier container deployment attempts with large database/image layers saw local registry push instability; later code-only image-layer deploys were much faster and more reliable
- shell-level DNS/curl timing from this workstation was unreliable after launch even while the user's browser resolved `pannes.ca`, so production timings still need a browser-based or Cloudflare-log measurement pass

Production profiling update from 2026-05-04:

- Added structured request timing logs, `Server-Timing` headers, and `/debug/timing/search`.
- Simple production home page baseline is fast: about 0.28 seconds total for `GET /`.
- The first profiled production search before optimization took about 112 seconds inside Flask, with Worker-to-container time matching app time. That ruled out DNS and Worker routing as the primary bottleneck.
- The worst pre-optimization app steps were:
  - `search.regional_metric_layers`: about 58 seconds
  - `search.find_archived_outage_matches`: about 17 seconds
  - `search.find_current_matches`: about 13 seconds
  - `search.find_disclosure_matches`: about 11 seconds
  - `search.disclosure_layers`: about 10 seconds
- The real HTMX search response before optimization was about 14.4 MB, because the app embedded global regional/disclosure map layers and large geometry/event payloads directly in the HTML.
- After removing global regional/disclosure map layers from the per-address response, short-circuiting far-away geometry matching, and lazy-loading disclosure geometry only for matched disclosure rows:
  - local debug search dropped to about 0.39-0.49 seconds
  - production debug search samples were about 0.64 seconds on a fresh app-context build and about 4.5 seconds on a later warm sample
  - production real HTML search response dropped to about 562 KB
  - production real HTML search took about 6.1 seconds total in the measured sample

Interpretation:

- The container runtime itself is not the main issue for simple requests.
- The lite container's 0.0625 vCPU makes Python geospatial loops much more expensive than local execution.
- Payload size was a major user-visible issue and has been reduced substantially.
- Remaining production search latency is mostly CPU-bound matching work: current outage matching, archived outage matching, and disclosure matching.
- D1 may help once relational filters and indexes replace some Python-side scanning, but the immediate lesson is not "move all data to D1"; it is "avoid full-map/full-geometry work in an address search."

Follow-up performance ideas to evaluate later:

- Render the text/result-card response first, then lazy-load map overlays. Users should see useful outage results before the map finishes.
- Replace inline `data-map` JSON with separate JSON endpoints, so HTML remains small and map payloads can be cached, measured, and fetched independently.
- Precompute or index geometry relationships so address searches do not repeatedly scan large geometry sets in Python.
- Move raw and large geometry payloads out of the hot path. A likely Cloudflare-native shape is R2 for bulky GeoJSON/KML-derived payloads plus D1 for metadata, lookup tables, and indexes.
- Keep larger container instances as a later lever, not the first fix. More CPU would help, but it should come after removing avoidable full-scan and full-payload work.

Measurements still needed before changing architecture:

- home page response after idle
- first query after idle
- repeated same-address query
- different-address query
- deploy with unchanged database layer: recent code-only container deploys were roughly 12-18 seconds end to end after the Worker upload, Docker build, layer push, and Cloudflare container app update
- deploy with changed database layer
- Cloudflare dashboard observations for container status, cold starts, and request duration where available

### Cloudflare D1 fit

D1 is promising for the app's durable, queryable data because it is SQLite-based and the current schema is already SQLite. It fits especially well for:

- `geocode_cache`
- `query_history`
- normalized outage records
- planned-interruption metadata
- disclosure source metadata
- disclosure outage events
- annual/regional metrics
- raw snapshot metadata and version tracking

D1 is less obviously right for large GeoJSON payloads:

- D1 has a maximum string/BLOB/row size of 2 MB.
- Even when individual rows fit, D1 bills reads by rows scanned, not bytes transferred, so large geometry rows can look cheap in row-count terms while still being expensive in latency, serialization, and Worker CPU/memory.
- The current largest table, `disclosure_geometries`, is about 104.7 MB across only 126 rows. That is a signal to avoid treating D1 as the primary object store for geometry blobs.

The better Cloudflare-native shape is probably hybrid:

- D1 for indexed relational data and small derived geometry metadata
- R2 for raw snapshots, large GeoJSON/KML/KMZ-derived payloads, and possibly precomputed map-layer artifacts
- a Worker or container route that returns only the geometry needed for the current address/query viewport

### D1 access from the current Python container

D1 is exposed most naturally as a Worker binding. Cloudflare's Worker Binding API examples use `env.MY_DB.prepare(...).run()` from Worker code, not a normal SQLite file path. That means the current Flask container cannot simply replace `sqlite3.connect("data/app.db")` with a D1 connection string.

There are practical options, each with a tradeoff:

1. Keep Flask + baked SQLite short term.
   - lowest migration risk
   - keeps the current app intact
   - does not solve durable production writes or image-layer churn

2. Put a Worker API boundary in front of D1.
   - Worker owns D1 bindings and exposes narrow query endpoints
   - Flask container calls those endpoints or the edge Worker serves some JSON directly
   - requires careful API design and authentication/secrets handling

3. Use Cloudflare's D1 REST API from Python.
   - technically possible through the account/database query endpoint
   - adds network/API-token handling and is less attractive for hot user-path queries than Worker bindings
   - better suited to admin/import jobs than every production search

4. Move the relevant read/query path into Worker-native code.
   - probably best long-term Cloudflare fit if D1 becomes central
   - larger rewrite because the current Python search/service layer is already functional

Given those options, D1 should be prototyped behind a very small Worker endpoint first, not adopted as a full storage migration in one step.

### Pricing and expected cost

Cloudflare's current D1 pricing documentation says D1 bills by rows read, rows written, and storage. On Workers Paid, the first 25 billion rows read per month, first 50 million rows written per month, and first 5 GB of storage are included; overages are priced at $0.001 per million rows read, $1.00 per million rows written, and $0.75 per GB-month of extra storage.

For this app's current scale:

- the current SQLite snapshot is far below the 5 GB included D1 storage on Workers Paid
- current write volume is tiny unless we start frequent production snapshot ingestion into D1
- read volume should be comfortably inside included allowances if queries stay indexed and avoid repeated full-table scans
- geometry payload handling is the main cost/performance concern, not D1's headline storage price

Cost conclusion: D1 is likely cost-effective for relational app data on the current Workers Paid plan. The bigger question is latency and architecture, especially because the current app runs in Python inside a container rather than directly in Worker JavaScript/TypeScript.

### D1 limits relevant to this app

Current Cloudflare D1 limits to keep in mind:

- 10 GB maximum database size on Workers Paid
- 1 TB maximum storage per account on Workers Paid
- 2 MB maximum string, BLOB, or row size
- 30 second maximum SQL query duration
- each individual D1 database processes queries one at a time
- indexed point reads can be very fast, but full scans or large migrations need batching

Those limits support using D1 for normalized events, metrics, cache entries, and source metadata. They argue against storing large raw files or large pre-rendered map layers directly in D1.

### Docker Desktop and deployment risk

Docker Desktop does not appear to require a paid subscription for this project if it remains personal, educational, non-commercial open source, or within Docker's small-business limits. Docker's current license page says Docker Desktop is free for personal use, education, non-commercial open source projects, and small businesses with fewer than 250 employees and less than $10 million in annual revenue.

That licensing point is separate from deployment reliability. We have already seen local image push instability when large layers were involved. Even if Docker Desktop remains free to use, the deployment workflow may still justify:

- Cloudflare Workers Builds connected to GitHub
- a CI-based `npx wrangler deploy`
- avoiding frequent database-layer image rebuilds
- storing bulky mutable data in R2/D1 instead of baking it into the image

### Recommendation

Stay with baked SQLite in the container for the immediate short term, but do not make it the long-term durable storage story.

Next research/prototype step:

1. measure production timings from browser and Cloudflare logs
2. prototype a D1 import for the relational tables only
3. keep large geometry/raw payloads in SQLite for the prototype or move them to R2 in a focused experiment
4. test one Worker endpoint that reads from D1 and returns a small result for an address/search support query
5. compare that result with the current Flask/SQLite path before touching the main app

Expected target architecture if the prototype confirms D1 performance:

- D1: durable metadata, normalized events, geocode cache, query history, indexes, metrics
- R2: raw snapshots, source files, large GeoJSON/KML-derived artifacts, optional precomputed map payloads
- Container or Worker: app/search orchestration
- Worker binding: preferred D1 access path for production user requests

The migration should be driven by measured latency and deploy reliability, not by the fact that D1 is available.

## 2026-05-05: Durable scheduled ingestion implementation

This is the first production step toward the hybrid D1/R2 architecture described above. It does not migrate the user-facing search path yet.

Implemented Cloudflare resources:

- D1 database: `pannes-historiques`
- D1 database id: `2981e056-fb74-47d9-b67f-8215fea0ef19`
- R2 bucket: `pannes-historiques-raw`
- Worker bindings:
  - `DB` for D1
  - `RAW_BUCKET` for R2

Implemented schema:

- `feed_versions` tracks current `bis` and `aip` versions and check times.
- `hydro_snapshots` records raw snapshot metadata, content type, status, SHA-256, and R2 object key.
- `current_outage_records` stores the latest normalized `bismarkers` rows.
- `current_planned_interruptions` stores the latest normalized `aipmarkers` rows.
- `resolved_events` accumulates seen outage/planned records across feed versions using a conservative derived key.
- `ingestion_runs` records scheduled Worker run status and summaries.

Implemented schedules:

- `7,37 * * * *`: Worker checks `bisversion` and `aipversion`, downloads `bismarkers`, `aipmarkers`, `bispoly`, and `aippoly` only when the upstream version changed, writes marker rows to D1, writes raw payloads to R2, and calls the container `/cron/hydro` endpoint so the current Flask/SQLite app state is refreshed. The offset avoids polling exactly on common half-hour boundaries while upstream files may still be rolling out.
- `13 10 */14 * *`: Worker calls the container `/cron/disclosures` endpoint. The container also checks local job state and skips disclosure collection when it has run successfully within the last 14 days.

Important architectural boundary:

- Local development still defaults to user-query-time Hydro API refresh.
- Production still sets `AUTO_REFRESH_ON_SEARCH=0`, so user searches should not synchronously call the Hydro API.
- The current Flask search path still reads the container SQLite database, not D1 directly.
- D1 is now the durable production feed ledger and normalized marker store; R2 is the durable raw payload archive.
- Polygon KMZ payloads are archived in R2, but Worker-side polygon parsing into durable geometry/index tables is still a follow-up.
- Durable DAI/R2 persistence is not complete yet; the first DAI schedule still runs the existing container disclosure collector.

Verification performed:

- `npx wrangler d1 migrations apply pannes-historiques --remote` applied the D1 schema.
- `npx wrangler r2 bucket create pannes-historiques-raw` created the R2 bucket after R2 was enabled on the account.
- `npx wrangler deploy --dry-run` confirmed bindings for `DB`, `RAW_BUCKET`, and `PANNES_CONTAINER`.
- `npx wrangler deploy` deployed Worker version `dc9a3452-1a39-480a-9c0f-9f5051a7eb9b` with both cron schedules.
- `https://pannes.ca/api/durable/status` responded with the expected empty D1 state before the first scheduled run.

Open verification:

- Wait for the next half-hour cron run and confirm `feed_versions`, `hydro_snapshots`, and `ingestion_runs` are populated.
- Confirm raw R2 objects are written for version, marker, and polygon payloads once a changed Hydro feed version is seen.
- Add a safer internal/manual trigger path if scheduled-run debugging becomes necessary; avoid exposing unauthenticated public write endpoints.

## Sources

- [Hydro-Québec open data overview](https://www.hydroquebec.com/documents-donnees/donnees-ouvertes/)
- [Ongoing outages and planned service interruptions dataset](https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/?flg=en-us)
- [French API description for outages dataset](https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/information/?flg=fr-fr)
- [French page for outages/interruption open data](https://www.hydroquebec.com/documents-donnees/donnees-ouvertes/pannes-interruptions.html)
- [Hydro-Québec organization page on Données Québec](https://donneesquebec.ca/recherche/organization/about/hydro-quebec)
- [Hydro-Québec open datasets listing on Données Québec](https://www.donneesquebec.ca/recherche/dataset/?inv_access_level=open&organization=hydro-quebec)
- [Past outage information form](https://www.hydroquebec.com/sefco2016/contact-us/past-outage.html)
- [Open data contact form](https://www.hydroquebec.com/sefco2016/en/open-data-contact-us.html)
- [Access to information section](https://www.hydroquebec.com/documents-donnees/loi-sur-acces/)
- [Access request guidance](https://www.hydroquebec.com/documents-donnees/loi-sur-acces/demande-acces-document.html)
- [Access request form](https://www.hydroquebec.com/sefco2016/nous-joindre/acces-document.html)
- [Outages FAQ](https://www.hydroquebec.com/poweroutages/understand-and-prevent/faq.html)
- [Hydro-Québec responses to access-to-information requests](https://www.hydroquebec.com/documents-donnees/loi-sur-acces/diffusion-informations/reponses-acces-information.html)
- [DAI-2025-0275 Outremont row-level outage document](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0275-document.pdf)
- [DAI-2026-0042 row-level outage document for Sheenboro, Chichester, Allumettes, and Waltham](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2026-0042-document.pdf)
- [DAI-2025-0333 Saint-Félix-de-Kingsey row-level outage document](https://www.hydroquebec.com/data/loi-sur-acces/pdf/DAI-2025-0333-document.pdf)
- [DAI-2022-0386 Côte Saint-Luc XLSX outage extract](https://www.hydroquebec.com/data/loi-sur-acces/xls/dai-2022-0386-document.xlsx)
- [DAI-2024-0012 regional outage metrics, 2019-2023](https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0012-document-1.pdf)
- [DAI-2024-0237 long outages over 8 hours by administrative region](https://www.hydroquebec.com/data/loi-sur-acces/pdf/dai-2024-0237-document.pdf)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 Workers Binding API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare D1 REST query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
- [Docker Desktop license agreement](https://docs.docker.com/subscription/desktop-license/)
