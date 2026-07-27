export const INGESTION_RUN_RETENTION_DAYS = 30;
export const STALE_INGESTION_RUN_MINUTES = 180;

export function archiveHealthCutoffs(now = new Date()) {
  return {
    staleRunBefore: new Date(now.getTime() - STALE_INGESTION_RUN_MINUTES * 60 * 1000).toISOString(),
    retainRunsAfter: new Date(
      now.getTime() - INGESTION_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export function summarizeArchiveCompleteness({
  totalPolygons,
  polygonsWithAnyBin,
  polygonsWithPrimaryBin,
  unassignedWithTerritoryCandidate,
}) {
  const total = Number(totalPolygons || 0);
  const withAnyBin = Number(polygonsWithAnyBin || 0);
  const withPrimaryBin = Number(polygonsWithPrimaryBin || 0);
  const unassigned = Math.max(0, total - withAnyBin);
  const assignmentGaps = Math.min(unassigned, Number(unassignedWithTerritoryCandidate || 0));
  return {
    total_polygons: total,
    polygons_with_any_bin: withAnyBin,
    polygons_with_primary_bin: withPrimaryBin,
    overlap_only_polygons: Math.max(0, withAnyBin - withPrimaryBin),
    unassigned_polygons: unassigned,
    unassigned_assignment_gaps: assignmentGaps,
    unassigned_outside_or_boundary: Math.max(0, unassigned - assignmentGaps),
  };
}
