# Contributing

This repo is easiest to work on when changes stay small and tied to one runtime boundary.

## Setup

```bash
uv sync
npm install
```

Run the local app:

```bash
uv run python server.py serve
```

## Before Editing

- Check `git status --short`.
- Use a dedicated worktree/branch for implementation work.
- Keep durable technical findings in `NOTES.md`.
- Keep execution state, release decisions, and next steps in `PLANS.md`.

## Common Verification

Python:

```bash
uv run ruff check . --fix
uv run ruff format .
uv run pytest -q
```

Templates:

```bash
uv run djlint app/templates --reformat
uv run djlint app/templates --lint
```

Static JavaScript/CSS:

```bash
npm run format
npm run check
node --test tests/*.test.js
```

Full local pre-commit check:

```bash
uv run pre-commit run --all-files
```

Deployment validation, without deploying:

```bash
npx wrangler deploy --dry-run
```

## Where To Make Changes

- Flask route or Jinja behavior: start in `app/web.py`, `app/views.py`, and `app/templates/`.
- Browser interaction: start in `app/static/` and add Node tests under `tests/*.test.js` when possible.
- Worker routing or endpoint privacy: start in `src/worker-routing.js` and `src/runtime-policy.js`.
- D1/R2 ingestion or scheduled work: start in `src/worker.js`, then consider extracting a focused module if the change grows.
- Municipal archive geometry: start in `src/municipal-archive.js`; maintenance scripts should reuse these helpers.
- Production evidence: summarize in `NOTES.md` or `PLANS.md`; keep raw screenshots and JSON under ignored `output/`.
