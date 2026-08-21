# ADR 0007: Collect Bounded First-Party Usage Evidence

- Status: Accepted
- Recorded: 2026-08-21

## Context

pannes.ca needs evidence about which substantive functions are used before expanding its public data product. Page views and infrastructure traffic cannot answer that question: they mix people with crawlers, uptime probes, static assets, and container wakeups. Conventional analytics would add identifiers and a broader collection surface than this product decision requires.

## Decision

Collect only explicit, allowlisted first-party interface actions: opening current, planned, Archive, or Context views; opening their detail records; receiving an address answer; and adding an address to the browser-local comparison.

The browser sends only `feature` and `action` to a fixed same-origin endpoint with no referrer. It sends nothing when Global Privacy Control or Do Not Track is enabled. The application does not persist an address, query, URL, coordinate, IP address, user agent, identifier, fingerprint, raw event, or visitor record. Cloudflare and application request logs remain subject to the separate logging disclosure on the About page.

The Worker validates the feature/action pair and immediately increments one UTC daily D1 aggregate. Events with an explicit same-origin interaction signal and a non-automated user agent increment `human_interaction_count`; obvious automation or events without that signal increment `non_human_count`. These labels are operational classifications, not proof of identity. Counts describe interactions, never people or unique visitors. A Cloudflare edge rule limits writes per IP before D1; the application does not write that IP to the usage tables.

Daily aggregates retain for 90 rolling days. A separate daily status heartbeat distinguishes zero observed interactions from unavailable collection, without recording a visitor or event. The existing half-hourly maintenance schedule marks collection active and deletes older rows. Aggregate data is available only through a token-protected operational readout; the public collection endpoint is write-only and returns no counts.

## Consequences

- Product decisions can use feature-level demand without constructing visitor profiles.
- Audience size, sessions, funnels, retention, and unique visitors cannot be inferred from this dataset.
- A repeated action is counted repeatedly, so the readout must call every value an interaction count.
- Browser privacy signals reduce the measured count by design.
- The About page and operational documentation must remain synchronized with the schema, retention, and route boundary.

## Reconsider When

Reconsider this design only when a concrete product question cannot be answered by daily feature/action counts. Any expansion must document the minimum additional fields, purpose, retention, access boundary, public disclosure, opt-out behavior, and why a less invasive aggregate cannot answer the question. Do not enable Cloudflare Browser Insights or a third-party analytics script as an undocumented shortcut.
