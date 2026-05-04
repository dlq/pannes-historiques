# Plan: Address-First Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-05-03

## Implementation status as of 2026-05-01

Several early phases are now implemented in the prototype:

- live Hydro-Québec snapshot collection and local raw archival
- normalized parsing of live outage, planned interruption, and KML/KMZ geometry feeds
- address-first search with geocoding, radius matching, and confidence labels
- bilingual server-rendered UI with HTMX and Leaflet
- disclosure source tables and a manifest of known DAI outage extracts
- XLSX ingestion for `DAI-2022-0386`
- PDF table extraction for supported row-level DAI files:
  - `DAI-2025-0275` Outremont
  - `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham
  - `DAI-2025-0333` Saint-Felix-de-Kingsey
- DAI area geometry loading from OSM/Nominatim/Overpass, with conservative fallback areas where needed
- map layering where broad DAI context areas render behind smaller live/API outage and planned-interruption layers
- the main address interface has been simplified around fixed defaults: 5 km radius, 5-year window, and planned interruptions included

Deferred to a later About page:

- source-scope explanation
- quality and limit caveats
- cache freshness and archive coverage details
- methodology notes and explanatory summary material

Map follow-up:

- previous outage matches that only have centroid data, not polygons, should still be retained and shown somehow
- do not label centroid-only matches as "areas"; design a distinct map treatment for them, such as muted point markers or a separate "previous outage points" layer
- keep polygon-backed previous outages visually distinct from centroid-only previous outages

Source-code follow-up:

- decode Hydro-Quebec one-letter outage and planned-interruption status codes such as `N`, `R`, `L`, and `A`
- until meanings are verified from source documentation or source payload context, avoid guessing in the UI
- decide whether to show decoded labels inline or keep raw source codes behind a small tooltip/popover

## Goal

Build a web app that starts with a **specific Quebec address** and shows:

- outage history for that address
- outage history for nearby addresses / nearby outage polygons
- a progressively improving local cache so the system gets more useful over time
- eventually, hotspot views derived from accumulated address-area lookups and archived outage snapshots
- a bilingual user experience where **French and English are both first-class**, with French especially important given the Quebec audience and Hydro-Québec source material

This plan assumes:

- we do **not** currently have a clean province-wide historical outage dataset
- Hydro-Québec’s public outage API is real and usable for **current** outages and planned interruptions
- Hydro-Québec may have deeper historical data internally, but we should not block on getting it

## Current implementation checkpoint

The project has moved beyond only researching access-to-information disclosures. It now has a working foundation for combining live API data with selected disclosed historical records.

What is already in place:

- live Hydro-Québec snapshot archival and normalization
- address-first search with bilingual server-rendered UI
- archive span, freshness, and confidence framing in the results experience
- row-level XLSX disclosure ingestion for Côte Saint-Luc
- row-level PDF extraction for Outremont, Saint-Félix-de-Kingsey, Sheenboro, Chichester, Waltham, and L'Isle-aux-Allumettes-Partie-Est
- disclosed-area geometry loading with conservative fallback areas when a boundary lookup is incomplete
- a map model that can show disclosure areas as broader context while keeping smaller live/API outage and planned-interruption layers distinct

Planning consequence:

- the next phase is no longer "prove we can ingest disclosure files"
- the next phase is to broaden coverage, harden extraction quality, improve event reconstruction, and explain mixed evidence clearly in the UI

## Product direction

The address-first approach is a good pivot.

Why it is attractive:

- it narrows the scope to a query users already understand
- it avoids pretending we already have province-wide historical completeness
- it lets us build value immediately from partial data
- every query can enrich our local corpus
- it creates a credible path toward eventual hotspot maps without requiring full historical backfill on day one

The core idea is:

1. user searches an address
2. app checks our local cache first
3. app shows whatever we already know for that address and nearby area
4. if allowed by our ingestion rules and data source constraints, the system refreshes from current Hydro-Québec data and stores the result
5. repeated address queries plus scheduled snapshot collection gradually build a durable local historical dataset

## Language requirement

This app should be designed as **bilingual from the beginning**, not translated as an afterthought.

That means:

- every primary user-facing screen should exist in French and English
- French and English copy should both be treated as product-quality, not one primary language plus a rough fallback
- address search should tolerate French naming and Quebec civic address conventions well
- source-derived terms from Hydro-Québec should preserve the original meaning in both languages

Recommended product stance:

- default language selection should be explicit and easy to switch
- French should be treated as especially important because:
  - the primary geography is Quebec
  - Hydro-Québec’s source terminology is often naturally expressed in French
  - many addresses, municipalities, and administrative labels are French-first

Important implementation planning consequence:

- all UI copy, labels, explanations, caveats, and methodology text must be structured for localization from day one
- internal data models should store language-neutral codes where possible and apply language-specific labels at render time
- geographic names may need both stored canonical names and display translations where appropriate

## Recommended stack

Preferred frontend stack:

- `HTMX`
- bare Web Components
- `Tailwind CSS`

This is a strong fit for the product.

### Why HTMX

HTMX fits well because this app is mostly:

- search forms
- filters
- server-rendered result panels
- partial updates for timelines, maps, nearby addresses, and cache status

Benefits:

- fast to build
- minimal frontend state management
- easy progressive enhancement
- clear server ownership of data-fetching and rendering logic

### Why Web Components

Use bare Web Components only where they add clear value:

- address search box with debounced suggestions
- mini outage timeline chart
- map shell / legend / hover details
- reusable “cache freshness” badge

Benefits:

- keeps interactivity modular without committing to a SPA
- good long-term interoperability
- no framework lock-in

### Why Tailwind CSS

Tailwind is a good fit because:

- the UI is mostly application chrome and data display
- it helps keep styling consistent without a large custom CSS architecture
- it is easy to make compact, readable dashboard-like screens

### Alternatives and when they would be justified

Alternatives are allowed, but should be justified.

- `Alpine.js`
  - justified if HTMX alone becomes awkward for small client-side behaviors
  - keep it limited to UI glue, not full app state
- `Leaflet`
  - justified for map rendering because the app genuinely needs geospatial interaction
  - this is a practical utility dependency, not a frontend framework change
- `Lit`
  - justified only if plain Web Components become too verbose
  - not needed initially
- `React` / `Vue` / `Svelte`
  - not recommended initially
  - only justified if the app evolves into a highly stateful client-heavy geospatial product with rich offline behavior or advanced collaborative annotations

### Why Leaflet over Kepler.gl for this project

Kepler.gl is strong, but for this app Leaflet is the better default.

Why Leaflet fits better:

- this product is **address-first**, not dataset-exploration-first
- the interaction model is relatively focused:
  - show an address
  - show nearby outage polygons or centroids
  - show simple overlays and hover/click details
  - synchronize the map with server-rendered result panels
- Leaflet is easy to integrate into an HTMX + server-rendered app without introducing a heavy client-side visualization stack
- Leaflet gives us fine-grained control over modest, custom interactions without requiring a large client-side state model
- it is easier to progressively enhance
- it is easier to wrap inside a small custom Web Component
- the ecosystem for lightweight tile layers, bilingual labels, popups, legends, and geospatial utilities is mature and well understood

Why Kepler.gl is less ideal as the initial default:

- Kepler.gl shines when the primary experience is exploratory visual analytics over large tabular geospatial datasets
- it tends to pull the app toward a more client-heavy “data studio” model
- it is heavier than we need for a first release centered on one searched address plus nearby history
- it is less natural for server-rendered fragment updates driven by HTMX
- it would likely encourage moving more logic into the browser earlier than we need

When Kepler.gl could become justified later:

- if the product evolves into a large-scale exploratory hotspot analysis tool
- if users need advanced layer styling, brushing, animation, and dense province-wide visual analytics
- if a future analyst-facing mode is added that is distinct from the public address-lookup experience

So the recommendation is:

- use Leaflet for the main product map
- consider Kepler.gl later only for a separate analyst or exploratory mode if the data volume and interaction model genuinely justify it

## Product scope

### Phase 1 scope

Build for one primary question:

`What do we know about outage history at this address and immediately around it?`

Initial outputs:

- address summary card
- nearby outage history summary
- timeline of known outages affecting the area
- planned interruption history if available from cached records
- confidence / completeness note explaining what the app knows and what it does not know
- full French and English support for all core flows

### Phase 2 scope

Once enough data is accumulated:

- local hotspot overlays
- municipality summaries
- neighborhood comparisons
- cause breakdowns
- “worst outage days” ranking

### Explicitly out of scope at first

- pretending we have complete 5-year coverage
- brownout analytics unless a data source is found
- full province-wide map-first UX
- overly precise claims at parcel/building level when source geometry is approximate

## Data strategy

There are three data acquisition tracks.

### Track A: scheduled archive of current Hydro-Québec outage feeds

Run a collector on a schedule and store:

- `bisversion`
- `bismarkers`
- `bispoly`
- `aipversion`
- `aipmarkers`
- `aippoly`

This gives us:

- raw snapshots every 15 minutes
- a durable, improving historical corpus
- the foundation for future hotspot calculations

### Track B: address-centric cache and enrichment

Whenever a user searches an address:

1. normalize the address
2. geocode it to coordinates
3. find any locally cached outage polygons or centroids that intersect or fall within a configurable radius
4. store the address query and derived nearby outage relationships
5. return cached results immediately

This lets us accumulate:

- repeated interest around particular areas
- address-to-polygon associations
- a query-driven historical dataset that is useful even before province-wide aggregation is mature

### Track C: published access-to-information disclosures

Hydro-Québec publishes responses to access-to-information requests, and several of those responses contain historical outage data.

This should become a separate ingestion track for:

- PDF tables with row-level historical outage events
- XLSX extracts with richer row-level fields
- regional or municipal annual aggregate metrics
- response letters that explain scope, constraints, and legal reasoning

Important examples:

- `DAI-2025-0275`: Outremont outage records for roughly 24 months, with start/end/duration/cause
- `DAI-2026-0042`: Sheenboro, Chichester, Allumettes, and Waltham row-level records
- `DAI-2025-0333`: Saint-Félix-de-Kingsey row-level records for 2022-2024
- `DAI-2022-0386`: Côte Saint-Luc XLSX with customer counts, type, cause, equipment, cause group, and category
- `DAI-2024-0012`, `DAI-2024-0237`, `DAI-2025-0479`, `DAI-2026-0077`: regional annual metrics

This track should not be treated as equivalent to the live Info-pannes API:

- the geography is usually much larger
- exact polygons are usually absent
- the disclosure scope varies by request
- the extracted records have different provenance and confidence

Product framing:

`These records provide historical area context, not authoritative building-level outage history.`

## Key architectural decision

The app should treat **raw Hydro-Québec snapshots** as the source of truth, and treat **address histories** as a derived view.

That means:

- do not store only “final” address answers
- always preserve raw source payloads
- derive address results from snapshot records plus geometry relations

This will make it much easier later to:

- improve matching rules
- fix data interpretation bugs
- rebuild hotspot aggregates
- change radius logic

## Data model direction

This is a planning-level schema, not an implementation spec.

### Core entities

- `addresses`
  - normalized civic address
  - postal code
  - coordinates
  - geocoder confidence
- `query_history`
  - searched address
  - search time
  - normalized address id
  - cache hit or miss
- `raw_snapshots`
  - source type
  - source version
  - fetch time
  - raw payload location
- `outage_records`
  - parsed rows from outage snapshots
  - timestamps
  - status
  - cause codes
  - municipality code
  - centroid
- `outage_geometries`
  - parsed polygon geometry
  - linked snapshot/version
- `address_outage_matches`
  - address id
  - outage record id
  - match type
  - distance or polygon containment
  - confidence score
- `resolved_events`
  - deduplicated outage events spanning multiple snapshots

### Disclosure entities

Published access-to-information records should have their own tables.

- `disclosure_sources`
  - DAI number
  - title
  - source URL
  - attachment URL
  - format: PDF, XLSX, ZIP, or other
  - published date if known
  - transmitted date if known
  - geography label
  - geography type: address, line area, borough, municipality, region, province, storm event
  - extraction method
  - notes / limitations
- `disclosure_outage_events`
  - source id
  - start time
  - end time
  - duration seconds
  - duration hours
  - customers affected if available
  - interruption type if available
  - cause
  - equipment if available
  - cause group if available
  - category if available
  - geography label
  - geography type
  - centroid if inferred or available
  - geometry if a known administrative boundary is attached later
  - precision label
  - raw row JSON
- `disclosure_annual_metrics`
  - source id
  - year
  - period label if not a full year
  - geography label
  - geography type
  - outage count
  - average duration minutes
  - continuity index minutes
  - long outage count if applicable
  - metric definitions / notes
- `disclosure_geometries`
  - source id
  - geography label
  - geography type
  - geometry source
  - GeoJSON outline
  - centroid and bounding box
  - raw boundary lookup JSON

The disclosure tables should preserve source provenance clearly. A row extracted from an access-to-information PDF should remain distinguishable from a row captured from the live API.

### Why we need both `outage_records` and `resolved_events`

Because the Hydro-Québec feed is snapshot-based, not event-based.

We should:

- ingest all snapshots faithfully
- later reconcile repeated appearances into inferred outage events

That avoids locking ourselves into bad early assumptions.

## Address matching strategy

This is the most important planning decision after archival.

The app should not claim that a polygon means a precise building-level outage boundary. Hydro-Québec says those shapes are approximate.

Recommended matching logic:

1. direct polygon containment
2. if no polygon containment, use centroid-distance radius
3. store the method used
4. expose the confidence level in the UI

Suggested proximity tiers:

- `direct_match`
  - address falls inside outage polygon
- `nearby_match`
  - address is outside polygon but within a small radius of centroid or polygon edge
- `area_match`
  - address belongs to the same municipality / local cluster but precise geometry match is weak

The UI should show which kind of match produced each historical item.

### Disclosure matching strategy

Access-to-information disclosures should use a more cautious matching model.

Recommended match classes:

- `direct_api_match`
  - address intersects a live API outage polygon or is close to a live API centroid
- `nearby_api_match`
  - address is near a live API record but not inside an available polygon
- `disclosure_area_context`
  - address falls inside the broader disclosed area, such as Outremont, Côte Saint-Luc, a municipality, or an administrative region
- `disclosure_regional_context`
  - address belongs to a region for which only aggregate annual metrics are known

Rules:

- do not present borough or regional disclosure records as if they directly affected the searched building
- prefer wording such as "historical records for this area" over "outages at this address"
- expose the geography type and source DAI number in result details
- keep disclosed area context visually and textually distinct from live API matches

## Geocoding and address normalization

This needs careful planning because it affects cache usefulness.

Requirements:

- French-language Quebec civic addresses must normalize well
- abbreviations and accent variations should resolve consistently
- apartment/unit information should be optional and normalized separately

Recommended principle:

- normalize once, preserve the original string, and store both

Possible geocoding sources:

- Quebec government or municipal geocoders if available and suitable
- OpenStreetMap / Nominatim-style sources for prototyping
- a paid provider only if necessary

A different geocoder would be justified only if:

- Quebec address resolution quality is materially better
- rate limits or licensing make the free option impractical

## User experience plan

### Primary flow

1. user lands on a simple page with one prominent address search field
2. user searches an address
3. server returns:
   - normalized address details
   - known outage history for the address
   - nearby outage history
   - map panel
   - confidence/completeness note
4. user can refine:
   - radius
   - time range
   - outage type
   - planned interruptions on/off
5. user can switch language at any point without losing the current query context

### Page structure

- hero search section
- results summary
- address timeline
- nearby-area timeline
- map panel
- data quality panel
- “what we know about this area” panel
- persistent language switcher

### Map layer model

The map should support multiple layer types with clear precision labels.

Recommended layers:

- current outages
  - live API polygons where available
  - live API centroids where polygons are unavailable
- planned interruptions
  - live API planned interruption polygons or centroids
- historical disclosed events
  - borough, municipality, or sector-level rows from access-to-information disclosures
  - rendered as lightly tinted administrative boundaries or area markers
- regional annual metrics
  - administrative-region choropleth
  - used for aggregate trends, not individual outage events

The legend should distinguish:

- exact or approximate polygon
- point or centroid
- borough/municipality-level historical record
- region-level annual aggregate

Coexistence rule:

- precise live API geometry can answer "was this address inside this published outage area?"
- disclosure data can answer "what has Hydro-Québec disclosed about historical outages in this larger area?"

Those are related but different claims.

### Important UX principle

The app should be honest about incompleteness.

Each result set should communicate:

- how much is from our local cache
- whether the area has dense or sparse historical coverage
- whether the result is direct or nearby
- whether the app is showing outages, planned interruptions, or both

## Hotspot strategy

The address-first app can still become a hotspot app later.

The progression should be:

1. cache address-area matches
2. accumulate scheduled snapshots
3. resolve repeated snapshots into events
4. aggregate by cell / municipality / radius clusters
5. surface hotspot views

This avoids needing to requery Hydro-Québec for every hotspot computation.

### Metrics to compute later

- outage count
- outage-hours
- customer-hours interrupted
- median restoration time
- cause mix
- rolling 30-day / 1-year / all-time hotspot scores

## Backend shape

A server-rendered app is the best initial fit.

Recommended qualities:

- simple HTTP server
- server-rendered HTML fragments for HTMX swaps
- background scheduled jobs for feed collection
- geospatial database support
- localization-aware rendering for French and English fragments

### Database direction

Prefer a relational database with geospatial capability.

Best default:

- PostgreSQL + PostGIS

Why:

- geometry intersection and distance queries matter here
- address-to-polygon matching is much easier and safer with PostGIS
- future hotspot aggregation becomes straightforward

Alternative:

- SQLite + SpatiaLite

This is justified only if:

- you want very low operational complexity at first
- data volume remains modest
- deployment is intentionally small and single-node

Postgres/PostGIS is still the better long-term choice.

## Caching and archival rules

### Cache rules

- address query results should be cached by normalized address id plus radius and time-window parameters
- geocoding results should be cached aggressively
- derived address history should be invalidated only when newer source snapshots materially change the relevant area

### Archive rules

- never discard raw source snapshots
- version every normalized transformation
- keep a clear provenance chain from UI output back to raw source payloads

### Why this matters

Because if we later discover:

- Hydro-Québec changed a field interpretation
- our matching radius was wrong
- an outage status code was misunderstood

we can rebuild derived histories without losing the original evidence

## Legal and product caution

The app should avoid overstating what Hydro-Québec’s data means.

Important caveats to preserve in the product:

- outage polygons are approximate
- estimated restoration times are approximate
- not every outage necessarily appears on the public map
- building-level attribution is inferred, not authoritative
- brownouts are not currently supported by the known public feed

This language should appear in:

- footer / methodology page
- result confidence panel
- map legend / tooltip explanations

## Phased implementation plan

### Phase 0: planning and validation

- confirm legal/licensing assumptions for reuse
- decide geocoder strategy
- decide database choice
- define the first-pass address matching rules
- define what “nearby” means
- define the localization strategy and bilingual content model

### Phase 1: ingestion foundation

- scheduled archival of Hydro-Québec outage and interruption feeds
- raw snapshot storage
- normalized parsing pipeline
- geometry extraction

### Phase 1B: disclosure ingestion foundation

- create disclosure source tables — implemented
- build a small manifest of known DAI outage documents — implemented
- ingest XLSX disclosure files first — implemented for Côte Saint-Luc
- extract row-level PDF tables where the structure is regular — implemented for Outremont, Saint-Felix-de-Kingsey, Sheenboro, Chichester, Waltham, and L'Isle-aux-Allumettes-Partie-Est
- extract regional aggregate PDF tables separately
- store raw source URLs, extraction method, and confidence notes — implemented
- join disclosure records to known administrative boundaries or conservative fallback areas, and keep them visually distinct from live API polygons — implemented

### Phase 2: address intelligence

- address normalization
- geocoding
- address-to-outage matching
- derived address history generation
- cache completeness scoring

### Phase 3: first web app

- search page
- address summary
- known history timeline
- nearby outages panel
- map view
- methodology / confidence explanations
- bilingual French/English UI and content
- optional "area context" panel from access-to-information disclosures

### Phase 4: quality hardening

- event reconciliation across snapshots
- better nearby clustering
- data quality checks
- better uncertainty labels
- bilingual content review for terminology consistency

### Phase 5: hotspot layer

- aggregate from cached address relations and archived snapshots
- municipality and grid-cell hotspot rankings
- filters by year, cause, duration, and severity
- regional annual metric choropleths from disclosure aggregates
- separate visual treatment for disclosure-derived hotspot context vs API-derived hotspot calculations

## Open questions to resolve before implementation

- What exact definition of “nearby” should the product use first:
  - polygon containment only
  - 250 m radius
  - 500 m radius
  - configurable radius
- Do we want to show only outages, or outages plus planned interruptions, in the main history?
- Which geocoder gives the best Quebec civic address quality for acceptable cost and licensing?
- Do we want to start with Postgres/PostGIS immediately, or accept a smaller temporary local setup?
- Should the first release expose hotspot summaries at all, or only address and nearby history?
- How should the UI phrase "area context" so users do not read it as direct address-level attribution?
- Which terminology should be standardized for the bilingual UX:
  - outage / panne
  - planned interruption / interruption planifiée
  - nearby / à proximité / secteur voisin
  - confidence / fiabilité / niveau de confiance
  - area context / contexte du secteur
  - disclosed records / documents divulgués / réponses aux demandes d'accès

## Recommended first-release stance

For the first release, I would aim for:

- a clean address-first experience
- transparent confidence labels
- nearby outage history with adjustable radius
- scheduled archival running in the background
- no claim of complete 5-year provincial coverage
- first-class French and English support

That gives the product a truthful core:

`Here is what we know about outage history at and around this address from our growing archive and derived matches.`

## Most likely product evolution

The most realistic evolution path now looks like this:

### Stage 1: trustworthy archive and address lookup

This is the current direction.

The key promise is:

- preserve the evidence
- show what we know
- show the limits clearly

### Stage 2: partial historical enrichment

This is the next meaningful leap.

At this stage, the product combines:

- the live archived feed
- better resolved outage episodes
- disclosed municipal or borough historical records
- regional aggregate comparisons

This can support:

- deeper pages for areas where disclosure records exist
- clearer "known history depth" indicators by area
- comparisons between a searched address area and its broader municipality or region
- cause summaries where row-level records exist

### Stage 3: broader reliability analysis

If broader historical backfill succeeds, the product can move toward:

- outage frequency by area
- total outage-hours by area
- restoration-time distributions
- seasonal and storm-period patterns
- hotspot surfaces built from repeated outage exposure
- stronger municipality and neighborhood reliability comparisons

This is the stage where the product becomes a real outage reliability lens, not just an archive and lookup tool.

## Recommended near-term priorities

Given the current state of the code and the data strategy, I would prioritize the next work in this order:

1. keep the live collector reliable and automated
2. improve event reconstruction so repeated snapshots become better outage episodes
3. broaden the disclosure ingestion path to additional DAI files, especially regional aggregate PDFs and more municipality/borough row-level tables
4. extend the UI's coverage and provenance language so users can see whether a result comes from live-feed archive data, disclosed historical records, or both
5. continue pursuing Hydro-Québec for broader historical backfill

Why this order:

- the collector remains the backbone
- event logic remains the hardest technical dependency for later analytics
- published disclosures are now the best short-term acceleration path
- provenance needs to stay visible so the product remains trustworthy as evidence sources multiply

## Summary recommendation

This plan is viable and probably more realistic than starting with a full Quebec hotspot map.

The recommended path is:

1. use HTMX, bare Web Components, and Tailwind CSS as the default UI stack
2. treat bilingual French/English support as a foundational requirement, not a future enhancement
3. use Leaflet as the default mapping library because it fits the focused, server-rendered, address-centric interaction model better than Kepler.gl
4. build a server-rendered address-first app
5. archive Hydro-Québec’s live outage feeds on a schedule
6. ingest published access-to-information disclosures as a separate historical-context source
7. derive address histories from raw snapshots and geometry matches
8. show disclosure records as area context with conservative precision labels
9. let repeated searches and scheduled ingestion build the long-term historical dataset
10. add hotspot visualizations only after the archive is mature enough to support them honestly
