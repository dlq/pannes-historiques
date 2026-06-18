# User Stories For Next Product Slices

Date: 2026-06-17

This file captures practical user stories for focusing the next pannes.ca work. These are not implementation tasks by themselves. They are decision scenarios that should drive UI, copy, data, and test choices.

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

- The app is becoming useful for relative stability comparison, but the next slice should make the interpretation more explicit: count, radius, time coverage, comparison baseline, and confidence caveat should be easier to read without manually interpreting rows.

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

- Add a comparison-friendly local metric and coverage caveat. Avoid declaring an address reliable or unreliable without enough context.

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

- Add a local current-outage summary separate from province-wide current context.

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

- Consider a local planned-work summary, and avoid showing province-wide planned counts as if they answer the address question.

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

- Add a compact distribution cue: nearest distance, most recent date, and perhaps a count by distance band.

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

- Strengthen provenance and scale language: local record, municipal/territory archive, regional disclosure, and province-wide current feed should not blur together.

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

- Add confidence and coverage language to the top-level local answer, not only to layer help popovers.

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

- Keep testing long-address clipping, bottom-sheet height, and selected-row/detail behavior on iPhone-sized screens.

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

- Improve detail panels and source links for previous/archive and disclosure evidence.

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

1. Local answer confidence and freshness: add archive-window, latest-capture, and restrained confidence language to the local stability card.
2. Local-vs-province separation: distinguish nearby Current and Planned evidence from province-wide context after an address search.
3. Comparison-ready local metrics: make four-address comparison easier by keeping the local count, radius, and coverage language consistent across searches.
4. Map/sidebar connection: improve row, shape, and detail-panel selection feedback so users can see why a listed record matters.
5. Mobile answer-first review: verify that an iPhone user sees the local answer and not a province-wide list first.

