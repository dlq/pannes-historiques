# Public Surface And API Posture

This file records what pannes.ca exposes today and how stable each route is.
It is deliberately conservative: **there is no versioned public API contract
yet.** That contract is planned for `v0.5.0`. Until then, every JSON route
below is available-but-unstable and may change or disappear without notice.

Machine-readable summaries of the same posture live at `/llms.txt`,
`/.well-known/security.txt`, and `/humans.txt`.

## Stability tiers

| Tier | Meaning |
| --- | --- |
| `stable` | Safe to depend on. Breaking changes get a version bump and a changelog entry. |
| `unstable` | Publicly reachable, but the shape, name, and existence may change without notice. Do not build on it. |
| `private` | Not for public use. Returns `404` publicly; requires an internal header, scheduled header, or operation token. |

## Public pages — `stable`

| Route | Notes |
| --- | --- |
| `GET /` | Map and search shell. `?lang=fr\|en`, `?q=`, `?lat=&lon=&accuracy_m=`. |
| `GET /about` | Sources, method, limits, privacy posture. |
| `GET /healthz` | Liveness check. Returns `{"ok": true}`. |

The user-facing URL contract (`lang`, `q`, coordinate params) is intentionally
small and is treated as stable.

## Machine-readable metadata — `stable`

| Route | Notes |
| --- | --- |
| `GET /robots.txt` | Crawl policy; points at the sitemap. |
| `GET /sitemap.xml` | Public pages in both languages. |
| `GET /.well-known/security.txt` | RFC 9116 contact. `Expires` is generated at request time so it cannot silently lapse. |
| `GET /security.txt` | `301` redirect to the `.well-known` location. |
| `GET /humans.txt` | Maintainer, stack, and credits. |
| `GET /llms.txt` | Project summary and data limits for automated readers. |

## Fragment and asset routes — `unstable`

These exist to serve the first-party frontend. They are shaped for the UI, not
for third-party consumption, and change whenever the UI changes.

| Route | Notes |
| --- | --- |
| `GET /sheet` | Server-rendered sheet fragment. `domain`, `scope`, plus the search params. |
| `GET /map-layer` | Map layer payload for one domain. |
| `GET /map-context-geometries` | Regional and disclosure geometry for map context. |
| `GET /autocomplete` | Address suggestions. |
| `POST /search`, `POST /search-location` | Compatibility endpoints behind the sheet flow. |
| `GET /service-worker.js` | App-shell service worker. |

## Durable JSON routes — `unstable`

Worker-served and D1-backed. The most likely candidates to become the first
`stable` API in `v0.5.0`, but not yet contract-bound.

| Route | Notes |
| --- | --- |
| `GET /api/durable/hydro` | Current and planned feed rows. |
| `GET /api/durable/nearby` | Current rows near a coordinate. |
| `GET /api/durable/history-nearby` | Archived rows near a coordinate. |

Consumers should assume: no pagination guarantees, no field-stability
guarantees, no rate-limit guarantees, and no deprecation window.

## Private routes — `private`

Blocked at the Worker edge or gated behind a token. They return `404` to the
public and should not be probed.

| Route | Gate |
| --- | --- |
| `/internal/*` | Internal header. |
| `/cron/*` | Scheduled header. |
| `/collect*` | Debug flag or internal/scheduled header. |
| `/debug/*` | Debug flag. |
| `/api/durable/status`, `/api/ops/cost-health` | Operation token. |
| `/api/durable/runtime/*` | Operation token; used by the container. |

## Security headers

Every container response carries `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security`, and a
`Content-Security-Policy`.

The CSP is shaped around real application needs rather than copied boilerplate:

- `script-src 'self'` — no inline or third-party scripts. The `/sheet` fragment
  embeds map data in a `<script type="application/json">` data block, which is
  not executed and therefore not script-src controlled.
- `style-src 'self' 'unsafe-inline'` — one template sets an inline `style`
  attribute for the history bar heights. Scripts never get `unsafe-inline`.
- `worker-src 'self' blob:` and `child-src 'self' blob:` — MapLibre GL JS
  spawns its worker from a blob URL.
- `connect-src` and `img-src` allow `https://tiles.openfreemap.org` for the
  Liberty style, tiles, glyphs, and sprites.
- `geolocation=(self)` in `Permissions-Policy` — the current-location search
  depends on it. Camera, microphone, payment, and USB are denied.

Changing the map host, adding a third-party script, or introducing an inline
script requires updating `SECURITY_HEADERS` in `app/web.py` and the CSP
regression tests in `tests/test_web.py`.
