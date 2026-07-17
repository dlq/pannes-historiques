# Contributor Issue Map

Use this map to choose a bounded first contribution. Each item has a clear owner module, test command,
and review boundary. Do not combine items unless a maintainer agrees that the shared contract needs to
change.

## Good First Issues

- [#1: Document the public Worker route boundary](https://github.com/dlq/pannes-historiques/issues/1)
- [#2: Cover container proxy error propagation](https://github.com/dlq/pannes-historiques/issues/2)
- [#10: Cover the durable history nearby response](https://github.com/dlq/pannes-historiques/issues/10)
- [#11: Add Hydro feed parser fixtures](https://github.com/dlq/pannes-historiques/issues/11)
- [#12: Add a disclosure parser fixture](https://github.com/dlq/pannes-historiques/issues/12)

### Durable History Read Contract

- Scope: add direct Node tests for `durableHistoryNearbyResponse` in
  `src/durable-read-handlers.js`.
- Prove: invalid coordinates do not query D1; the response clamps query parameters, sorts by most
  recent event then distance, and excludes non-public fields.
- Verify: `npm run test:unit` and `npm run check`.
- Avoid: changing Worker routing, D1 schema, or public response fields.

### Hydro Feed Parser Fixtures

- Scope: add small representative fixtures and focused tests for currently untested Hydro feed
  variants in `app/hydro.py`.
- Prove: version extraction and normalized records preserve source identifiers and reject malformed
  payloads safely.
- Verify: `uv run pytest -q tests/test_hydro.py --cov=app.hydro`.
- Avoid: live-network tests and broad collector refactors.

### Disclosure Parser Fixtures

- Scope: add one isolated fixture-driven parser test for an uncovered XLSX or PDF disclosure path in
  `app/disclosures.py`.
- Prove: the normalized record keeps its source reference and malformed rows are skipped or reported
  consistently with the existing parser contract.
- Verify: `uv run pytest -q tests/test_disclosures.py --cov=app.disclosures`.
- Avoid: changes to raw-source retention or regional analytics semantics.

## Maintainer Notes

- Check the [open issues](https://github.com/dlq/pannes-historiques/issues) before starting. This
  document records intended scope; GitHub issues remain the assignment and discussion source.
- Label these tasks `good first issue` and `tests` when they are opened or refreshed.
- Keep generated fixtures compact and free of real searched addresses, credentials, and operation
  tokens.
