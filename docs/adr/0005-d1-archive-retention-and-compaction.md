# ADR 0005: D1 Archive Retention And Compaction

- Status: Accepted
- Recorded: 2026-07-27

## Context

D1 was approximately 1.58 GB on 2026-07-27, below the 5 GB included-storage threshold but growing through retained feed geometry and municipal archive bins. Raw Hydro-Quebec and access-to-information inputs are preserved in R2 for provenance. Deleting those raw inputs or derived archive records without a replacement rollup would reduce reproducibility and could silently change historical claims.

## Decision

Keep raw source inputs in R2 subject to source-specific legal or retention requirements. Automatically retain only 30 days of terminal `ingestion_runs` in D1 and mark runs still `running` after three hours as `expired`.

Do not automatically delete hydro geometry, municipal archive bins, resolved events, or snapshot metadata yet. Before D1 reaches 3.5 GB, introduce a tested rollup or R2-offload migration that preserves the public one-year archive summary and records the raw-source provenance needed to reproduce it. Begin the migration before 4 GB rather than waiting for the 5 GB threshold.

## Consequences

- Operational run history remains useful without growing indefinitely.
- The ingestion scheduler repairs stranded run state on its normal cadence.
- Archive health exposes unassigned polygons separately from polygons outside all administrative territory bounding boxes.
- The current archive remains complete and reproducible while a destructive compaction design is still unproven.
- Monthly D1 measurements and the private archive-completeness report are required operational checks.

## Reconsider When

D1 reaches 3.5 GB, source retention obligations change, or a tested rollup/offload migration is available. Supersede this ADR with the selected migration and its retention guarantees before enabling archive-data deletion.
