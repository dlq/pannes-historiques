# Plan: Address-First Hydro-Québec Outage History App

Date: 2026-04-25
Last updated: 2026-05-07

## 0.2.0 planning: map-first responsive interface

The next substantial product/design direction should revisit the page structure around a map-first interaction model, closer to `maps.google.com` or `maps.apple.com` than the current document-flow dashboard.

The current mobile layout works, but it is not pleasant enough on a phone. The page still feels like a desktop report compressed into a narrow viewport, and the user has to scroll through cards while the map is only one section among many. For 0.2.0, treat the map as the persistent spatial surface and put search/results/context into overlays.

Primary design goal:

- make the map fill the browser viewport and remain visually present throughout the interaction
- keep address/current-location search prominent without forcing the user through a long document page
- show outage information in an overlay that can collapse, expand, and move out of the way
- make desktop and mobile feel like intentional variants of the same map-first app, not separate layouts patched with breakpoints

Desktop layout direction:

- full-viewport Leaflet map as the base layer
- search overlay near the top, likely centred or top-left depending on final visual balance
- result/detail panel as a left-side overlay with a controlled width
- map context/detail panel can either live in the same left overlay as a selected-state view or appear as a secondary panel only when needed
- keep the overlay visually congruent with the Hydro-Québec/Québec.ca-inspired style: restrained, clear, squared, and not glassy or decorative
- provide clear panel states:
  - no search yet
  - searching/loading
  - current/new outages
  - planned interruptions
  - previous outages
  - selected map feature context
  - error/outside-Quebec/geocode failure

Mobile layout direction:

- full-viewport map underneath everything
- search overlay at the bottom by default, because it is easier to reach one-handed
- results overlay as a bottom sheet that can be dragged or snapped between states
- likely bottom-sheet states:
  - collapsed: compact search bar and current query summary
  - mid: first few result cards plus tabs or section controls
  - expanded: full result list/detail context
- when a result card is tapped, recenter/zoom the map and keep the sheet at a useful mid-height rather than covering the selected map area completely
- when a map feature is tapped, show concise context in the sheet and allow the user to expand for details
- use touch-friendly controls and enough vertical spacing without letting cards become huge
- avoid horizontal scrolling in the sheet unless the user is viewing an explicitly tabular/detail page

Information architecture questions for 0.2.0:

- decide whether current outages, planned interruptions, previous outages, and disclosure/context are sections in one sheet or tabs/segmented controls inside the overlay
- decide whether the DAI/disclosure detailed row list stays out of the map-first page and opens as a separate detail page
- decide whether the region/current-status dashboard belongs in the same map-first shell or remains a separate page
- decide how much current-query state should be visible while the sheet is collapsed
- decide whether desktop uses one combined side panel or separate search and results panels

Technical planning:

- preserve the lazy-loading architecture because it materially improves perceived speed
- avoid embedding large map payloads in the first HTML response
- keep result cards usable before the lazy map payload has fully loaded; queued map focus behaviour must remain covered by regression tests
- consider introducing a small client-side shell component for overlay state, but keep server-rendered result fragments and HTMX where they remain simpler
- design the map shell so it can work with:
  - initial no-query page
  - address search
  - current-location search
  - language switch
  - browser back/forward
  - shared URL with query parameters
- keep accessibility in scope:
  - bottom sheet must be keyboard reachable and screen-reader understandable
  - focus should move predictably after search and after selecting a card/map feature
  - drag-only behaviour must have button/keyboard equivalents
  - map-only interactions need list equivalents
- test on real iPhone Safari as part of 0.2.0 acceptance, not only desktop responsive emulation

Risks and constraints:

- Leaflet controls, attribution, popups, and custom overlays can collide on small screens if we do not reserve space deliberately
- bottom-sheet gestures can fight with page scrolling if implemented casually
- map-first UI may make long historical/disclosure context harder to read; detailed historical tables may need separate pages
- mobile browser viewport units are tricky because iOS Safari chrome expands/collapses; use modern viewport units and test carefully
- the current Tailwind-CDN/server-rendered structure can support an overlay redesign, but the CSS and template organization may need cleanup before large UI work

Acceptance target for 0.2.0:

- on mobile, a user can search by address or current location, see the map immediately, tap/swipe through result cards in a bottom sheet, and recenter the map without losing context
- on desktop, a user can search, compare result categories, and inspect map context without the page feeling like a long scroll report
- perceived first result time remains fast: cards/search feedback should render before heavy map/context geometry
- the interface remains clearly a pannes.ca prototype, while still feeling congruent with Hydro-Québec and Québec.ca visual language

## Implementation status as of 2026-05-06

Several early phases are now implemented in the prototype:

- live Hydro-Québec snapshot collection and local raw archival
- normalized parsing of live outage, planned interruption, and KML/KMZ geometry feeds
- address-first search with geocoding, radius matching, and confidence labels
- bilingual server-rendered UI with HTMX and Leaflet
- result cards are rendered separately from lazy-loaded map overlays
- disclosure source tables and a manifest of known DAI outage extracts
- XLSX ingestion for `DAI-2022-0386`
- PDF table extraction for supported row-level DAI files:
  - `DAI-2025-0275` Outremont
  - `DAI-2026-0042` Sheenboro, Chichester, L'Isle-aux-Allumettes-Partie-Est, and Waltham
  - `DAI-2025-0333` Saint-Felix-de-Kingsey
- DAI area geometry loading from OSM/Nominatim/Overpass, with conservative fallback areas where needed
- static simplified geometry assets for regional metrics and DAI/disclosure map context
- map layering where broad DAI context areas render behind smaller live/API outage and planned-interruption layers
- centroid markers for previous-outage matches that do not have polygon geometry
- the main address interface has been simplified around fixed defaults: 5 km radius, 5-year window, and planned interruptions included
- Cloudflare Workers + Containers deployment at `pannes.ca`
- D1/R2-backed durable production ingestion for current feed rows, previous-outage rows, disclosure metadata, and raw payload archives

Deferred to a later About page:

- source-scope explanation
- quality and limit caveats
- cache freshness and archive coverage details
- methodology notes and explanatory summary material

Map follow-up:

- continue refining the lazy map payload and browser rendering cost
- keep polygon-backed live/API layers visually distinct from centroid-only previous-outage markers
- decide whether map context should move further from container SQLite/static assets to D1/R2-backed endpoints
- add a pannes.ca equivalent of Hydro-Québec's `Bilan par région`: a province-wide current-status view with total affected addresses/customers, active interruption count, region-level rows, sorting/search, and links into region-focused map/search views
- improve on Hydro's regional view by adding pannes.ca-specific context where available: latest source version/freshness, nearby historical observations, disclosure coverage, and clear caveats about current-vs-historical completeness

Source-code follow-up:

- decode Hydro-Quebec one-letter outage and planned-interruption status codes such as `N`, `R`, `L`, and `A`
- until meanings are verified from source documentation or source payload context, avoid guessing in the UI
- decide whether to show decoded labels inline or keep raw source codes behind a small tooltip/popover

Deployment checkpoint:

- `pannes.ca` is registered in Cloudflare and served by a Cloudflare Workers + Containers deployment
- keep the container definition in the GitHub repository: `Dockerfile`, `.dockerignore`, `wrangler.jsonc`, `src/worker.js`, `scripts/start.sh`, app code, and lockfiles
- do not commit built container images; images should be built and pushed by Wrangler or future CI/CD
- add a separate local-only Docker image for the SQLite-backed Flask app, likely `Dockerfile.local`, before publishing containers to GitHub Container Registry
  - use a public Python base image rather than a Cloudflare registry base
  - default to local behavior such as `AUTO_REFRESH_ON_SEARCH=1`
  - mount `./data` as a persistent volume so local SQLite and raw archives survive container restarts
  - document whether the image starts with an empty database, a small sample database, or a dated public snapshot
  - keep this separate from the Cloudflare Containers production image and release it intentionally when it is a reproducible local distribution artifact
- current deploy command is `npx wrangler deploy`
- short-term deployment should remain manual from the local workspace until the container deploy path has had a few clean releases
- medium-term deployment can move to Cloudflare Workers Builds connected to GitHub, using the same `npx wrangler deploy` command on push
- keep using `uv` for Python dependency management and checks; use `npm` for Wrangler, Biome, and Cloudflare deployment tooling
- follow up on TLS/certificate status for `pannes.ca` and `www.pannes.ca`; confirm Cloudflare has issued/activated the certificate and browsers no longer show certificate/security warnings
- the current production container still bundles a baked-in SQLite snapshot for the Flask/container app and remaining disclosure/regional context
- production writes inside the container are ephemeral, so durable feed ingestion now uses D1 for normalized rows and R2 for raw payloads
- D1/R2 are now part of the production architecture, and production search uses narrow Worker/D1 endpoints for current nearby matches and accumulated previous-outage nearby matches
- D1 research checkpoint as of 2026-05-04:
  - D1 looks cost-effective for normalized relational app data on the current Workers Paid plan
  - the current database is dominated by large geometry rows, so a full SQLite-to-D1 copy is probably not the right first migration
  - prefer a future hybrid prototype: D1 for indexed metadata/events/cache, R2 for raw snapshots and bulky GeoJSON/KML-derived payloads
  - the current Python container cannot use D1 like a local SQLite file; a Worker binding/API boundary should be proven before moving the main search path
  - keep baked SQLite short term while measuring production latency and deploy reliability
- durable ingestion checkpoint as of 2026-05-05:
  - Cloudflare D1 database `pannes-historiques` is provisioned for normalized production feed state
  - Cloudflare R2 bucket `pannes-historiques-raw` is provisioned for raw Hydro-Québec version, marker, and polygon payloads
  - Worker cron runs every 30 minutes, offset to minutes `:07` and `:37`, for Hydro-Québec `bis` and `aip` version checks; it downloads marker and polygon payloads only when the upstream version changes
  - first verified scheduled run at `2026-05-06T00:30Z` wrote `bis` version `20260505202016` with 91 outage records and `aip` version `20260505202016` with 212 planned-interruption records
  - Worker cron also calls the container refresh endpoint so the current Flask/SQLite search path can see the latest feed data without doing user-request-time Hydro API refreshes in production
  - container refresh summary serialization is fixed; verified offset cron runs at `2026-05-06T02:37Z` and `2026-05-06T03:07Z` returned `errors: []`
  - R2 raw snapshot storage is verified by downloading a remote `bismarkers` object recorded in D1
  - first D1-backed user-facing lookup endpoint is live at `/api/durable/nearby`; it returns current outage/planned-interruption rows near a lat/lon without entering the Flask/container SQLite search path
  - second D1-backed user-facing lookup endpoint is live at `/api/durable/history-nearby`; it returns accumulated previous outage events from `resolved_events` near a lat/lon
  - production Flask/container searches now opt into `/api/durable/nearby` through `DURABLE_NEARBY_URL`, while local development leaves that setting empty and continues using local SQLite plus API refresh
  - production Flask/container searches derive and use `/api/durable/history-nearby` through `DURABLE_HISTORY_URL`; local development leaves that setting empty and continues using local SQLite plus API refresh
  - DAI/disclosure refresh now has separate durable phases: the Worker archives raw DAI files to R2 first, then sends the archived bytes to the container for parsing, then mirrors parsed source/event/metric/geometry metadata into D1
  - DAI/disclosure refresh is owned by the two-week disclosure cron; do not piggyback the heavy disclosure bootstrap on the 30-minute Hydro cron because it can hold the scheduled Worker open while the container downloads/parses many source files
  - earlier direct Worker-origin Hydro feed fetches returned HTTP 406, but later scheduled runs succeeded; if 406s return, keep errors step-scoped and prefer resumable durable checkpoints over single all-or-nothing cron work
  - production container image now installs `curl` because the disclosure downloader falls back to the `curl` binary when Python `urllib` cannot fetch Hydro disclosure attachments
  - local development keeps `AUTO_REFRESH_ON_SEARCH` enabled by default, so local queries can still hit the Hydro API while production user searches read container SQLite only
  - next migration step is to evaluate moving production disclosure/regional context reads from container SQLite to D1
  - DAI chunking is implemented in archive/parse phases: the Worker selects due D1 sources one at a time, archives raw source files to R2, parses archived bytes through the container, and mirrors each completed source into D1/R2 within a bounded scheduled-run budget
  - DAI batch proof completed on 2026-05-06: a temporary protected manual trigger processed `DAI-2021-0328`, archived a real PDF to R2, updated its D1 `r2_key`, and reduced due disclosure sources from 32 to 31; the temporary trigger was removed after verification
  - per-source archival and parse attempt/defer tracking is deployed in D1: failed or slow sources are recorded, deferred for later, and no longer block other due DAI sources from making durable progress
  - DAI R2/D1 base catch-up completed on 2026-05-07: D1 reports `archive_due_now = 0`, `parse_due_now = 0`, and `32/32` disclosure sources archived and parsed; the previously deferred `DAI-2022-0386`, `DAI-2025-0275`, and `DAI-2025-0333` are now archived in R2 and parsed into D1
  - remaining non-base migration work stays here for later: move disclosure/regional context reads to D1, finish search-path performance work, and reduce container SQLite dependence in user-facing reads
- review deployment and query performance after the initial Cloudflare Containers launch:
  - initial profiling on 2026-05-04 showed simple routes are fast, but address search was dominated by Python geospatial matching and oversized inline map payloads
  - a first mitigation reduced the search response from roughly 14.4 MB to roughly 562 KB and brought a measured production HTML search down to about 6 seconds, but more optimization is still needed
  - next likely performance work:
    - render result cards first and lazy-load map overlays after the initial search response
    - stop embedding map JSON directly in HTML; move map data behind small JSON endpoints
    - keep `/search-map` and `/map-context-geometries` payloads small enough for mobile and slower networks
    - continue moving remaining container SQLite reads out of the hot search path; current-feed and previous-outage nearby matching now use D1, while regional metric and DAI/disclosure context still build from container SQLite/static payloads
    - store static administrative-region and DAI/disclosure geometries outside the default SQLite search response as precomputed simplified GeoJSON assets
    - keep using the offline GeoPandas/Shapely simplification asset build for broad regional/disclosure map context
    - simplify broad administrative regions aggressively and topologically; simplify DAI/disclosure geometries only conservatively, because the current DAI/disclosure shapes are not one valid shared-boundary coverage and do not get the same coverage guarantee
    - show only a compact DAI/disclosure summary in the default map context card, with a link to a separate detail page for large DAI row lists
    - precompute and/or index geometry matches so address searches do not scan large geometry sets in Python
    - move raw and large geometry payloads out of the hot search path, probably R2 for payloads plus D1 metadata/index tables
    - consider a larger container instance only after reducing app-side work
  - keep the detailed timing evidence in `research.md`
  - latest production timings after the D1 previous-outage migration are roughly 0.44 seconds for `/`, 0.77 seconds for result-card `POST /search`, 1.12 seconds for lazy `/search-map`, and 0.30 seconds for `/map-context-geometries`
  - next performance focus should be the lazy map payload/rendering and context assembly, not current or previous-outage nearby matching, because those now use D1
  - lazy map payload follow-up now trims disclosure detail to recent samples and renders previous outages as centroid markers instead of embedding older outage polygons; local `/search-map` HTML dropped from roughly 912 KB to roughly 358 KB, and production `/search-map` dropped from roughly 735 KB to roughly 155 KB after deploy
  - add a rigorous browser regression suite before further map/search UI work:
    - cover lazy result rendering with Playwright or equivalent browser automation, not only unit tests
    - regression case: submit a known address, click a result card before the lazy map finishes loading, wait for `/search-map` and `/map-context-geometries`, and assert the map remains focused on the clicked outage/detail instead of recentering on the searched address
    - regression case: click an operational outage, a planned interruption, a previous-outage row, a DAI/disclosure layer, and a regional metric layer, then assert the detail panel and map focus remain stable after deferred geometry loads and resize refreshes
    - include both `fr` and `en` search flows, desktop and mobile viewport sizes, and a repeated-search/cache-hit path
    - run the suite locally before release deploys that touch `app/static/app.js`, `_map_panel.html`, `_result_cards.html`, or lazy map/search endpoints
  - regional-current-status follow-up from Hydro comparison on 2026-05-06:
    - Hydro's `Bilan par région` is a useful product pattern for a fast "how bad is it right now?" view before address search
    - pannes.ca should implement this from durable current-feed data rather than the hot Flask/container search path
    - likely data work: derive or load a reliable municipality-code-to-region mapping, aggregate latest `bis` and `aip` marker rows by region, expose compact D1-backed JSON/HTML endpoints, and cache the province totals with source version/freshness metadata
    - UI should keep the address-first search primary, but add a compact province/region dashboard entry point near the top of the app or as a dedicated page
  - continue measuring cold start, first search, repeated search, and image push/deploy times
  - compare baked-in SQLite, D1, R2-backed snapshots, and external database options before changing storage architecture
  - research Cloudflare Containers image-layer behavior and whether local Docker Desktop push instability can be avoided with CI/Workers Builds, remote builders, or a different local container runtime
  - previous Cloudflare deploy blocker `durable object bindings require durable object bind permission` was resolved by refreshing Wrangler authorization; keep this in mind if the error returns after account feature changes
  - keep Docker Desktop subscription requirements in mind, but avoid a paid Docker subscription unless licensing or workflow needs clearly require it
  - capture findings and tradeoffs in `research.md` before making a larger storage or deployment architecture change

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

Near-term product addition:

- add a regional current-status dashboard inspired by Hydro-Québec's `Bilan par région`
- keep it complementary to address search: province and region totals answer "what is happening right now?", while address search answers "what is known near this place?"
- use pannes.ca's differentiators in the regional view by showing feed freshness, historical observations, and disclosure/context coverage where those are reliable

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

Current production implementation:

- Worker cron checks `bisversion` and `aipversion` every 30 minutes
- the production schedule is offset to minutes `:07` and `:37` rather than exact half-hours to avoid polling while upstream files may still be rolling out
- unchanged versions update `feed_versions.checked_at` without redownloading the larger payloads
- changed versions are written to D1 as normalized current outage/planned-interruption rows and accumulated `resolved_events`
- raw version, marker, and polygon payloads are written to R2 for durable provenance
- polygon KMZ payloads are archived in R2 now; parsing them into durable geometry/index tables remains a follow-up
- `/api/durable/nearby?lat=...&lon=...&radius_m=...` reads current D1 marker rows by bounding box and returns nearby records sorted by distance
- `/api/durable/history-nearby?lat=...&lon=...&radius_m=...&days=...` reads accumulated D1 `resolved_events` rows by bounding box and returns previous outage events sorted by time/distance
- production search uses `DURABLE_NEARBY_URL` to fetch current outage/planned-interruption matches from D1; local development does not set this variable and remains on the local SQLite path
- production search uses `DURABLE_HISTORY_URL` for previous-outage matching; local development does not set this variable and remains on the local SQLite path
- disclosure mirror tables in D1 now store parsed source, outage event, annual metric, and geometry metadata; raw DAI files are archived in R2

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
- formal automated test coverage for ingestion, matching, geocoding, and rendered search flows

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

## Performance review backlog

Performance is not the primary constraint while the interface and data model are still settling, but the current architecture should be reviewed before the cached dataset grows too much.

Specific things to check:

- size of the embedded `data-map` JSON payload returned with each search
- whether the initial server-rendered search response can exclude map overlays and let the map hydrate from a later JSON request
- number and complexity of GeoJSON polygons sent per query
- Leaflet layer creation cost after each HTMX result swap
- server-side query time for previous outage grouping and disclosure overlays
- repeated i18n label payloads in every map response
- whether regional/disclosure geometry can be simplified or cached per response shape
- whether broad regional choropleth geometry can be simplified without producing visible gaps between adjacent administrative regions
- whether the map payload should be split from the server-rendered result cards if payload size becomes noticeable
- whether D1 metadata tables plus R2 geometry payloads can remove large geometry blobs from the hot SQLite/container path
- whether a larger Cloudflare container instance is needed after the app no longer does avoidable full-scan/full-payload work

Useful first measurements:

- log response size and server render time for representative searches
- capture browser main-thread time for map initialization and layer rendering
- compare searches with few overlays versus searches with many outage, planned, previous, disclosure, and regional layers
- set a rough budget for initial search response time and map-ready time before optimizing

## Accessibility review backlog

The address lookup UI should get a dedicated accessibility pass before it is treated as public-facing.

Specific things to check:

- keyboard navigation through the language toggle, address search, autocomplete suggestions, location search, result cards, map, and detail panels
- focus visibility and focus order after HTMX result swaps
- screen-reader labels for icon-free controls, loading states, errors, result cards, and map-related actions
- whether clickable result cards should be buttons, links, or articles with clearer ARIA semantics
- contrast of yellow, blue, grey, and map-overlay colours against the current public-service-inspired palette
- non-colour cues for outage, planned interruption, previous outage, disclosure, and regional burden layers
- Leaflet map keyboard behaviour and whether map content needs a non-map textual fallback for important information
- language attributes and localized strings in client-rendered HTML
- reduced-motion behaviour for loading indicators and map interaction, if needed

Useful first checks:

- run an automated accessibility scan on the main query flow
- tab through the full interface in both English and French
- test the result cards and map detail updates with VoiceOver or another screen reader
- verify error and loading announcements for search and current-location flows

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
