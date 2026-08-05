# Plan: Hydro-Quebec Outage History App

Date: 2026-04-25
Last updated: 2026-08-03

This is the active execution plan. Keep detailed evidence and research notes in `NOTES.md`, completed release history in `CHANGELOG.md`, operational runbooks in `docs/operations.md`, and long maintenance backlogs in `docs/maintenance-backlog.md`.

## Current State

- Current shipped release: `v0.4.6`, archive health, retention, and D1 growth control, released 2026-07-29.
- Last recorded production deployment: Worker version `8c80bf8a-f6f9-4bd3-8e71-2f0c51927dad`, deployed 2026-08-01 with the security/accessibility/legacy-URL fixes. Subsequent `main` commits are not a release claim until separately deployed and verified.
- Ingestion incident 2026-07-15 to 2026-07-20: scheduled Hydro ingestion failed every 30 minutes for five days while the site returned `200` and served stale data. Cause was the durable collection path storing payload files without registering the `raw_snapshots` row the Worker's `/internal/raw-snapshot` callback resolves through. Fixed and verified: run 3630 completed `ok` and snapshots are current again. Two plausible-but-wrong hypotheses were ruled out by testing rather than by correlation — container ephemerality, and the `v0.4.3` CodeQL path-hardening, whose lookup was exercised directly against a real file and resolves correctly.
- Monitoring gap this exposed: the only health surface was token-protected and pull-based, so nothing observed the failure. `GET /api/health/ingestion` now returns `503` when ingestion is stale or failing. The `Ingestion health monitor` GitHub Actions workflow probes it twice hourly.
- Current implementation line: `main` includes post-`v0.4.6` SEO and map-startup follow-ups; the next active product slice remains `v0.4.7` Hydro Score / regional analytics framing. See `docs/current-snapshot.md` for the concise code/deployment distinction.
- Current frontend: one full-bleed MapLibre GL map plus a single sheet. The sheet owns search, domain navigation, address overview, scoped local/province views, detail cards, provenance, and browser-local comparison.
- Current data plane: D1/R2-backed durable ingestion for current feed rows, previous-outage rows, raw Hydro-Quebec payloads, disclosure metadata, and runtime map-context layers.
- Current container role: Flask/Jinja shell rendering, local-compatible fallback paths, and a baked SQLite snapshot. Container-local writes are ephemeral and must not become production state.
- Current cost posture: hybrid Worker/D1/R2 reads and the low-cost mode guardrail limit container exposure, but container-backed browser/search paths still need measured usage and cost evidence before any broader rendering migration.
- Current public API posture: route stability tiers are now written down in `docs/api-posture.md` and summarized for machine readers at `/llms.txt`. Every JSON route is explicitly `unstable`; the first `stable` contract is still deferred to `v0.5.0`.
- Resolved mobile detail-close flake: fixed in `v0.4.5` and guarded by regression tests. Keep the detailed root-cause notes in `NOTES.md` rather than this active plan.
- Current contribution posture: contributor docs and a scoped issue map exist. GitHub Quality enforces Python branch coverage, while full Playwright runs on `main` and by manual dispatch.
- Public-announcement state: the first beta feedback post is live in `r/HydroQuebec`; the broader `r/quebec` post remains blocked by that community's account-activity requirement.
- Address-specific dispute boundary: pannes.ca can show retained observations near an address, not certify service at that residence. Direct certification requests belong with Hydro-Quebec's official past-outage form.

## Roadmap

Completed release history lives in `CHANGELOG.md`; durable investigation details live in `NOTES.md`. Active planning starts at `v0.4.7`.

### `v0.4.7`: Hydro Score / Regional Analytics Framing

Decide whether a simple, well-disclosed "walkability score for Hydro reliability" style concept can communicate regional or address-area outage context without overclaiming precision.

- Define candidate score inputs and disclosure rules before building anything.
- Decide whether a score should be numeric, categorical, or avoided in favor of component metrics.
- Record a go, revise, or defer decision with the evidence limits, intended audience, and wording that prevents an address-level reliability claim.
- Confirm the readiness gates for the `v0.5.0` API contract.
- Do not build saved areas or notifications in this slice.
- Decide the normalized archive metric, deferred here deliberately on 2026-08-05. The Archive tab now draws its municipal bins as flat outlines with no shading, because the only per-territory number available is the raw retained event count and that ranks as a population map: Montréal `16,790`, Gatineau `8,374`, Laval `7,799`, Québec `7,496`. Shading by it would repeat the mistake avoided on Contexte, where the published continuity index was chosen precisely because it is already normalized per customer. Two further blockers: 202 of 1,341 territories have no bins at all, so a pale territory would be indistinguishable between "few outages" and "never captured"; and no customers-per-territory denominator exists in the data. Real signal does survive underneath the population effect and is the reason this is worth doing rather than dropping — Val-des-Monts (`3,006`), Gracefield (`2,724`), Harrington (`2,535`) and La Pêche (`2,389`) are small rural Outaouais/Laurentides municipalities outranking Longueuil, which reflects forested terrain and overhead lines rather than population. Any archive choropleth needs a defensible denominator and an explicit coverage caveat first.

### `v0.4.8`: Privacy-Preserving Product Usage Evidence

Measure whether people reach and use the site's substantive functions before investing further in product expansion.

- Define aggregate feature-use metrics for current outages, planned interruptions, Archive, DAI/Context, address answers, and comparison. Counts are interactions, not people or unique visitors.
- Record only bounded daily aggregates. Do not persist addresses, query strings, IP addresses, user identifiers, raw interaction logs, or browser fingerprints.
- Revisit Cloudflare Browser Insights before or during this slice. Keep it disabled if it remains only broad traffic telemetry; if it is useful enough to enable, first reconcile CSP, the About-page "no analytics trackers" privacy copy, and the usage-retention policy.
- Exclude or separately classify obvious scanner and bot traffic so route probes do not look like product demand.
- Add a private operational readout with metric definitions, collection-status indicators, and a documented retention policy.
- Test event classification and ensure the public response surface never exposes operational usage data.

### `0.5.x`: Public Data Product And Analytical Expansion

Use `0.5.x` only after the `0.4.x` readiness, cost, archive-health, and machine-readable-surface slices are complete enough that broader public contracts will not lock in unstable architecture.

Entry gates: `v0.4.7` must dispose of the Hydro Score concept without unsupported reliability claims; `v0.4.8` must define and test its bounded aggregate-data lifecycle; a dated cost review must confirm the public-read posture; ingestion health and archive completeness must be operating normally; and `/autocomplete` needs an edge rate limit before a stable API expands address-related traffic.

- `v0.5.0`: historical data API contract with explicit public/private boundaries, response schemas, provenance/freshness metadata, rate limits, docs, and tests.
- `v0.5.1`: public API consumer experience: examples, sample payloads, compatibility notes, caching/rate guidance, and contract tests that contributors can run locally.
- `v0.5.2`: regional analytics and research views from bounded, materialized data products, with conservative caveats and no reliability-ranking overclaims.
- `v0.5.3`: source expansion and geocoder reliability after public contracts exist. Start with a municipal-distributor referral/source-discovery pass for Hydro-Sherbrooke: identify the authoritative live-outage map and address-specific historical-request path, and label it as external coverage. Do not scrape or imply archived Hydro-Sherbrooke coverage unless access terms, data quality, and retention are verified.

Saved areas, saved-area notifications, and web push notifications are deferred out of the concrete train until repeated user demand and a privacy/cost model justify them.

## Testing Strategy

- Keep Python tests, Node tests, module-boundary checks, template linting, and Biome checks green for every release slice.
- `v0.4.3`: Worker/runtime-policy tests cover configurable container host checks, private cost-health endpoints, and runtime markers.
- `v0.4.4`: GitHub Quality enforces a combined Python coverage floor; complete desktop/mobile browser regression runs after changes reach `main` or on manual dispatch; focused browser and contract tests remain the default for feature work.
- `v0.4.5`: route/header tests, machine-readable metadata, public/private route documentation, and security headers shipped; preserve them as public-surface regressions.
- `v0.4.6`: archive-health tests for stale ingestion-run cleanup, latest-row grouping, archive-bin completeness metrics, and retention behavior shipped; extend them before any compaction/offload migration.
- `v0.4.7`: test analytical framing with bounded fixture data only if a product concept survives review.
- `v0.5.x`: add API contract, schema, freshness/provenance, rate-limit, analytical-summary, parser, and geocoder tests as each slice lands.

### Regression guard: gated runtime endpoints (2026-08-05)

The Contexte tab was empty for seven weeks and nobody noticed. `34fee84`
(2026-06-17) gated both `GET /map-context` and `GET /previous-archive-summary`;
the container cannot authenticate, so both broke that day. `7300355`
(2026-06-20) ungated `previous-archive-summary` while working on the archive,
which fixed Archive and left Contexte broken. The same bug was found and fixed
once already, on a sibling endpoint, without anyone checking the siblings.

Why every existing safeguard missed it:

- The failure rendered as plausible content ("Aucun document publié disponible"), not as an error. A broken data path and a genuine empty result were indistinguishable.
- The map still drew region outlines from the static geometry asset, so the tab looked alive.
- The Worker logged `Ok`: returning `404` to an unauthorized caller is correct behaviour. Nothing looked wrong from either side.
- `runtime-policy.test.js` asserted that the gate list contained what the gate list contained. That tautology passes regardless of whether the container can actually reach the endpoint.

Rules that follow from this:

1. Never let a failed read render as an authoritative empty state. Distinguish "the lookup failed" from "there is nothing", and say which. Applied to the published-context builders; apply it to any new remote read.
2. Never cache a failed read. `_cached_context` without `ttl_seconds` caches forever, so one transient failure becomes permanent. Pass a TTL and a `should_cache` predicate.
3. Adding an endpoint to `PRIVATE_RUNTIME_ENDPOINTS` requires proving the container can still reach it, because the container currently cannot authenticate at all.
4. Prefer end-to-end assertions over policy-table assertions. A test that reads the same constant the code reads proves nothing about reachability.
5. When fixing a broken endpoint, check its siblings for the same defect before closing the work.

Routine command details live in `docs/contributing.md`; production and deploy checks live in `docs/operations.md`.

## Current Risks And Open Questions

- The container cannot authenticate to the Worker at all. Confirmed 2026-08-05 by logging the gate outcome for the container's own request: `got_token_header: false`, `cf_worker: null`, while `has_env_token: true` on the Worker. `envVars` does not deliver `PANNES_OPERATION_TOKEN` to the container process, and Cloudflare does not stamp `cf-worker` on the internal hop, so `isTrustedContainerRuntimeProxyRequest` is effectively dead code. Any runtime endpoint listed in `PRIVATE_RUNTIME_ENDPOINTS` is unreachable from the container. Five endpoints the container calls are still gated and therefore still return `404` to it, verified against production 2026-08-05: `operational-map-layers`, `previous-groups`, `previous-map-layers`, `query-count`, `status`. Unlike `/map-context` these do not produce a visible defect: verified 2026-08-05 that the Current sheet renders 87 outages with the newest at `13:55`, exactly matching the live D1 feed, because those paths fall back to the public `/api/durable/*` reads. The practical impact today is redundant work and a dead auth path, not stale user-facing data. `tests/runtime-policy.test.js` pins them as a shrink-only ratchet. Fix the token delivery before gating any endpoint the container needs, and do not assume the trusted-proxy path works.
- Container-backed search/render paths still need measured cost evidence; the trusted Worker host is configured in `wrangler.jsonc`, not hardcoded in runtime policy.
- Ordinary public reads should keep moving toward Worker/static/D1/R2 paths, but the right migration boundary is not yet proven.
- Archive health is deployed: stale run expiry, 30-day terminal-run retention, latest-row de-duplication, and classified archive-bin completeness. Keep monitoring the public ingestion-health endpoint and private completeness audit.
- D1 measured `1,631,522,816` bytes (about `1.63 GB`) after the 2026-07-29 archive-health index migration. The first compaction trigger is `3.5 GB`; a migration must begin before the 5 GB included-storage threshold. Raw R2 payloads, geometry, archive bins, and snapshot metadata remain out of scope for automatic deletion. See ADR 0005.
- Browser proof gaps remain: real-device geolocation/permission recovery, visible freshness/change cues, dense live-data readability, and practical keyboard/screen-reader checks.
- The WCAG pass shipped contrast, reduced-motion, live-region, dialog-focus, and keyboard regression fixes; the remaining proof gaps are ongoing maintenance work, not an unfinished `v0.4.5` release item.
- First-party JS modules improve maintainability but increase module requests; measure on Cloudflare before assuming native modules or bundling is better.
- DAI/disclosure detail panels are data-rich and visually fragile; keep checking overlap, horizontal scrolling, and dense-row readability.
- Bad in-app URLs and unhandled Flask exceptions still need minimal branded 404/500 pages.
- SEO announcement-readiness follow-up: consider `noindex,follow` for user-entered address/current-location result pages so arbitrary searches do not become indexable landing pages. Absolute `og:image` URLs and French/English/`x-default` alternates are implemented on `main`; verify them in the next production deployment.
- Address queries are capped in the application, but configure a per-IP Cloudflare rate rule for `GET /autocomplete` before exposing a stable public API; browser debouncing is not an abuse control.
- OpenFreeMap Liberty still includes non-Quebec labels at some zoom levels; solve only if it materially affects analytics or saved-area-adjacent workflows.
- Do not speculate about Hydro-Quebec one-letter status-code meanings unless source documentation or payload context verifies them.

## Plan Maintenance

- Keep this file focused on current goals, release boundaries, risks, and next steps.
- Move completed release summaries to `CHANGELOG.md`.
- Move durable evidence and long reasoning to `NOTES.md`.
- Move runbooks, cost strategy, and maintenance backlogs to focused docs.
- If this file grows past roughly 250 lines again, compact before adding more detail.
