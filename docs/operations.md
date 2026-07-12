# Operations

This document keeps production and release-check details out of `PLANS.md`.

## Local Runtime

Run the local app:

```bash
uv run python server.py serve
```

The default local URL is `http://127.0.0.1:8000`.

## Deployment

Production deploy command:

```bash
npx wrangler deploy
```

Do not deploy unless explicitly requested. For deployment-related changes, run a dry run first:

```bash
npx wrangler deploy --dry-run
```

After every production deploy, verify the container image/version changed, not just the Worker version.

## Production Smoke Checks

Include these after a deploy:

- `/healthz`
- homepage in English and French
- representative address search
- private durable status through an authorized operational check, not a public unauthenticated URL
- static app assets and service worker
- container status/image if the deploy touched container code

## Static Asset Performance Checks

For Cloudflare static-asset performance work, use cold and warm `curl -fsS -w` probes for:

- `/static/app.css`
- `/static/app.js`
- each first-party ES module
- `/static/icons.svg`
- `/service-worker.js`
- `/static/manifest.webmanifest`
- Noto Sans font files
- vendored MapLibre assets

Record HTTP status, `cf-cache-status`, `cache-control`, `etag`, `content-encoding`, transfer size, TTFB, and total time. Repeat with a cache-busting query and without one. Compare browser DevTools waterfalls and Cloudflare Observatory/Lighthouse results before deciding whether a bundler or different asset strategy is justified.

## Generated Evidence

Playwright screenshots, JSON snapshots, live UI audit output, and other temporary test or audit outputs belong under the ignored repository-local `tmp/` directory. Commit durable conclusions to `NOTES.md`, `PLANS.md`, `CHANGELOG.md`, or focused docs rather than committing raw generated artifacts.
