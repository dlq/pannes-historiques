# Research: Hydro-Québec Historic Outage Data

Date: 2026-04-25
Last updated: 2026-07-10

## v0.4.2 public-beta readiness evidence, 2026-07-10

Observed production facts:

- Browser QA at `1440 x 1000` and `390 x 844` loaded the English/French map, a representative Montreal address overview, the provenance panel, and the mobile answer state without application console warnings/errors or a framework error overlay.
- A cold interactive Montreal search took roughly 20 seconds before the overview appeared. A later direct `/sheet` overview request took `4.14 s`; additional overview probes returned `200` for Quebec City (`2.02 s`), Saguenay (`1.74 s`), and Val-d'Or (`3.25 s`), and each rendered the overview hero card. This is a latency/cold-container follow-up for `v0.4.3`, not a reproduced `500`.
- Public smoke probes returned `200` for `/` (`1.01 s`), `/healthz` (`0.44 s`), `/about?lang=en` (`0.24 s`), `/sheet?domain=archive&lang=en` (`1.35 s`), the representative Montreal overview (`4.14 s`), and `/service-worker.js` (`1.56 s`).
- `/debug/timing/search`, `/collect`, `/cron/hydro`, `/internal/raw-snapshot`, `/api/durable/status`, `/api/durable/runtime/status`, and `/api/durable/runtime/geocode-cache` returned `404` without credentials.
- `/.env` and `/wp-login.php` also returned `404`, but their 207-byte responses and timings showed that the deployed Worker still forwarded these obvious probes to the container. The `v0.4.2` candidate blocks common PHP, WordPress, secret-file, CGI, and PHPUnit probes at the Worker edge.
- A live `wrangler tail --status error` session stayed empty throughout the production QA and probe window. Wrangler tail is live-only, so it did not provide the historical route/user-agent/country breakdown needed to fully attribute earlier `500` analytics.
- The public Hydro payload at source version `20260710103008` contained 67 current-outage rows. One source row was dated `2025-04-08 09:26:21` with 19 customers and status `L`, which explains the `458 d ago` current row seen in production. The row is present in Hydro's current feed; it is a source anomaly, not a pannes.ca archive record.
- Opening the public `r/quebec` rules URL redirected to Reddit's verification screen. Rules were not confirmed; check them while logged in immediately before posting.

Implementation and deployment facts:

- The About page now discloses Nominatim geocoding/cache behavior, browser-location coordinates and URL persistence, comparison local storage, static-only service-worker caching, infrastructure logs, the absence of accounts/ads/analytics/application cookies, and the lack of automatic address-cache expiry.
- The overview caveat now says retained observations can have collection gaps and are not Hydro-Quebec's official history for the address.
- Address overview doorways explicitly open local scope, while segmented navigation preserves a user's selected `5 km` or `Quebec` scope.
- The package version is `0.4.2`; the deployed service-worker marker is `pannes-historiques-v0.4.2-beta-readiness` and browser-module token is `20260710a`.
- Release commit `02fded1` passed GitHub Quality run `29104581707` and was deployed on 2026-07-10 as Worker version `da3a0c51-d973-49b9-a9c0-9a2b819dd7e6` with container image `pannes-historiques-pannescontainer:da3a0c51`.
- The container rollout reached one healthy instance with no reported errors. The exact `/service-worker.js` path then served the `v0.4.2` marker.
- Post-deploy probes returned `200` for `/healthz` (`0.25 s`), `/` (`0.92 s`), `/about` (`0.45 s`), `/service-worker.js` (`0.21 s`), and the representative Montreal overview (`9.36 s` fresh, `1.90 s` warm).
- The post-deploy rendered browser check showed the new retained-observation caveat, explicit local/province scope links, privacy copy, no horizontal overflow, and no console errors.
- `/api/durable/status`, `/.env`, `/wp-login.php`, and `/phpinfo.php` returned 9-byte Worker-edge `404` responses in roughly `0.20-0.22 s`, confirming the scanner-blocking change avoids a container-generated response.

## Current repository and release state, 2026-07-06

Observed facts:

- `v0.4.0` is the latest tagged release and marks the sheet/MapLibre interface redesign.
- Production was deployed on 2026-07-06 with Worker version `1f2b6dc1-8f48-4354-be76-e65e339e3711` and container image `pannes-historiques-pannescontainer:1f2b6dc1`.
- Current `main` is clean and synced with `origin/main` at `698c7f3` (`Remove Claude config and clarify branch names`).
- The merged auxiliary `codex/*` worktrees/branches were cleaned up after confirming they had no commits ahead of `main`; only `main` remains locally and on `origin`.
- The current browser interface is MapLibre plus a single sheet. Older Leaflet/sidebar/accordion/HTMX notes below are retained as historical evidence, not as the current UI state.

Current follow-up evidence:

- `PLANS.md` now treats `v0.4.0` as the current released baseline and current `main` as the next implementation starting point.
- The remaining product-proof gaps are current-location behavior on a real phone or controlled mobile simulation, mobile source/detail readability for dense archive/disclosure states, saved-URL freshness/change indicators, and a practical keyboard/screen-reader pass for the sheet UI.

## Local mobile verification: deployed mobile answer slice, 2026-07-05

Local app checked on a 390 x 844 mobile viewport with Playwright/Chromium.

Screenshots saved under `/tmp` during the run:

- `/tmp/pannes-mobile-ux-20260705f/01-after-fix.png`
- `/tmp/pannes-mobile-ux-20260705g/compare-fixed.png`
- `/tmp/pannes-mobile-ux-20260705h/gaspe-zero-fixed.png`

Verified locally:

- Typed address searches open with a local stability answer card and `Déjà vues ici` / `Seen Before Here` before broader layer context.
- The local answer card shows retained-record count, 5 km radius, most recent retained record, nearest retained record, distance-band counts, and restrained source/caveat language.
- Current and Planned sections show nearby-within-5-km summaries separately from Quebec-wide layer counts.
- Zero-history locations explain the `0` result and no longer reserve a large blank previous-history panel on mobile.
- The comparison tray stores searched addresses in browser local storage and displays refreshed retained-record counts for compared addresses.
- Captured mobile states had no horizontal overflow.

Verification commands from the implementation pass:

- `uv run pytest tests/test_views.py -q`
- `node --test tests/side-panel-archive.test.js`
- `uv run ruff check . --fix`
- `uv run ruff format .`
- `uv run djlint app/templates --lint`
- `npm run format`
- `npm run check`
- `git diff --check`

Still not fully proven:

- current-location search on a real or simulated phone;
- mobile source/detail-panel inspection for researcher workflows;
- saved-URL freshness/change detection;
- practical keyboard/screen-reader behavior for panel state, row selection, and detail-panel announcements.

## Production UI/UX audit: pannes.ca, 2026-06-17

Live site checked: `https://pannes.ca/`.

Browsers/viewports checked:

- desktop: 1280 x 720
- iPad portrait-sized: 834 x 1112
- iPhone portrait-sized: 390 x 844

Browser checks run:

- page identity: title `Historique des pannes Hydro-Québec`
- non-blank map and sidebar rendering
- desktop, iPad-sized, and iPhone-sized screenshots
- console warning/error pass
- address search, layer help, layer toggle, row selection, map polygon click, and English-language toggle

Console result:

- no application errors observed
- repeated production warning from `cdn.tailwindcss.com`: Tailwind CDN should not be used in production

Addresses sampled:

- `500 Boulevard René-Lévesque Ouest, Montréal, QC` on desktop
- `835 Avenue Wilfrid-Laurier, Québec, QC` on iPad-sized viewport
- `172 Rue de la Reine, Gaspé, QC` on iPad-sized viewport
- `100 Rue Perreault Est, Rouyn-Noranda, QC` on iPhone-sized viewport

Observed address-result evidence:

- Montréal: `Déjà vues ici` / `Seen before here` showed `12/24 plus proches · 5 km`
- Québec: `Déjà vues ici` showed `12/24 plus proches · 5 km`
- Gaspé: `Déjà vues ici` showed `3/24 plus proches · 5 km`
- Rouyn-Noranda: `Déjà vues ici` showed `12/24 plus proches · 5 km`

Interpretation:

- The app can support a relative stability comparison from retained outage evidence: in this sample, Gaspé appears to have fewer retained nearby historical records than Montréal, Québec, and Rouyn-Noranda.
- At audit time, the deployed `v0.2.7` app did not yet answer the user question in plain language. Users had to infer the conclusion from `12/24 plus proches · 5 km`, row dates, times, and customer-count pills.
- The current outage section remains province-wide and visually dominant after an address search. That can make the local stability answer feel secondary even though `Déjà vues ici` is the more relevant section for the question.
- Layer help copy is useful and credible for provenance, but it explains the layer rather than the local answer.

UI findings:

- Desktop map-first layout is coherent. The search bar, language switcher, map, and left result panel are visually restrained and usable.
- iPad-sized layout remains usable. The panel and map both have enough room, but the current-outage list consumes most of the result panel height.
- iPhone-sized layout is functional. The bottom sheet pattern works and expanding `Déjà vues ici` collapses `Actuelles`, but the long address is clipped in the input and the stability evidence is still a small secondary line in the sheet.
- Icons are visually consistent and many icon-only buttons have useful accessible labels, such as `Expliquer Déjà vues ici` and `Afficher Déjà vues ici`.
- Some button nodes observed in the DOM had zero-size boxes, including current-layer toggle and resize controls in some states. This should be reviewed for keyboard and screen-reader reliability.
- Row icon language is compact and consistent, but the rows lack always-visible column labels. A new user has to infer time/status/customers from icon meaning and repetition.
- Search result row clicks zoom the map to outage polygons, which is useful. Clicking a polygon did not reveal a readable popup or populated detail panel in this pass, so the map movement is the only feedback.
- English localization works for main labels and section names. Lower layer counts briefly showed `Loading` after switching language and then resolved after several seconds.

Most useful product improvements suggested by the audit, with implementation status:

1. Add an address-level answer card above the layer accordions, such as retained nearby outage count within 5 km, with archive-coverage caveats.
2. Make `Déjà vues ici` / `Seen Before Here` the default expanded section after an address search.
3. Add clearer local-vs-province labels: current outages across Quebec versus previous outages near this address.
4. Add visible row column labels in expanded sections: date/time/status/customers as appropriate for the layer.
5. Add map/detail feedback on row and polygon selection.
6. Remove the zero-size current-layer toggle from the visible controls.

These items were implemented in the merged frontend-stability slice and later superseded by the `v0.4.0` sheet/MapLibre redesign.

Remaining follow-up:

- Replace Tailwind CDN with a production build path during the planned frontend/tooling work.
- Keep monitoring long-address clipping and mobile hit targets during the next deployed frontend pass.

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

## Status-code source checkpoint

Status-code decoding checkpoint:

- Hydro-Quebec's open-data catalogue for `pannes-interruptions` documents outage and planned-interruption status codes `A`, `L`, and `R`.
- English labels from the catalogue: `A` = `work assigned`, `L` = `crew at work`, `R` = `crew en route`.
- French labels from the catalogue: `A` = `travaux assignes`, `L` = `equipe au travail`, `R` = `equipe en route`.
- The same page lists a default/blank status, but it does not document the `N` status observed in current live payloads.
- Conclusion: decode `A`, `L`, and `R`; preserve unknown codes such as `N` as raw source codes until their meaning is verified.
- Source: https://donnees.hydroquebec.com/explore/dataset/pannes-interruptions/

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

## Implemented conclusions from the first research pass

The initial product and data-strategy questions are now answered well enough for the current implementation:

- Do not claim complete public 5-year outage history. The public Hydro-Québec feed is useful for current/near-real-time outages and planned interruptions, while multi-year address history appears to require Hydro-Québec internal lookup, disclosure records, or our own archive over time.
- Preserve raw source payloads. Parser behaviour and field meanings can change, so raw Hydro and DAI payloads should remain durable evidence.
- Treat snapshot-derived outage history conservatively. Prefer wording such as "observed in this archive" or "previously seen" over definitive claims of complete outage duration/history.
- Keep disclosure records separate from live/archive feed rows. Disclosure data is valuable but partial, geography-specific, and different in precision.
- Use a hybrid durable architecture. D1 fits normalized relational metadata and indexed lookup rows; R2 fits raw files and bulky payloads.
- Keep map payloads lazy and bounded. Large global/disclosure geometry or popup payloads should not be embedded in the initial address-search response.

Open research/product questions that remain:

- whether Hydro-Québec can provide a bulk historical export through open-data outreach or formal access request
- how precise future public wording should be around "nearby", "observed", "area context", and "address-level attribution"
- whether a future regional dashboard should use Leaflet, MapLibre, deck.gl, or a separate analytical map stack
- whether brownout/undervoltage history is obtainable at all, since it does not appear to be represented in the public outage feed

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
- For the then-current production map scale recorded earlier, a trimmed `/search-map` response had roughly 56 map items and about 155 KB of HTML. Leaflet was fine at that scale; switching to deck.gl would have added integration complexity without a clear speed win.
- deck.gl becomes more interesting for the planned regional dashboard if we move from a handful of address/search overlays to province-wide analytical layers:
  - choropleths by region/MRC/municipality
  - dense current + historical outage point clouds
  - timeline playback across many snapshots
  - heatmaps or H3/quadbin outage density
  - smooth hover/pick interactions over many geometries
  - visual comparisons between current, planned, previous, and disclosure layers
- The cleanest open-source stack for that future is probably MapLibre + deck.gl, not Leaflet + deck.gl. deck.gl can be used with Leaflet through `@deck.gl-community/leaflet`, but that module is community maintained and explicitly warns that it may not have timely maintainers. For a core production renderer, MapLibre + deck.gl is a better-supported path.
- A middle path is possible:
  - keep Leaflet for the address-first search map at that stage
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
  - 2026-07-02 `v0.3.1` deployment caveat: `npx wrangler deploy` registered new Worker versions but initially left production serving the stale `d6abddee` container image because Docker/Wrangler reused a cached image digest and then treated the container app as having no changes. The successful rollout used an isolated Docker config under `/tmp/pannes-docker-config`, symlinked the normal Docker `cli-plugins` and `buildx` directories into it, removed the temp config's `credsStore` setting to avoid the macOS credential-helper hang, cleared Docker buildx cache, then reran `env DOCKER_CONFIG=/tmp/pannes-docker-config npx wrangler deploy --containers-rollout immediate --tag v0.3.1 --message "Release v0.3.1"`. The successful Worker version was `6c95e2bf-9f6a-4bb1-a32a-74fb5526d8fa`; the deployed container image was `pannes-historiques-pannescontainer:6c95e2bf`; `/service-worker.js` then served `pannes-historiques-v0.3.1-web-quality-foundation` and `/sitemap.xml` returned `200`.

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
