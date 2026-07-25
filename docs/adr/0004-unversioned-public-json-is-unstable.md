# ADR 0004: Unversioned Public JSON Is Unstable

- Status: Accepted
- Recorded: 2026-07-25

## Context

Several Worker-served JSON routes are publicly reachable and useful to the first-party application, but they do not yet have defined schemas, pagination, rate limits, deprecation rules, or compatibility guarantees.

## Decision

Classify unversioned public JSON routes as `unstable`. Document their reachability in [api-posture.md](../api-posture.md), but do not present them as a supported third-party API until a versioned contract is accepted.

Stable public pages and machine-readable metadata remain explicitly documented as stable. Private operational and runtime routes remain gated or blocked at the Worker edge.

## Consequences

- First-party implementation can evolve route shapes without an accidental external contract.
- Contributors must not add public API compatibility promises incidentally.
- A future stable API needs an explicit version, schema, rate-limit policy, deprecation process, and contract tests.

## Reconsider When

The project is ready to support external API consumers. Supersede this ADR with the versioned API contract and update the public posture, route documentation, and tests in the same change.
