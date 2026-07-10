# Contributing

Thanks for considering a contribution. Small, focused changes are the easiest to review and the
best way to keep the public application reliable.

## Before you start

- Read [the architecture guide](architecture.md) to identify the runtime you are changing.
- Check the [open issues](https://github.com/dlq/pannes-historiques/issues). Issues labelled
  `good first issue` are deliberately scoped for a first contribution.
- For a larger proposal, open an issue first so the implementation direction is agreed before you
  invest time.
- Follow the [Code of Conduct](../CODE_OF_CONDUCT.md).

## Set up a local copy

You need Python 3.12 or later with [uv](https://docs.astral.sh/uv/). Node.js 22 and npm are needed
for JavaScript checks and Playwright.

```bash
git clone https://github.com/dlq/pannes-historiques.git
cd pannes-historiques
uv sync
npm install
```

Run the local app:

```bash
uv run python server.py serve
```

Open `http://127.0.0.1:8000`. A fresh SQLite database is created automatically. Address searches
can fetch the live public Hydro-Quebec feed, so tests use deterministic fixtures instead.

## Make a change

1. Fork the repository and create a branch with a descriptive name, such as
   `fix-archive-row-focus`.
2. Keep the change within one runtime boundary where practical. See “Where to make changes” below.
3. Add or update focused tests with the implementation.
4. Run the relevant checks, then open a pull request using the template.

`PLANS.md` and `NOTES.md` are maintainer records. Do not update them for an ordinary feature or
bug-fix pull request unless the change alters a documented release decision or durable technical
finding.

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
npm run test:unit
```

Browser workflows:

```bash
npx playwright install chromium
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

Do not deploy from a contribution branch. Maintainers handle production deployment and the
associated credentials.

## Where To Make Changes

- Flask route or Jinja behavior: start in `app/web.py`, `app/views.py`, and `app/templates/`.
- Browser interaction: start in `app/static/` and add Node tests under `tests/*.test.js` when possible.
- Worker routing or endpoint privacy: start in `src/worker-routing.js` and `src/runtime-policy.js`.
- D1/R2 ingestion or scheduled work: start in `src/worker.js`, then consider extracting a focused module if the change grows.
- Municipal archive geometry: start in `src/municipal-archive.js`; maintenance scripts should reuse these helpers.
- Production evidence: keep raw screenshots and JSON under the ignored repository-local `tmp/`
  directory. Summarize only durable findings that are needed by future maintainers.

Keep production runtime dependencies one-way. Flask code under `app/` should not import Worker, script, or test modules; browser modules under `app/static/` should stay within the browser module tree; Worker modules under `src/` should stay within the Worker module tree. If a helper needs to cross one of those boundaries, extract a smaller shared module deliberately and update `docs/architecture.md` plus the boundary checker in the same patch.

GitHub Quality runs formatting, linting, module-boundary checks, pytest, and Node unit tests for
pull requests and pushes to `main`. Playwright is available locally for browser-facing changes; run
the affected desktop or mobile project and describe any skipped or flaky case in the pull request.
