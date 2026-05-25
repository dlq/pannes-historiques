# Research: Hydro-Québec Historic Outage Data

Date: 2026-04-25
Last updated: 2026-05-19

## UI comparable notes for 0.2.0

Observed references and interpretation:

- Transit app is the strongest product comparable for the 0.2.0 interaction model. Its support docs describe the main screen as a map with the user's location plus nearby transit lines and next departures, and its product site emphasizes showing nearby options immediately with no required search. For pannes.ca, the analogous goal is: show the last/current local outage context immediately, keep the map present, and let live data refresh into place.
- Apple Maps is the strongest visual and interaction comparable for restraint: search and details are overlays on a persistent map, with focused panels rather than dashboard sections.
- Google Maps is useful for map/search/result/detail layering, selected marker/card behavior, and preserving spatial context while moving between search, browsing, and detail states. It should not be copied as a full feature model because pannes.ca should stay narrower and calmer.
- Citymapper is useful for dense but readable status cards and a "what should I do now?" bias.
- Waze is useful only for incident semantics such as reported-nearby language, freshness, and confidence/status treatment; its visual tone is not a fit.
- Zillow/Redfin/Airbnb-style map search is a useful reference for map/list synchronization, selected card-to-marker behavior, and mobile bottom-sheet browsing.
- Weather/radar apps are useful references for map layer toggles, legends, feed freshness, and making current-vs-historical overlays legible.
- PowerOutage.us and traditional utility outage maps are useful domain references for density, regional summaries, legends, and outage-count/status conventions. PowerOutage.us is not strongly mobile-first, but it is still a credible domain comparable rather than only a negative example. pannes.ca should borrow the useful outage-map conventions without becoming a GIS dashboard compressed into a phone viewport.

Sources checked:

- Transit support: https://help.transitapp.com/article/93-how-to-use-transit
- Transit product site: https://transitapp.com/
- Apple Maps: https://www.apple.com/maps/
- Google Maps overview: https://www.google.com/maps/about/
- Citymapper: https://citymapper.com/

Performance conclusion for 0.2.0:

- The map-first redesign should be built around stale-first startup with background refresh. A returning user should see the previous useful location, cards, selected state, and map viewport immediately from local browser cache while current outage/planned-interruption overlays refresh asynchronously.
- Cached state must be visibly labeled with age and refresh status so stale-first behavior feels intentional and honest.
- Current overlays should be separated from slow/static context geometry. Static DAI/regional geometry should use long-lived cache headers or static assets; current nearby/status data should use short TTLs; previous outage/history context can tolerate longer cache windows.
- The cheap container/VM path should not sit on the critical first-paint path when Cloudflare Worker, D1, R2, browser storage, or static assets can answer the startup need.

## Implementation note

Status-code decoding checkpoint:

- Hydro-Quebec's open-data catalogue for `pannes-interruptions` documents outage and planned-interruption status codes `A`, `L`, and `R`.
- English labels from the catalogue: `A` = `work assigned`, `L` = `crew at work`, `R` = `crew en route`.
- French labels from the catalogue: `A` = `travaux assignes`, `L` = `equipe au travail`, `R` = `equipe en route`.
- The same page lists a default/blank status, but it does not document the `N` status observed in current live payloads.
- Conclusion: decode `A`, `L`, and `R`; preserve unknown codes such as `N` as raw source codes until their meaning is verified.
- Source: https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/

The prototype now ingests several of the published access-to-information extracts identified in this research:

- `DAI-2022-0386` Côte Saint-Luc XLSX: row-level events are extracted.
- `DAI-2025-0275` Outremont PDF: regular row-level table extraction is implemented.
- `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham PDF: regular row-level table extraction is implemented.
- `DAI-2025-0333` Saint-Félix-de-Kingsey PDF: regular row-level table extraction is implemented.

The app stores those records separately from live Info-pannes API records, attaches disclosed-area outlines from OSM/Nominatim/Overpass where available, and renders DAI areas as broad historical context behind the more granular live/API outage layers.

As of 2026-05-06, production also has a Cloudflare-native durable ingestion layer:

- a Worker cron asks the container to collect changed Hydro-Québec payloads and mirrors normalized current outage and planned-interruption rows into D1 while archiving raw payloads in R2
- D1-backed lookup endpoints serve current nearby matches and accumulated previous-outage nearby matches to the production Flask/container search path
- a separate bounded two-week disclosure job mirrors parsed DAI source/event/metric/geometry metadata into D1 and archives reachable raw DAI source files in R2
- broad regional and DAI/disclosure map context is served through lazy map endpoints and precomputed static geometry assets, while previous outages without polygons render as centroid markers
- embedded SQLite remains part of the container implementation for local development and some disclosure/regional context, but it is no longer the only production data path

Production runtime map-layer checkpoint, 2026-05-19:

- A live Cloudflare deployment of the map-first UI exposed two production-only map-context regressions: `Pannes deja vues` was empty on the default page, and current/planned sections rendered centroid markers because the container consumed durable rows that did not include polygon geometry.
- The fix adds Worker runtime endpoints for operational map layers and previous map layers. They read D1 feed rows plus `hydro_polygon_geometries`, assign nearest Hydro polygon geometry where available, and return geometry-bearing Leaflet layer payloads to the Flask/container renderer.
- Flask now prefers those runtime endpoints when `DURABLE_RUNTIME_URL` is configured, then falls back to the older durable hydro endpoint and finally to local SQLite. View rendering now tolerates omitted optional layer fields from JSON payloads.
- Live verification after deployment version `9f607e6a-3e6f-4b3e-b660-51137cb5302e` showed `/?lang=fr&v=7a31f06c` returning HTTP 200 with 262 map matches, 201 current/planned operational layers with 201 geometries, and 36 previous-outage layers with 36 geometries.
- Rollout observation: a new deployment can briefly return `Error proxying request to container: The container is not running`; a `/healthz` request started the container, after which the same page and map payload checks passed. Future deploy verification should explicitly prime health and then check page payload geometry counts.

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

This was the first production step toward the hybrid D1/R2 architecture described above. Later 2026-05-05 and 2026-05-06 work connected production search to narrow D1-backed current and previous-outage nearby endpoints, while other disclosure/regional context still remains partly container/SQLite-backed.

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
- `idx_current_outage_records_nearby` and `idx_current_planned_interruptions_nearby` support the first D1-backed point/radius lookup.

Implemented schedules:

- `7,37 * * * *`: Worker checks `bisversion` and `aipversion`, downloads `bismarkers`, `aipmarkers`, `bispoly`, and `aippoly` only when the upstream version changed, writes marker rows to D1, writes raw payloads to R2, and calls the container `/cron/hydro` endpoint so the current Flask/SQLite app state is refreshed. The offset avoids polling exactly on common half-hour boundaries while upstream files may still be rolling out.
- `13 10 */14 * *`: Worker calls the container `/cron/disclosures` endpoint. The container also checks local job state and skips disclosure collection when it has run successfully within the last 14 days.

Important architectural boundary:

- Local development still defaults to user-query-time Hydro API refresh.
- Production still sets `AUTO_REFRESH_ON_SEARCH=0`, so user searches should not synchronously call the Hydro API.
- The current Flask search path now uses D1 for current outage/planned-interruption nearby marker matches when `DURABLE_NEARBY_URL` is set in production.
- Local development does not set `DURABLE_NEARBY_URL`, so it continues to use the local SQLite/API-refresh path.
- D1 is now the durable production feed ledger, normalized marker store, and current Hydro polygon geometry/index store; R2 is the durable raw payload archive.
- `/api/durable/nearby` is the first Worker/D1 read endpoint intended for the user-facing lookup path. It takes `lat`, `lon`, optional `radius_m`, and optional `limit`, then returns nearby current outage and planned-interruption marker rows sorted by distance.
- `/api/durable/history-nearby` is the second Worker/D1 read endpoint intended for the user-facing lookup path. It takes `lat`, `lon`, optional `radius_m`, `days`, and `limit`, then returns nearby accumulated outage events from `resolved_events`.
- Production Flask search uses `DURABLE_HISTORY_URL` for archived/previous outage matching. Local development does not set this URL, so local search still uses the local SQLite/API-refresh path.
- Polygon KMZ payloads are archived in R2 and parsed by the Worker into D1 `hydro_polygon_geometries`; a real production cron on 2026-05-12T14:07Z wrote `bispoly` version `20260512100020` with 113 polygons and `aippoly` version `20260512100021` with 137 polygons.
- Durable DAI/R2 persistence is not complete yet; the first DAI schedule still runs the existing container disclosure collector.

Verification performed:

- `npx wrangler d1 migrations apply pannes-historiques --remote` applied the D1 schema.
- `npx wrangler r2 bucket create pannes-historiques-raw` created the R2 bucket after R2 was enabled on the account.
- `npx wrangler deploy --dry-run` confirmed bindings for `DB`, `RAW_BUCKET`, and `PANNES_CONTAINER`.
- `npx wrangler deploy` deployed Worker version `dc9a3452-1a39-480a-9c0f-9f5051a7eb9b` with both cron schedules.
- `https://pannes.ca/api/durable/status` responded with the expected empty D1 state before the first scheduled run.
- After offsetting the schedule and fixing the Worker schedule handler, verified clean cron runs at `2026-05-06T02:37Z` and `2026-05-06T03:07Z`; the container summary returned `errors: []`.
- Verified R2 by downloading a remote `bismarkers` object referenced by `hydro_snapshots.r2_key`.
- Verified `/api/durable/nearby?lat=45.5227&lon=-73.6021&radius_m=5000&limit=50` returned 17 records in about 0.51 seconds from Cloudflare.
- After wiring Flask production search to `DURABLE_NEARBY_URL`, `/debug/timing/search` showed `search.durable_nearby_fetch` in the timing trace and current map layers dropped from about 205 global layers to 18 nearby D1 records for the test address.
- After adding `idx_resolved_events_nearby` and `/api/durable/history-nearby`, production `/debug/timing/search?q=5220%20Rue%20Jeanne-Mance&lang=fr` showed both D1 read paths active:
  - `search.durable_nearby_fetch`: about 371 ms
  - `search.durable_history_fetch`: about 60 ms
  - `search.find_archived_outage_matches`: about 61 ms
  - total app timing: about 681 ms
  - Cloudflare container fetch header for that request: about 2280 ms
- The previous container SQLite archived matching cost was roughly 1.2 seconds or more for the same test address, so moving previous-outage matching to D1 materially improved app-side latency.
- A transient D1 auth/API issue appeared while applying the `0003_history_nearby_index.sql` migration, then the migration applied successfully on retry.
- Production route timings after the D1 history deployment, measured from this development machine on 2026-05-06:
  - `/`: about 0.44 seconds total, 7.8 KB
  - `POST /search` for `5220 Rue Jeanne-Mance`: about 0.77 seconds total, 44 KB
  - `/search-map?q=5220 Rue Jeanne-Mance&lang=fr`: about 1.12 seconds total, 735 KB
  - `/map-context-geometries`: about 0.30 seconds total, 182 KB
- Current interpretation: D1 has removed the largest app-side SQLite scans from current and previous-outage nearby matching. The next visible performance work is likely lazy map payload/rendering and context assembly, not another immediate D1 point lookup.
- Local lazy map payload analysis showed that the biggest remaining embedded-map payload was disclosure detail, not R2-eligible geometry. The local `/search-map` HTML for `5220 Rue Jeanne-Mance` was about 912 KB before trimming, with about 600 KB coming from disclosure items carrying full `recentEvents` lists.
- After trimming disclosure map popup data to the 12 most recent events per area and rendering previous outages as centroid markers instead of embedding old outage polygons, the same local `/search-map` HTML dropped to about 358 KB. Production should be smaller because production current-feed map items come from D1 nearby rows rather than the local all-current map layer.
- After deploying the map payload trim as Worker/container version `0b68eef2-e0e1-4efe-84ea-4ad8f221cfd7`, production `/search-map?q=5220 Rue Jeanne-Mance&lang=fr` returned about 155 KB in about 0.74 seconds. This is down from about 735 KB before the trim.
- The trimmed production map payload contained 56 map items: 14 planned-interruption items, 17 previous-outage centroid markers, 17 regional metric items, and 8 disclosure items.
- A warm production debug search after this deploy showed app-side total timing around 208 ms, with D1 current nearby around 130 ms, D1 history around 72 ms, and previous-outage grouping around 2 ms.

Open verification:

- Keep monitoring offset cron runs over a longer period, including unchanged-version runs where only `checked_at` should update.
- Move remaining production hot-path reads out of the baked SQLite snapshot where it is clearly beneficial: DAI/disclosure summaries, regional metric context, and bulky geometry/map payloads.
- Parse and index polygon KMZ payloads from R2 only after deciding the right simplified geometry representation; avoid putting large raw geometry blobs directly in D1.
- Add a safer internal/manual trigger path if scheduled-run debugging becomes necessary; avoid exposing unauthenticated public write endpoints.

## 2026-05-06: Durable disclosure mirror setup

Implemented the first D1/R2 durability layer for Hydro-Québec access-to-information disclosures.

Implemented shape:

- Container/local SQLite remains the parser and local source of truth for disclosures.
- A private container-only export route, `/internal/disclosures/export`, returns already-parsed disclosure sources, outage events, annual metrics, and geometry metadata.
- The public Worker blocks `/internal/*` paths before container forwarding, so this export route is not publicly reachable through `pannes.ca`.
- D1 migration `0004_disclosure_mirror.sql` creates durable disclosure mirror tables:
  - `disclosure_sources`
  - `disclosure_outage_events`
  - `disclosure_annual_metrics`
  - `disclosure_geometries`
- R2 is used for raw DAI source files. Large GeoJSON geometry blobs are not mirrored into D1 in this stage; D1 stores geometry metadata such as centroid and bounding box.
- The two-week disclosure cron now runs the existing container disclosure collector, exports the parsed local data, mirrors it into D1, and archives raw source files in R2.
- The 30-minute Hydro cron includes a one-time disclosure bootstrap only when D1 `disclosure_sources` is empty, so the mirror does not wait two weeks for first population.

Verification:

- Local internal export returned HTTP 200 with counts: 32 sources, 2,680 events, 257 metrics, and 126 geometry metadata rows.
- Local internal export without the private header returned HTTP 404.
- `npx wrangler d1 migrations apply pannes-historiques --remote` applied `0004_disclosure_mirror.sql`.
- Deployment version `bf158bd3-cf33-40d6-8f9d-7d5c6703f14b` added the disclosure mirror code.
- A subsequent hardening deploy version `d975d0f1-8137-4b86-9db7-dbd432d59ad3` changed the scheduler so Hydro fetch failures do not prevent the disclosure bootstrap from running.
- A 2026-05-06T13:37Z scheduled Hydro run returned HTTP 406 from the Hydro `bisversion.json` endpoint before disclosure bootstrap ran. Local checks from this development machine returned HTTP 200 for the same URL with default curl, Worker-like `User-Agent`, and explicit `Accept` headers, so the 406 appears either transient or specific to the Cloudflare Worker-origin request path. The Worker now sends `Accept: application/json,text/plain,*/*` for Hydro fetches and records per-step cron errors instead of aborting all scheduled work on the first failure.

Open verification:

- Confirm the next 30-minute cron run bootstraps the D1 disclosure mirror, or investigate any `disclosures_bootstrap` error in `ingestion_runs`.
- After bootstrap, verify D1 counts match the local export counts and verify at least one raw DAI source object is present in R2.

Follow-up during the 2026-05-06T14:07Z cron:

- The Worker-side Hydro fetch still returned HTTP 406 for `bisversion.json`, even after adding explicit `Accept` headers.
- The container-side Hydro refresh in the same scheduled run returned HTTP 200 and fetched changed `bis`/`aip` version `20260506100016`.
- This strongly suggests the 406 is specific to direct Cloudflare Worker-origin fetches to Hydro, not a general problem with the endpoint or with our parser.
- The disclosure bootstrap succeeded despite the Worker-side Hydro 406 because scheduler steps now continue independently:
  - D1 mirror counts: 32 sources, 2,680 events, 257 metrics, 126 geometry metadata rows.
  - R2 raw source archive initially wrote 32 objects, but verification found the DAI-2022-0386 "xlsx" object was actually Hydro's small restricted-access HTML page. Worker direct fetches to `www.hydroquebec.com` have the same foreign/restricted-access problem.
- Fix: raw DAI R2 archival now copies bytes from the container's local `payload_path` through a private internal route instead of refetching source files directly from Hydro in the Worker.
- The first D1 disclosure mirror rows were cleared after deploying the fix, so the next 30-minute cron can bootstrap D1/R2 again with correct raw DAI source files.
- Because the container filesystem is ephemeral, the Worker must copy raw Hydro/DAI payloads during the same scheduled run that caused the container to fetch them. The cron flow now treats container-local files as a same-run handoff only; D1 and R2 are still the durable storage layer.
- Hydro D1/R2 ingestion now follows the same pattern as DAI: the container fetches/parses Hydro, then the Worker copies raw snapshot files from the container and mirrors normalized marker rows into D1. This avoids direct Worker-origin Hydro fetches, which were returning HTTP 406.
- The 2026-05-06T14:37Z real cron showed that combining Hydro refresh with a disclosure bootstrap is too fragile: the Hydro container call reported `Network connection lost`, and disclosure source-file archival returned 404s because the container had only exported baked-in DB metadata rather than refetched current payload files in that same run.
- Follow-up fix: keep the 30-minute Hydro cron limited to Hydro refresh and D1/R2 Hydro mirroring; leave DAI/disclosure downloading and R2 archival to the two-week disclosure cron. The production container image also needs the `curl` binary because the disclosure downloader falls back to `curl` when Python `urllib` fails against Hydro attachment URLs.
- After adding `curl`, a manual production `/collect/disclosures` smoke request no longer failed immediately with missing `curl`, but it ran longer than two minutes and was stopped before the next Hydro cron window. Treat full disclosure collection as too heavy for a single scheduled handoff; next implementation should chunk DAI ingestion by source or small batches and mirror each completed payload to R2/D1 independently.
- Chunking design: D1 is the production source of truth for which DAI sources are due (`r2_key` missing, `fetched_at` missing, or `fetched_at` older than 14 days). The scheduled Worker asks the container to collect only a small list of source keys, then immediately requests a filtered export for those same keys and mirrors that batch into D1/R2. Each run tracks attempted source keys so failures do not cause an infinite retry loop inside one scheduled invocation.
- Production batch proof on 2026-05-06: a temporary protected Worker route ran one selected small source (`DAI-2021-0328`) in about 7 seconds. The container fetched a PDF, the Worker archived it to R2 at `hydro_quebec/access_disclosures/DAI-2021-0328/83e8ed62886f3834-dai-2021-0328-lettre-reponse.pdf`, D1 stored `content_type='application/pdf'`, and the downloaded R2 object was verified as a PDF with SHA-256 `83e8ed62886f3834def5f88206b599137e08c2ed005a01a41f1c7f01be051f4f`. An earlier proof attempt against large `DAI-2022-0386` ran too long and was manually cancelled, so per-source timeout/skip handling is still needed for expensive sources.
- Follow-up implementation adds D1 archival attempt columns (`archival_attempt_count`, `archival_last_attempt_at`, `archival_last_error`, `archival_deferred_until`) and changes scheduled DAI catch-up to one source per batch with a per-source timeout/defer policy. This is intended to let the R2/D1 base finish for all reachable DAI sources while leaving expensive sources deferred instead of blocking the rest of the catch-up.
- Catch-up result on 2026-05-06: after deploying attempt/defer tracking, protected catch-up runs archived all immediately reachable disclosure sources. D1 reported `due_now = 0`, `archived = 29`, `total = 32`, and `deferred = 3`. Deferred sources were `DAI-2022-0386`, `DAI-2025-0275`, and `DAI-2025-0333`, each with a 45-second timeout and `archival_deferred_until` on 2026-05-07. This is acceptable for the R2/D1 base: reachable sources are durable in R2/D1, and expensive sources are explicitly tracked rather than silently blocking scheduled ingestion.
- Completion result on 2026-05-07: the deferred sources were processed successfully and the D1/R2 base catch-up finished. D1 reported `archive_due_now = 0`, `parse_due_now = 0`, and `32/32` disclosure sources archived and parsed.

Follow-up implementation on 2026-05-12:

- Added D1 runtime-state schema for production-only app state: geocode cache, addresses, query history, and saved address/outage match groups.
- Added `DURABLE_RUNTIME_URL` so the Cloudflare container can keep local SQLite behavior in local deployments while using Worker/D1 runtime endpoints in production.
- Added Worker runtime endpoints for geocode cache, address upsert, query recording/counts, saved match groups, collector/coverage status, and disclosure/regional map context.
- Production user-facing runtime state should no longer silently fall back to container SQLite when `DURABLE_RUNTIME_URL` is configured. If the D1 runtime endpoint fails, the affected production path should return an empty/default response or error instead of writing ephemeral container SQLite.
- Remaining SQLite dependency is now primarily the container parser/handoff implementation: Hydro and DAI collection still use the container's local SQLite as a same-run parse/export workspace before the Worker mirrors durable outputs to D1/R2. Removing that requires either moving the parsers into the Worker or changing the container parser to emit export JSON without persisting through local SQLite.

Hydro parser/handoff update later on 2026-05-12:

- The 30-minute production Hydro cron now reads current `bis`/`aip` versions from D1 `feed_versions` and passes those versions to the container.
- The container's protected `/cron/hydro/durable-fetch` path fetches only changed Hydro version, marker, and polygon payload bytes and returns snapshot metadata/content to the Worker. It does not register snapshots or ingest markers/polygons into container SQLite.
- The Worker remains responsible for R2 raw snapshot archival and D1 marker/polygon/feed-version writes, so production Hydro freshness and parser handoff no longer depend on container SQLite state.
- Local development remains on the existing SQLite/API-refresh path because the durable-fetch path is only called by the Worker cron.
- Remaining parser/handoff dependency: DAI/disclosure parsing still uses the container as a parser workspace before D1/R2 mirroring. Keep that migration separate from the Hydro path so disclosure parser changes can be tested with their own fixtures and scheduled-run evidence.

## 2026-05-16: PowerOutage benchmark and map-stack comparison

Added comparison targets:

- `https://poweroutage.com/ca/`
- `https://poweroutage.us/`

Observed PowerOutage product shape:

- PowerOutage is not primarily an exact-address service-status product like Hydro-Québec Info-pannes. It is a multi-utility, regional/national outage intelligence dashboard.
- PowerOutage Canada presents national/province outage totals, province drilldown, provider tables, untracked providers, and an approximately 10-minute site-wide data update cycle.
- The Quebec page exposes tracked customers, customers out, provider-level rows such as Hydro-Québec/Hydro-Sherbrooke/New Brunswick Power, and untracked providers such as Hydro Westmount.
- The Hydro-Québec utility page exposes provider totals plus county/MRC-level rows with customers tracked and customers out.
- PowerOutage US has a stronger commercial platform around the public map: national totals, state and utility rankings, alert/reporting affordances, products for REST API, embeddable maps, smart alerts, precision reporting, historical intelligence, and enterprise dashboards.
- PowerOutage's own About/use-data pages state that they aggregate utility outage data, store collected historical information, support heavy traffic during major events, and sell/use enterprise products. Their public pages emphasize broad coverage, not local cause/restoration detail for one customer premise.
- PowerOutage reports coverage figures on its public pages: 96% US, 95% Canadian, and 89% UK coverage.
- PowerOutage's public changelog says the 2025 rewrite rebuilt maps using D3.js and MapLibre GL, switched to TopoJSON for faster map loading, added 3D extrusion maps, and added historical/timeline visualization controls.

Product implications for pannes.ca:

- Hydro-Québec remains the closest benchmark for exact customer-facing service status, outage reporting, planned interruption workflows, and mobile/followed-address notifications.
- PowerOutage is the better benchmark for the proposed `Bilan par région` direction: province/national status first, region/provider rows, percentage/severity scales, provider drilldown, outage rankings, and dashboard/alert productization.
- pannes.ca should not try to become a generic multi-utility dashboard immediately. The stronger niche remains Hydro-Québec + Quebec-specific address/history/disclosure context.
- A useful hybrid direction is:
  - Hydro-like exact/current status framing where the data supports it.
  - PowerOutage-like province/region/MRC summary views for situational awareness.
  - pannes.ca-specific historical and access-to-information context where Hydro and PowerOutage public pages do not expose detail.
- For a regional dashboard, consider showing:
  - current customers/addresses out
  - active interruption count
  - affected percentage where denominator is available
  - latest Hydro source version and collection timestamp
  - region/MRC/provider rows
  - links to map and address search
  - historical/disclosure context as secondary expandable detail

Map stack comparison:

- Current pannes.ca stack is Leaflet + raster/base tiles + GeoJSON overlays. This is still the pragmatic default for the current product because it is simple, open source, small, easy to debug, and a good fit for modest numbers of polygons/markers and server-rendered HTMX pages.
- Leaflet is less ideal if pannes.ca evolves toward PowerOutage-style dashboard maps with many features, smooth choropleths, animated timelapse, vector-tile filtering, 3D extrusion, or GPU-rendered large datasets. Leaflet can be extended, but large overlay payloads and DOM/SVG/canvas layer management become the performance bottleneck.
- MapLibre GL JS is the strongest open-source candidate for the next major map iteration. It is WebGL/GPU-accelerated, renders vector tiles and MapLibre styles client-side, supports data-driven styling, and matches the direction PowerOutage publicly says it took for its rewrite. The tradeoff is higher implementation complexity: vector tile generation/serving, style JSON, feature-state handling, WebGL testing, and migration of current Leaflet UI glue.
- Apple MapKit JS is attractive for high-quality Apple Maps basemaps and a generous free daily limit, but it is a proprietary hosted map service with token setup, service-call quotas, less ecosystem flexibility for custom outage data workflows, and less obvious fit for open-source/provenance-oriented pannes.ca. It should not be the default for this project unless the product specifically needs Apple basemaps/look-and-feel.
- Google Maps JavaScript API is the strongest proprietary choice for consumer-grade basemaps, places/geocoding/autocomplete ecosystem, Street View, and broad user familiarity. The downside is pay-as-you-go billing, API key/billing dependency, license restrictions, and weaker alignment with an open-data/outage-research product that wants control over derived data, caching, and custom overlays.
- Recommended sequencing:
  1. Keep Leaflet while the main performance issue is payload size/context assembly rather than renderer capability.
  2. Build the `Bilan par région` and MRC/region aggregates in D1 first; renderer choice should follow the data model.
  3. If region/MRC maps, choropleths, or timelapse become central, prototype MapLibre with precomputed vector tiles or PMTiles/MBTiles-derived static tiles.
  4. Avoid Apple/Google as the primary outage overlay renderer unless a specific proprietary capability is worth the dependency and usage terms.

Sources checked:

- PowerOutage Canada: https://poweroutage.com/ca/
- PowerOutage Quebec: https://poweroutage.com/ca/province/quebec
- PowerOutage Hydro-Québec utility page: https://poweroutage.com/ca/utility/1297
- PowerOutage US: https://poweroutage.us/
- PowerOutage About: https://poweroutage.us/about
- PowerOutage Use Our Data: https://poweroutage.us/use-our-data
- Leaflet: https://leafletjs.com/
- MapLibre GL JS: https://maplibre.org/projects/gl-js/
- Apple MapKit JS: https://developer.apple.com/documentation/mapkitjs
- Apple Maps on the Web: https://developer.apple.com/maps/web/
- Google Maps JavaScript API usage and billing: https://developers.google.com/maps/documentation/javascript/usage-and-billing
- Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing

## 2026-05-25: Leaflet versus deck.gl for pannes.ca maps

Question:

- Is deck.gl likely to be faster than Leaflet for pannes.ca's outage, planned-interruption, regional, and disclosure maps?

Findings:

- Leaflet is still the better default map shell for the current app shape. The official Leaflet site describes it as a small open-source library for mobile-friendly interactive maps, about 42 KB gzipped, with built-in tile layers, markers, popups, vector layers, GeoJSON, controls, and simple event handling. That matches pannes.ca's current HTMX/server-rendered model.
- deck.gl is not exactly a Leaflet replacement. Its docs describe it as a high-performance WebGPU/WebGL2 visualization framework for large datasets, mapping arrays or binary columns into layers such as icons, polygons, and text. It can run standalone or integrate with basemap providers including MapLibre, Google Maps, Mapbox, and ArcGIS.
- deck.gl is likely faster when the bottleneck is client-side rendering of many features: tens or hundreds of thousands of points, dense paths, animated trips/timelines, heatmaps, H3/quadbin aggregations, 3D extrusions, GPU filtering, or interactive picking/highlighting across large layers.
- deck.gl is not likely to fix the current pannes.ca bottlenecks by itself if the main cost is still:
  - generating/querying map payloads
  - transferring large GeoJSON/HTML payloads
  - parsing too much disclosure/context JSON
  - geocoding or D1/API round trips
  - rendering a modest number of polygons/markers
- For the current production map scale recorded earlier, a trimmed `/search-map` response had roughly 56 map items and about 155 KB of HTML. Leaflet should be fine at that scale; switching to deck.gl would add integration complexity without a clear speed win.
- deck.gl becomes more interesting for the planned regional dashboard if we move from a handful of address/search overlays to province-wide analytical layers:
  - choropleths by region/MRC/municipality
  - dense current + historical outage point clouds
  - timeline playback across many snapshots
  - heatmaps or H3/quadbin outage density
  - smooth hover/pick interactions over many geometries
  - visual comparisons between current, planned, previous, and disclosure layers
- The cleanest open-source stack for that future is probably MapLibre + deck.gl, not Leaflet + deck.gl. deck.gl can be used with Leaflet through `@deck.gl-community/leaflet`, but that module is community maintained and explicitly warns that it may not have timely maintainers. For a core production renderer, MapLibre + deck.gl is a better-supported path.
- A middle path is possible:
  - keep Leaflet for the address-first search map
  - build a separate experimental analytical/regional map route with MapLibre + deck.gl
  - feed that route precomputed D1/R2-backed region/MRC aggregates or vector/PMTiles-style payloads
  - compare browser render time, payload size, mobile behavior, and interaction quality before replacing the existing Leaflet map

Recommendation:

- Do not replace Leaflet with deck.gl now.
- First build the regional/MRC aggregate data model and compact endpoints.
- If the regional dashboard needs dense analytical visualization, prototype a separate MapLibre + deck.gl route.
- Treat deck.gl as a high-scale visualization layer for future analytical maps, not as a general cure for current page/search performance.

Sources checked:

- Leaflet: https://leafletjs.com/
- deck.gl introduction: https://deck.gl/docs
- deck.gl home: https://deck.gl/
- deck.gl standalone usage: https://deck.gl/docs/get-started/using-standalone
- deck.gl with MapLibre: https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
- deck.gl community Leaflet module: https://visgl.github.io/deck.gl-community/docs/modules/leaflet

## Sources

- 2026-05-19 production data correctness check:
  - Hydro `bisversion` advanced from `20260519193013` to `20260519200020` during the check window.
  - D1 contained the reported Saint-Léonard outage as current in `current_outage_records` at `bis:20260519193013:11`: 32 customers, start `2026-05-19 17:15:50`, centroid `45.58103774498223,-73.58801191553057`.
  - The next Hydro/D1 version removed that record from current outages, and D1 retained it in `resolved_events` with first seen `2026-05-19T21:37:58.083Z`, last seen `2026-05-19T23:37:57.043Z`, and source versions `20260519173004,20260519180011,20260519183018,20260519190006,20260519193013`.
  - Root cause for the stale pannes.ca home/sidebar current feed: the Flask container cached `_current_operational_map_layers` for the container lifetime. Production D1 was current, but the long-lived container could keep serving old context until restart/sleep. Fix: bypass this cache when production durable URLs are configured.
  - Operational caveat: changing the Cloudflare Container Durable Object name from `web` to force a fresh instance caused the new container to fail readiness checks and return HTTP 500. The route was rolled back to the known-good `web` instance. Future deploy work should include a safer container restart/rollout procedure before relying on forced instance-name changes.

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
