# ADR 0002: D1 And R2 Are Canonical Production State

- Status: Accepted
- Recorded: 2026-07-25

## Context

The deployed container has ephemeral runtime storage and includes a baked SQLite snapshot for local-compatible paths and some disclosure/regional context. Production needs durable, independently queryable outage data and retained source artifacts.

## Decision

Use D1 for normalized, queryable production data and R2 for raw source archives. Treat the container's SQLite database as a fallback and implementation detail, never as the authoritative production store.

## Consequences

- Collection and materialization must write durable data before public paths depend on it.
- Container-local writes cannot be relied on after a restart or deployment.
- New production reads should prefer measured D1/R2 paths when they reduce hot-path container work, latency, or durability risk.
- Local development can continue to use the baked SQLite snapshot without redefining production ownership.

## Reconsider When

D1/R2 limits, cost, latency, or operational requirements make another durable store demonstrably better. Any replacement must retain the same durable/raw separation and migration evidence.
