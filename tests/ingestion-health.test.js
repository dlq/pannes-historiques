import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countConsecutiveFailures,
  evaluateIngestionHealth,
  INGESTION_STALE_AFTER_MINUTES,
} from "../src/ingestion-health.js";

const NOW = Date.parse("2026-07-20T20:00:00Z");
const minutesAgo = (n) => new Date(NOW - n * 60000).toISOString();

test("fresh snapshots with successful runs are healthy", () => {
  const health = evaluateIngestionHealth({
    newestSnapshot: minutesAgo(20),
    lastSuccessfulRun: minutesAgo(20),
    recentStatuses: ["ok", "ok", "ok"],
    now: NOW,
  });
  assert.equal(health.healthy, true);
  assert.deepEqual(health.problems, []);
  assert.equal(health.snapshot_age_minutes, 20);
});

test("the five-day production stall is reported unhealthy", () => {
  // The real incident: cron fired every 30 minutes and failed every time, so
  // snapshots froze while the site kept serving 200s.
  const health = evaluateIngestionHealth({
    newestSnapshot: minutesAgo(5 * 24 * 60),
    lastSuccessfulRun: minutesAgo(5 * 24 * 60),
    recentStatuses: Array(10).fill("error"),
    now: NOW,
  });
  assert.equal(health.healthy, false);
  assert.equal(health.consecutive_failures, 10);
  assert.equal(health.problems.length, 2, "should report both staleness and the failure streak");
});

test("a single failed run is treated as noise, not an incident", () => {
  const health = evaluateIngestionHealth({
    newestSnapshot: minutesAgo(35),
    lastSuccessfulRun: minutesAgo(35),
    recentStatuses: ["error", "ok", "ok"],
    now: NOW,
  });
  assert.equal(health.healthy, true, "one transient failure must not page anyone");
  assert.equal(health.consecutive_failures, 1);
});

test("a sustained failure streak is unhealthy even while data is still fresh", () => {
  // Catches a stall early -- before staleness has had time to accumulate.
  const health = evaluateIngestionHealth({
    newestSnapshot: minutesAgo(10),
    lastSuccessfulRun: minutesAgo(10),
    recentStatuses: ["error", "error", "error", "ok"],
    now: NOW,
  });
  assert.equal(health.healthy, false);
  assert.match(health.problems.join(" "), /consecutive failed/);
});

test("staleness alone is unhealthy even when runs report ok", () => {
  // Guards the subtler case: runs "succeed" but stop producing new data.
  const health = evaluateIngestionHealth({
    newestSnapshot: minutesAgo(INGESTION_STALE_AFTER_MINUTES + 1),
    lastSuccessfulRun: minutesAgo(1),
    recentStatuses: ["ok", "ok"],
    now: NOW,
  });
  assert.equal(health.healthy, false);
  assert.match(health.problems.join(" "), /minutes old/);
});

test("a missing snapshot is unhealthy rather than silently passing", () => {
  const health = evaluateIngestionHealth({ newestSnapshot: null, recentStatuses: [], now: NOW });
  assert.equal(health.healthy, false);
  assert.equal(health.snapshot_age_minutes, null);
  assert.match(health.problems.join(" "), /no retained Hydro snapshot/);
});

test("consecutive failures count only the current streak", () => {
  assert.equal(countConsecutiveFailures(["error", "error", "ok", "error"]), 2);
  assert.equal(countConsecutiveFailures(["ok", "error"]), 0);
  assert.equal(countConsecutiveFailures([]), 0);
});
