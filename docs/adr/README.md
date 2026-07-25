# Architecture Decision Records

Architecture Decision Records (ADRs) preserve the reasoning for consequential, long-lived technical choices. They complement the current implementation in [architecture.md](../architecture.md), evidence in `NOTES.md`, and active work in `PLANS.md`.

Use an ADR when a decision materially constrains future design, operations, public contracts, or contributor work. Do not create one for task-level implementation details, temporary experiments, or routine dependency upgrades.

## Lifecycle

- Use a four-digit, increasing identifier and a concise lowercase filename.
- Start new records as `Proposed`; mark them `Accepted` only when the decision is made.
- Do not rewrite an accepted decision to reflect later thinking. Add a new ADR that supersedes it and link both records.
- State the context, decision, consequences, and concrete reconsideration conditions.

## Records

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-hybrid-renderer-worker-first-reads.md) | Accepted | Retain Flask/Jinja rendering while moving durable public reads to the Worker. |
| [0002](0002-d1-r2-canonical-production-state.md) | Accepted | Use D1/R2 as canonical production state; keep SQLite as a local-compatible fallback. |
| [0003](0003-preserve-raw-source-inputs.md) | Accepted | Preserve raw Hydro-Quebec and access-to-information source inputs. |
| [0004](0004-unversioned-public-json-is-unstable.md) | Accepted | Treat public JSON routes as unstable until a versioned API contract exists. |
