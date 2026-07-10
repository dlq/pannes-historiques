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
- Do not use the `codex/` branch prefix for new branches unless that is explicitly requested; prefer short task names.
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

Browser workflows:

```bash
npm run test:e2e
```

Full local pre-commit check:

```bash
uv run pre-commit run --all-files
```

Module-boundary check:

```bash
uv run python scripts/check_module_boundaries.py
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
- Production evidence: summarize in `NOTES.md` or `PLANS.md`; keep raw screenshots and JSON under the ignored repository-local `tmp/` directory.

Keep production runtime dependencies one-way. Flask code under `app/` should not import Worker, script, or test modules; browser modules under `app/static/` should stay within the browser module tree; Worker modules under `src/` should stay within the Worker module tree. If a helper needs to cross one of those boundaries, extract a smaller shared module deliberately and update `docs/architecture.md` plus the boundary checker in the same patch.

GitHub's current Quality workflow runs pre-commit formatting, linting, and module-boundary checks. It does not yet run pytest, Node tests, Playwright, or enforce a coverage threshold; closing that gap is planned for `v0.4.3`. Until then, run the relevant test suites locally before pushing and report any skipped or flaky browser case.
