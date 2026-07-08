# pannes.ca Live UI/UX Audit - 2026-07-08

## Scope

Combined UI, UX, and screenshot-based accessibility-risk review of the live public site at `https://pannes.ca/`.

Captured states:

1. `01-home-desktop.png` - premature full-page desktop capture, mostly blank while the app/map was still settling.
2. `01b-home-desktop-after-wait.png` - rendered desktop home.
3. `02-search-suggestions-desktop.png` - desktop address search suggestions.
4. `03b-search-result-montreal-after-wait.png` - desktop Montreal search result overview.
5. `04-search-local-history-list.png` - local archive/history list.
6. `05-history-row-detail.png` - selected archive row detail.
7. `06-compare-tray.png` - compare tray after adding one place.
8. `07-context-view.png` - context/disclosure list.
9. `08-planned-nearby.png` - planned tab after local search.
10. `09-current-nearby.png` - current tab after local search.
11. `10-about-fr-desktop.png` - French about page.
12. `11-home-en-desktop.png` - English home.
13. `12-home-mobile-fr.png` - mobile home.
14. `13-search-mobile-suggestions.png` - mobile suggestions.
15. `14-search-result-mobile.png` - mobile Montreal result.

## Summary

The live site has a strong core product shape: map-first, fast to understand, and unusually transparent about data limits. The mobile experience is better than expected: the bottom sheet gives the map enough room while keeping the key status, history, and actions reachable.

The highest-impact UX problems are around scope persistence, comparison affordance, and assistive-technology semantics. After a local search, tab changes can shift the user from local context back to Quebec-wide lists, which is surprising. Search suggestions read duplicated text in the DOM. The app surface has no visible `h1`, and some rows/buttons expose long concatenated labels.

No browser console warnings or errors were captured during the checked states.

## Strengths

- The core desktop layout is immediately understandable: map on the right, actionable sheet on the left.
- Search suggestions are visually clean and appear quickly.
- The Montreal overview explains nearby current outages, planned interruptions, and local archive history without overclaiming official address-level certainty.
- The local history card is compact and useful: count, date range, bar sparkline, nearest/recent summary, and caveat all fit together well.
- Archive row detail is clear once opened: the selected event becomes a focused detail panel and the map recenters.
- The about page is plain, credible, and directly addresses source limits, privacy, and non-affiliation.
- Mobile reflow is effective: the map remains useful, the bottom sheet feels native, and the search/result path is practical.

## Findings

### P1 - Local Search Scope Does Not Persist Across Tabs

Evidence: `03b-search-result-montreal-after-wait.png`, `08-planned-nearby.png`, `09-current-nearby.png`.

After searching Montreal, the overview says `rayon de 5 km` and summarizes nearby current/planned events. But clicking `Planifiees` or `En cours` shows Quebec-wide lists with the `Quebec` scope selected. This is surprising because the page still appears anchored to the searched place.

Recommendation: keep `5 km` selected when entering `En cours` and `Planifiees` from a local search overview, or make the scope switch explicit with copy such as "Vue Quebec" and a prominent local toggle.

### P1 - Compare Flow Starts But Does Not Explain The Next Step

Evidence: `06-compare-tray.png`.

Clicking `Comparer` adds a tray with the selected place and an `Effacer` action, but there is no visible instruction for adding a second place, no disabled compare state, and no clear end state. The button also remains styled as the primary action, which makes it look like the comparison should already have happened.

Recommendation: after one place is selected, change the state to something like "Ajoutez une autre adresse" and keep search focused/available as the obvious next step. Consider a two-slot compare tray.

### P2 - Search Suggestion Accessible Text Appears Duplicated

Evidence: `02-search-suggestions-desktop.png`, browser DOM inspection.

The visible suggestion is fine, but each suggestion button's text content read as duplicated, for example `MontrealMontreal, Montreal, Quebec`. Screen readers may announce redundant labels.

Recommendation: give each suggestion button a concise `aria-label`, or mark the repeated visual title/subtitle pieces so the accessible name is composed once.

### P2 - App Screen Has No H1

Evidence: browser DOM inspection on home/result states.

The about page has a proper `h1`, but the map app states had no `h1`; the first headings observed were `h2` elements such as the selected address and data-info modal heading. This weakens screen-reader page orientation.

Recommendation: add a visually hidden `h1` for the app surface, e.g. `Carte des pannes Hydro-Quebec`, and keep the dynamic selected place as an `h2` or region heading.

### P2 - English Localization Is Incomplete

Evidence: `11-home-en-desktop.png`.

The English interface still shows row metric labels as `clients`, and at least one status reads `Crew en route`. The main shell is translated, but these leftovers make the English version feel less polished.

Recommendation: translate the shared row labels and status strings consistently, likely `customers` instead of `clients`.

### P2 - Context List Mixes Data Types Without Enough Scannable Differentiation

Evidence: `07-context-view.png`.

The context tab combines regional 2025 outage disclosure rows with municipality/borough context rows. The intro explains the source, but the row list makes `Montreal 2025 3530 Pannes`, `Cote Saint-Luc 2019-2022 municipality_context 1315 lignes`, and `Outremont borough_context` feel like the same kind of item.

Recommendation: group rows by type, or replace raw source-type labels with plain categories such as `Region`, `Municipalite`, and `Arrondissement`; keep the raw source type available in details.

### P3 - Some Touch Targets Are Small

Evidence: browser target-size heuristic on mobile result state.

The data-info icon in the history card measured about 19px square. Attribution links are also tiny, though map attribution is partly constrained by map provider norms.

Recommendation: expand the hit area for small icon-only controls to at least 32px, ideally 40-44px on mobile, while keeping the visual icon small.

### P3 - Initial Load Can Present A Mostly Blank Capture State

Evidence: `01-home-desktop.png`, followed by successful rendered state in `01b-home-desktop-after-wait.png`.

The first desktop full-page screenshot shortly after `domcontentloaded` showed only the brand chip. The app rendered correctly after additional wait. This may not be user-visible for long, but it suggests the initial loading state is visually under-specified.

Recommendation: add a lightweight loading/initializing affordance in the sheet area or preserve the sheet skeleton until map/list hydration is visually complete.

## Step Health

1. Desktop home - Healthy, but dense and depends on map/list hydration.
2. Desktop search suggestions - Healthy visually; accessibility text needs cleanup.
3. Desktop searched-place overview - Strong and confidence-building.
4. Local history list - Healthy, dense but readable.
5. Archive row detail - Clear, though the sheet can feel underfilled on desktop.
6. Compare tray - Functional start, unclear next step.
7. Context tab - Useful, but row types need clearer grouping.
8. Planned/current tabs after local search - Needs UX correction around scope persistence.
9. About page - Healthy and trustworthy.
10. English home - Mostly healthy, incomplete localization.
11. Mobile home - Healthy and practical.
12. Mobile search suggestions - Healthy, good sheet behavior.
13. Mobile search result - Strong mobile state; actions are reachable below the fold.

## Evidence Limits

- This was a screenshot and browser-behavior audit, not a full WCAG audit.
- I did not accept browser geolocation permission, so current-location permission copy and browser prompt recovery were not fully tested.
- I did not run a full keyboard-only traversal or screen-reader session.
- Live data changes over time; outage counts and times are current only for this audit run.
