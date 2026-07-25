# ADR 0001: Hybrid Renderer With Worker-First Durable Reads

- Status: Accepted
- Recorded: 2026-07-25
- Decision made: 2026-07-15

## Context

The application combines a Flask/Jinja browser shell with Cloudflare Workers, Containers, D1, and R2. Serving every public request through the container makes normal browsing dependent on container wakeups, while moving the actively changing browser shell wholesale to the Worker would add delivery risk and duplicate rendering work.

## Decision

Keep Flask/Jinja as the browser renderer for now. Serve durable public JSON reads and materialized runtime reads from D1/R2 through the Worker. Use runtime headers and cost-health measurements to distinguish Worker-served reads from container-served shell requests.

`PANNES_LOW_COST_MODE=1` remains an emergency guardrail that prevents container wakes; it is not an alternative browser shell.

## Consequences

- Public durable APIs can remain available when the container is disabled or unavailable.
- Browser pages, sheet fragments, autocomplete, and compatible form routes still depend on the container.
- Worker and Flask boundaries must remain explicit and covered by route and integration tests.
- A static or Worker-rendered browser shell is deferred rather than ruled out.

## Reconsider When

Production measurements show that container-rendered shell traffic is the material recurring cost, or when the browser interaction model stabilizes enough to justify moving rendering without duplicating product behavior.
