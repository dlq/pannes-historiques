# Architecture

Pannes Historiques is a Flask application deployed behind a Cloudflare Worker and Container. The current design keeps the browser-facing app stable while moving durable production state into D1 and R2.

## Request Flow

- Public page requests (`/`, `/search`, `/search-map`) enter the Worker and are forwarded to the Flask container.
- Public read APIs under `/api/durable/hydro`, `/api/durable/nearby`, and `/api/durable/history-nearby` are served directly by the Worker from D1/R2.
- Private runtime APIs under `/api/durable/runtime/*` are Worker endpoints used by the container. They require `X-Pannes-Operation-Token`.
- Private operational paths (`/internal/*`, `/cron/*`, `/collect*`, `/debug/*`) are blocked at the Worker edge unless they are reached through scheduled/internal flows.

## Runtime Ownership

- `app/` owns Flask routes, search orchestration, Jinja rendering, local SQLite fallback paths, and Python collectors.
- `app/static/` owns browser behavior as plain ES modules.
- `src/worker.js` owns Worker fetch/scheduled entrypoints and D1/R2 runtime behavior.
- `src/container.js` owns Cloudflare Container configuration.
- `src/worker-routing.js` owns top-level Worker path classification.
- `src/runtime-policy.js` owns private durable-runtime endpoint policy.
- `src/municipal-archive.js` owns pure municipal geometry helpers shared by Worker code and maintenance scripts.
- `scripts/maintenance/` owns one-off or operator-driven maintenance scripts.

## Data Stores

- D1 stores normalized feed versions, current outage rows, planned interruption rows, resolved previous-outage rows, disclosure metadata, municipal archive bins, and geometry metadata.
- R2 stores raw Hydro-Quebec feed payloads and raw DAI/access-to-information source files.
- The container image still includes a baked SQLite snapshot for local-compatible fallback paths. Runtime writes inside the container are ephemeral.

## Generated Evidence

Playwright screenshots, JSON snapshots, and other large run outputs belong under ignored `output/` paths. Commit durable conclusions to `NOTES.md`, `PLANS.md`, or release notes instead of committing raw generated artifacts.
