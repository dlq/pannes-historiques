# Codex Collaboration

- When starting new implementation work in this project, prefer using a dedicated Git worktree and branch for each separate Codex chat or parallel task.
- Keep one active coding task per worktree. Do not make unrelated edits in another chat's worktree.
- Read-only investigation, short questions, and reviews can use the existing checkout when no file edits are needed.
- Before editing files, check `git status --short` and preserve unrelated user or chat changes.

## Project Notes

- For debugging or ambiguous technical decisions, separate observed facts, inferences, assumptions, and next verification steps before making changes.
- Use `research.md` for durable findings: observed facts, evidence, source URLs, commands run, open questions, and conclusions that should survive chat context loss.
- Use `plan.md` for durable execution state: current goal, task checklist, decisions, risks, and next steps.
- Update these files only when the durable findings, task list, decision, or next step changes. Do not add conversational notes or duplicate the final response.

## Verification

- Before handing off code changes, run the relevant formatter/linter checks for touched files and report what ran.
- Python: `uv run ruff check . --fix` and `uv run ruff format .`.
- Templates: `uv run djlint app/templates --reformat` and `uv run djlint app/templates --lint`.
- Static JS/CSS assets: `npm run format` and `npm run check`.
- Prefer `uv run pre-commit run --all-files` when changes span multiple file types.

## Data And Runtime

- Preserve raw source data and provenance. Prefer deriving new tables, views, or assets from archived raw inputs instead of overwriting or hand-editing source data.
- Local app command: `uv run python server.py serve`.
- Production currently runs on Cloudflare Workers + Containers with a baked-in SQLite snapshot. Runtime writes inside the container are ephemeral and are not durable production storage.
- Treat the embedded SQLite production model as a current implementation detail, not a settled architecture. Cloudflare performance may require moving production data to D1 or another durable store.
- Collection, geocoding, and disclosure discovery may require network access. If a network command fails in the sandbox, report that clearly and request escalation when needed.

## Deployment

- Do not deploy to production unless explicitly asked.
- For deployment-related changes, prefer `npx wrangler deploy --dry-run` before any real deploy.

## What Belongs Here

- Put standing project instructions in this file: workflow preferences, repo-specific commands, architecture constraints, testing expectations, deployment rules, and collaboration boundaries.
- Do not put one-off task details, temporary debugging notes, secrets, credentials, or long research logs in this file.
