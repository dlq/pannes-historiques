# User Stories For Next Product Slices

Date: 2026-06-17

This file captures practical user stories for focusing the next pannes.ca work. These are not implementation tasks by themselves. They are decision scenarios that should drive UI, copy, data, and test choices.

## Current Implementation Status

As of the July 5 mobile/local-answer slice, the current codebase has:

- a local stability answer card for address searches with count, radius, most recent retained record, nearest retained record, distance-band counts, and source/caveat copy;
- a mobile sheet that opens address searches with the local answer and `Seen Before Here` before broader layer context;
- local Current and Planned summary pills that distinguish nearby records within 5 km from Quebec-wide layer counts;
- a small browser-local comparison tray for comparing retained nearby outage counts across searched addresses;
- improved zero-history mobile states that explain what `0` means without leaving a large blank panel.

Still not fully proven:

- current-location search on a real or simulated phone;
- mobile source/detail-panel inspection for researcher workflows;
- saved-URL freshness/change detection;
- a practical keyboard/screen-reader pass.

## Baseline Scenario: Four-Address Reliability Test

Prompt:

> Pick four random addresses around Quebec and use pannes.ca to evaluate the relative stability of hydro in and around each location. Does the app answer anything? Is it usable for that question? What can be improved?

Addresses sampled in the June 17 production audit:

- `500 Boulevard Rene-Levesque Ouest, Montreal, QC`
- `835 Avenue Wilfrid-Laurier, Quebec, QC`
- `172 Rue de la Reine, Gaspe, QC`
- `100 Rue Perreault Est, Rouyn-Noranda, QC`

What the app should help answer:

- How many retained outage records have been seen near this address within 5 km?
- Are current outages affecting the broader area right now?
- Are planned interruptions nearby or regionally relevant?
- Does the evidence suggest one tested area has had more nearby interruptions than another?
- How much confidence should the user place in the answer, given archive coverage and data-source limits?

Current product lesson:

- The app is now useful for first-pass relative stability comparison on typed addresses, but the next slice should make freshness, archive coverage, source provenance, and confidence caveats more explicit. It should also prove current-location and accessibility flows, not only typed-address screenshots.

## Story 1: Home Seeker Comparing Neighbourhoods

As someone considering where to rent or buy, I want to compare several candidate addresses so I can avoid overinterpreting a single outage snapshot.

Test queries:

- `5220 Rue Jeanne-Mance, Montreal, QC`
- `835 Avenue Wilfrid-Laurier, Quebec, QC`
- `100 Rue Perreault Est, Rouyn-Noranda, QC`
- `172 Rue de la Reine, Gaspe, QC`

The app should answer:

- Which address has more retained nearby outage records within 5 km?
- Which has fewer records?
- Whether the difference looks meaningful or just reflects sparse archive coverage.

Success looks like:

- A plain-language local stability card says something like: `5 retained records within 5 km in the current archive`.
- The user can compare the same metric across addresses without learning the row structure.
- The card includes a small coverage note, such as the archive window or latest capture date.

Next product gap:

- Expand the comparison tray into a more durable comparison workflow if users need it, and add clearer archive-window/freshness context. Avoid declaring an address reliable or unreliable without enough context.

## Story 2: Resident Checking If Power Problems Are Local Today

As a resident whose lights flickered or went out, I want to know whether Hydro-Quebec currently reports an outage near me.

Test query:

- Current location, or a typed address during an active outage.

The app should answer:

- Is there a current outage area near the searched address?
- How far away is the nearest current outage shape or marker?
- What is Hydro-Quebec's current status for that outage?

Success looks like:

- The Current section distinguishes `near this address` from `elsewhere across Quebec`.
- If no current outage is near the address, the app says so plainly.
- Current rows that are far away do not visually imply local impact.

Next product gap:

- The local-vs-Quebec summary now exists for address searches. Next, add nearest-distance/status wording for Current so a resident can tell whether a row is close enough to matter without opening every row.

## Story 3: Household Planning Around Scheduled Interruptions

As a household planning work calls, cooking, medical equipment charging, or remote work, I want to know whether planned interruptions are scheduled near my address.

Test query:

- `5220 Rue Jeanne-Mance, Montreal, QC`

The app should answer:

- Are any planned interruptions near this address?
- What date and time window are planned?
- How many customers are affected, and how close is the planned area?

Success looks like:

- Planned work near the address is called out before province-wide planned work.
- The row labels make the window, duration, and customers unambiguous.
- The map and selected row make it clear whether the planned shape is close enough to matter.

Next product gap:

- The local-vs-Quebec Planned summary now exists for address searches. Next, strengthen row-to-map selection and distance/context cues so nearby planned work is visibly connected to the searched address.

## Story 4: Repeat-Outage Pattern Finder

As a resident who suspects the same block or neighbourhood has repeated outages, I want to see whether the archive has seen interruptions near this address before.

Test query:

- `5220 Rue Jeanne-Mance, Montreal, QC`

The app should answer:

- How many retained previous outage records are within 5 km?
- When were the most recent nearby records?
- Were they clustered near the address or scattered around the 5 km radius?

Success looks like:

- `Seen Before Here` is the default local-history panel for address searches.
- The map shows retained nearby records without requiring the user to infer why they are listed.
- The app avoids confusing `nearest records shown` with `all records within 5 km`.

Next product gap:

- Compact distribution cues now exist in the local answer. Next, add archive-window/freshness metadata and make row-to-map/detail selection more obvious on mobile.

## Story 5: Regional Context Seeker

As someone comparing towns or regions, I want to understand whether the local result fits a broader regional pattern.

Test queries:

- `172 Rue de la Reine, Gaspe, QC`
- `100 Rue Perreault Est, Rouyn-Noranda, QC`

The app should answer:

- Does the local 5 km evidence look sparse or heavy relative to the surrounding region?
- Are there disclosure or regional metrics that give broader context?
- Is the region's historical burden from disclosures aligned with the local retained records?

Success looks like:

- Disclosures and regional context are clearly labelled as broad context, not proof of an outage at the precise address.
- The user can tell the difference between local retained feed history and published regional disclosure data.

Next product gap:

- Continue strengthening provenance and scale language in detail panels: local retained feed record, municipal/territory archive bin, regional disclosure, and province-wide current feed should not blur together.

## Story 6: Skeptical User Checking Trust And Source Limits

As a skeptical user, I want to know where each claim comes from so I can decide how much to trust the result.

Test query:

- Any address search with Current, Planned, Seen Before Here, and Disclosures expanded in turn.

The app should answer:

- Which evidence is live Hydro-Quebec feed data?
- Which evidence is retained archive data captured by pannes.ca?
- Which evidence comes from access-to-information disclosures?
- How fresh is the current feed, and how complete is the local archive?

Success looks like:

- Each panel has a short source/provenance explanation available without leaving the map.
- The local stability card includes a restrained caveat rather than overstating reliability.

Next product gap:

- The top-level local answer now includes a restrained caveat and source language. Next, add explicit archive-window/freshness metadata and validate that source/detail panels remain understandable on mobile.

## Story 7: Mobile User Standing At A Property

As someone standing outside a building with a phone, I want to use current location and quickly understand the local evidence without fighting the mobile sheet.

Test query:

- Current-location search on an iPhone-sized viewport.

The app should answer:

- What address or coordinates did the app use?
- Is there current, planned, or previous local evidence nearby?
- What should I tap first to understand the answer?

Success looks like:

- The mobile sheet opens to the local answer and `Seen Before Here` rather than a long province-wide list.
- The address field remains readable enough to confirm the target.
- Map pins, selected rows, and details feel connected.

Next product gap:

- Typed-address mobile searches now open to the local answer and local history. Still prove current-location search on a real or simulated phone, including permission handling, coordinate/address confirmation, long-address clipping, and selected-row/detail behavior.

## Story 8: Local Journalist Or Researcher Looking For Examples

As a journalist, researcher, or civic-minded user, I want to find places with repeated or notable outages so I can investigate patterns responsibly.

Test query:

- Start from a known address, then inspect nearby historical rows and municipal archive bins.

The app should answer:

- Which nearby retained events were most recent or affected the most customers?
- Are there municipal archive bins or disclosure sources that support broader analysis?
- Can I cite or inspect the source evidence?

Success looks like:

- Detail panels expose source type, date, affected customers, and area without overwhelming ordinary users.
- The app keeps raw-source provenance available for deeper investigation.

Next product gap:

- Improve and verify mobile detail panels and source links for previous/archive and disclosure evidence; this was not fully proven in the July 5 mobile pass.

## Story 9: Returning User Checking Whether Things Changed

As someone who checked an address earlier, I want to revisit it and see whether the current situation or local evidence changed.

Test query:

- Reload a saved URL such as `/?lang=en&q=5220+Rue+Jeanne-Mance`.

The app should answer:

- Is the current feed fresh?
- Did the count of local retained records change?
- Are there new planned interruptions?

Success looks like:

- The URL restores the same address and local context.
- Feed freshness and latest-capture information are visible enough to tell whether this is new information.

Next product gap:

- Add freshness metadata to the local answer and current/planned sections.

## Story 10: Accessibility-First Keyboard User

As a keyboard or screen-reader user, I want to understand and operate the same map/sidebar evidence without relying on visual icon inference.

Test query:

- `5220 Rue Jeanne-Mance, Montreal, QC`

The app should answer:

- What panels exist?
- Which panels are shown on the map?
- Which row is selected, and what detail did it open?

Success looks like:

- Show/Hide buttons describe the action and state clearly.
- Column labels are present in the expanded panel content.
- Focus states, selected states, and detail-panel changes are announced or discoverable.

Next product gap:

- Continue the practical WCAG pass with live-region status, focus order, and screen-reader checks.

## Next Slice Candidates

The strongest next slices suggested by these stories are:

1. Freshness and confidence: add archive-window, latest-capture, feed freshness, and clearer confidence language to the local stability card and Current/Planned summaries.
2. Current-location proof: verify the current-location path on a phone-sized viewport, including permissions, address/coordinate confirmation, and first visible answer state.
3. Research/source-detail proof: improve and test mobile detail panels, source links, selected-row-to-map feedback, and dense disclosure/archive readability.
4. Accessibility proof: run a practical keyboard/screen-reader pass for panel state, Show/Hide wording, row selection, live-region/status updates, and detail-panel announcements.
5. Comparison workflow refinement: decide whether the local comparison tray should remain a lightweight local-storage helper or become a more explicit multi-address comparison view.
