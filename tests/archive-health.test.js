import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  archiveHealthCutoffs,
  summarizeArchiveCompleteness,
} from "../src/archive-health.js";

test("archive health uses bounded run-history retention and stale-run expiry", () => {
  const cutoffs = archiveHealthCutoffs(new Date("2026-07-27T16:00:00.000Z"));

  assert.equal(cutoffs.staleRunBefore, "2026-07-27T13:00:00.000Z");
  assert.equal(cutoffs.retainRunsAfter, "2026-06-27T16:00:00.000Z");
});

test("archive completeness separates expected boundary cases from assignment gaps", () => {
  assert.deepEqual(
    summarizeArchiveCompleteness({
      totalPolygons: 203298,
      polygonsWithAnyBin: 203084,
      polygonsWithPrimaryBin: 202351,
      unassignedWithTerritoryCandidate: 214,
    }),
    {
      total_polygons: 203298,
      polygons_with_any_bin: 203084,
      polygons_with_primary_bin: 202351,
      overlap_only_polygons: 733,
      unassigned_polygons: 214,
      unassigned_assignment_gaps: 214,
      unassigned_outside_or_boundary: 0,
    },
  );
});

test("Worker cleanup retains only terminal history and archive latest groups territory timestamps", async () => {
  const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

  assert.match(
    worker,
    /UPDATE ingestion_runs\s+SET status = 'expired', finished_at = \?\s+WHERE status = 'running' AND started_at < \?/,
  );
  assert.match(
    worker,
    /DELETE FROM ingestion_runs\s+WHERE started_at < \? AND status IN \('ok', 'error', 'expired'\)/,
  );
  assert.match(worker, /DELETE FROM runtime_geocode_cache WHERE updated_at < \?/);
  assert.match(
    worker,
    /ROW_NUMBER\(\) OVER \(\s+PARTITION BY territory_id, COALESCE\(latest_start_time, last_seen_at, updated_at, ''\)/,
  );
  assert.match(worker, /WHERE duplicate_rank = 1/);
});

test("archive health migration indexes its scheduled cleanup and primary-bin queries", async () => {
  const migration = await readFile(
    new URL("../migrations/0011_archive_health_indexes.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /idx_ingestion_runs_status_started/);
  assert.match(migration, /idx_previous_outage_territory_bins_assignment_polygon/);
});
