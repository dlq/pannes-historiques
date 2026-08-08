# ADR 0006: Use Regional Components, Not A Hydro Score

- Status: Accepted
- Recorded: 2026-08-08

## Context

The proposed "Hydro Score" would reduce outage reliability to a simple numeric or categorical rating. The available inputs do not support that claim at the geography users are most likely to interpret it.

Hydro-Quebec publishes a gross continuity index normalized as interruption minutes per customer, but only as an annual administrative-region aggregate. The pannes.ca archive is geographically finer, but on 2026-08-08 it covered only 88 days, had primary observations in 1,143 of 1,341 territories, and had no customer or service-point denominator by territory. Raw retained-event counts therefore mix outage incidence, population, collection coverage, and network geography. Annual regional results are also volatile: adjacent-year rank correlations for the published continuity index ranged from 0.08 to 0.66 over 2019-2025.

## Decision

Do not publish a composite numeric or categorical Hydro Score.

Present source metrics as separate components at their supported granularity:

- Regional context may show Hydro-Quebec's named annual continuity index, outage count, average duration, and long-outage count with the source and period visible.
- Local and address views may show only retained pannes.ca observations, their radius, and explicit archive-coverage caveats. They must not grade, rank, or certify an address or municipality.
- Coverage indicators describe evidence quality. They must never contribute positively or negatively to a reliability rating.

The map may color administrative regions by the published continuity index because it is already normalized per customer. Municipal archive geometry remains unshaded until a defensible denominator and coverage model exist.

## Consequences

- Users see auditable source values instead of false precision.
- Regional and local evidence cannot be compared as though they measure the same thing.
- A product-friendly score is deferred, not treated as an assumed roadmap destination.
- Interface wording must use "continuity index" and "local outage observations," not an unlabeled burden, stability, or score claim.

## Reconsider When

Reconsider a composite only when all of these conditions hold:

1. A customer or service-point denominator exists at the same municipal or territory granularity, with stable mappings and provenance.
2. The archive has at least 12 complete consecutive months of measured collection coverage; 24-36 months is preferred for a comparative score.
3. Major-event, weather, planned-interruption, and year-to-year variability treatments are defined in advance.
4. The result is validated against an external normalized metric and exposes uncertainty and missing coverage.
5. Product wording and tests prevent region-level evidence from becoming an address-level claim.

If these gates are met, supersede this ADR with the score formula, validation evidence, disclosure contract, and failure behavior.
