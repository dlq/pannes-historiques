# ADR 0003: Preserve Raw Source Inputs

- Status: Accepted
- Recorded: 2026-07-25

## Context

Hydro-Quebec feeds and access-to-information documents can change, contain malformed records, or require interpretation. Normalized tables and browser assets alone cannot establish what was received or reproduce a parser decision.

## Decision

Archive raw Hydro-Quebec payloads and raw DAI/access-to-information files in R2 with provenance. Derive normalized tables, summaries, views, and assets from those retained inputs instead of overwriting or hand-editing the source record.

## Consequences

- Parser fixes and data-quality investigations can be replayed against the original material.
- Public claims can link to source documents and preserve disclosure limits.
- Derived-data corrections may require reprocessing, but must not silently alter retained raw evidence.
- Ingestion code needs to preserve provenance metadata alongside the archive.

## Reconsider When

A source license, privacy requirement, or retention obligation requires a different archive policy. Any exception must document the source, legal or operational reason, retention period, and resulting reproducibility limit.
