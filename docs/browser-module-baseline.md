# Browser Module-Loading Baseline

Measured 2026-11-01 at 20:29 UTC against the deployed `dead987` application on pannes.ca
(Worker `f4559ee1-46af-4ea5-b67a-11e4c6499261`, MapLibre 6.15.0). The local Python
sheet refactor does not change the production browser graph.

## Observations

Each load recorded **13 same-origin document JavaScript resources**: 11 application modules and
two MapLibre files. No duplicate JavaScript pathname was observed. The two MapLibre files account
for about 94% of encoded JavaScript body bytes. Application code remains plain ES modules.

Medians of three independent cold/warm pairs per viewport:

| Viewport / cache | JS resource entries | JS transfer bytes | First contentful paint (ms) | Map-ready observation (ms) |
| --- | ---: | ---: | ---: | ---: |
| Desktop 1440×1000 / cold | 13 | 486,063 | 1,008 | 3,786 |
| Desktop 1440×1000 / warm reload | 13 | 0 | 580 | 1,656 |
| Mobile viewport 390×844 / cold | 13 | 486,148 | 596 | 3,379 |
| Mobile viewport 390×844 / warm reload | 13 | 0 | 352 | 1,120 |

Cold-run map-ready observations ranged from 3,036–4,103 ms on desktop and 2,707–3,898 ms
at the mobile viewport. Warm ranges were 1,655–2,326 ms and 1,107–1,262 ms respectively.
Median encoded JS body sizes were 482,163 and 482,248 bytes on cold loads; the small difference
reflects the observed responses, not different application source. Decoded JS was 1,707,575 bytes.
All 13 JS entries reported zero transfer bytes on each warm reload. No page JavaScript exception
or horizontal overflow was observed; desktop/mobile screenshots were inspected.

## Scope And Limits

- Three fresh isolated Chromium contexts per viewport, each followed by a reload in the same
  context: 12 observations. Fresh-context cold JS entries all reported nonzero transfer bytes.
- No CPU or network throttling. Both viewports run on the same desktop host; these are not phone
  benchmarks, real-user measurements, population estimates or an SLA.
- Resource Timing entries from the main document only, selecting same-origin `.js`, `.mjs` and
  `.css` URLs. The table counts JS entries; CSS remains in the raw record. Third-party tiles,
  fonts/beacons and worker-context fetches are outside this count. It is not total map/page traffic.
- Transfer bytes include browser-reported response overhead. A zero value indicates observed
  cache/service-worker reuse here; it does not mean zero decoded code or guaranteed cache reuse
  for every visitor. A cached script still has a Resource Timing entry.
- Map-ready is the time when the audit observes `appReady`, `map.loaded()` and `isStyleLoaded()`;
  polling makes this an upper bound and it is not a rendering/paint measurement. FCP is the
  browser's separate standard paint entry.
- GPC suppresses the application's first-party usage writes. This does not assert that all
  account-level Cloudflare telemetry is disabled; an edge-injected beacon is a separate open
  configuration/disclosure question.

## Decision

Retain the current native modules. The request count and warm reuse are measured, but there is
no controlled bundled alternative demonstrating a meaningful improvement. A bundling experiment
should compare the same browser, network/CPU conditions, cache states, URLs, byte totals and
readiness criteria; preserve map lazy loading and offline behavior. These measurements do not
attribute container costs or prove a specific optimization would help.

## Repeat

```bash
node scripts/maintenance/browser-module-baseline.mjs
```

Defaults to the public root `https://pannes.ca/?lang=en` and ignored `tmp/module-baseline/`.
`PANNES_BASELINE_URL` can select a local/staging root, with only an optional `lang=fr/en` parameter.
`PANNES_BASELINE_OUTPUT_DIR` changes the artifact directory. Keep JSON/screenshots untracked;
record reviewed conclusions here or in `NOTES.md`.

Browser plugin not available. The in-app inspection API could not expose Resource Timing
(`performance` unavailable), so the existing Playwright dependency provided isolated instrumentation.
This requires normal network access and a locally installed Chromium (`npx playwright install chromium`).
