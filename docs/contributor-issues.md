# Contributor Issue Map

Last checked: 2026-11-01. This is a scope/history map, not a live list of available assignments.
Check the repository's [open issues](https://github.com/dlq/pannes-historiques/issues) before starting.

## Completed First-Contribution Issues

The five previously advertised starter issues are closed on GitHub:

- [#1: Public Worker route boundary](https://github.com/dlq/pannes-historiques/issues/1): documented in [architecture](architecture.md) and [API posture](api-posture.md).
- [#2: Container proxy error propagation](https://github.com/dlq/pannes-historiques/issues/2): focused Node regression coverage in `tests/container-proxy.test.js`.
- [#10: Durable history nearby response](https://github.com/dlq/pannes-historiques/issues/10): focused coverage in `tests/durable-read-handlers.test.js`.
- [#11: Hydro feed parser fixtures](https://github.com/dlq/pannes-historiques/issues/11): `tests/test_hydro.py`.
- [#12: Disclosure parser fixture](https://github.com/dlq/pannes-historiques/issues/12): `tests/test_disclosures.py`.

## Choosing New Work

Use [PLANS.md](../PLANS.md) and the [maintenance backlog](maintenance-backlog.md) for candidate work,
then agree on one concrete issue before treating it as available. Do not re-advertise completed
issues or infer an assignment from this document. Storage, provider integration and notifications
have explicit preservation/source/privacy gates in `docs/plans/` and are not starter fixes.

For new parser fixtures, retain source provenance, keep samples compact and preserve malformed-input
behavior. Use deterministic local fixtures; never commit private addresses, credentials or tokens.
Follow the [contribution checks](contributing.md), keeping runtime boundaries intact.
