import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { retryD1Operation } from "../src/d1-retry.js";

const source = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
function load(name, context) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  const following = source.slice(start + 1).search(/^(?:async )?function /m);
  const declaration = source.slice(start, following < 0 ? undefined : start + 1 + following);
  return runInNewContext(`${declaration}\n${name}`, context);
}

test("changed-source ingestion records completion before a failed runtime publication", async () => {
  const calls = [];
  const errors = [];
  const run = load("runHydroSchedule", {
    recordRunStarted: async () => ({ meta: { last_row_id: 7 } }),
    currentFeedVersionMap: async () => ({}),
    callContainerJsonPost: async () => ({}),
    syncHydroFromContainerResult: async () => [{ source: "bis", changed: true }],
    runMunicipalArchiveBackfill: async (_env, options) => {
      assert.equal(options.refreshSummary, false);
      calls.push("backfill");
      return { polygons_processed: 2, summary_refreshed: false };
    },
    recordRunFinished: async (_db, id, status, summary) => {
      assert.equal(id, 7);
      assert.equal(status, "ok");
      assert.equal(summary.municipal_archive.polygons_processed, 2);
      calls.push("finished");
    },
    storeRuntimeSummary: async () => {
      calls.push("publish");
      return false;
    },
    console: { error: (...args) => errors.push(args) },
  });
  await run({ DB: {} });
  assert.deepEqual(calls, ["backfill", "finished", "publish"]);
  assert.equal(errors[0][0], "Hydro runtime summary publication failed");
});

test("maintenance preserves an Archive failure in a completed error record", async () => {
  let completed;
  const messages = [];
  const run = load("runMaintenanceSchedule", {
    recordRunStarted: async () => ({ meta: { last_row_id: 8 } }),
    cleanupIngestionRuns: async () => ({}),
    cleanupDerivedHydroFeedHistory: async () => ({}),
    runMunicipalArchiveBackfill: async () => {
      throw new Error("D1 DB is overloaded");
    },
    shouldRunDailyMaintenance: async () => false,
    reportIngestionHealth: async () => ({ healthy: true }),
    recordRunFinished: async (_db, _id, status, summary) => {
      completed = { status, summary };
    },
    storeRuntimeSummary: async () => true,
    console: { error: (...args) => messages.push(args) },
  });
  await run({ DB: {} });
  assert.equal(completed.status, "error");
  assert.equal(completed.summary.errors[0].step, "municipal_archive");
  assert.ok(messages.length > 0);
});

test("completion retries the same idempotent update after D1 overload", async () => {
  const bindings = [];
  const db = {
    prepare() {
      return {
        bind(...values) {
          bindings.push(values);
          return {
            run: async () => {
              if (bindings.length < 3) throw new Error("D1 DB is overloaded");
              return { success: true };
            },
          };
        },
      };
    },
  };
  const finish = load("recordRunFinished", {
    retryD1Operation: (operation) => retryD1Operation(operation, { sleep: async () => {} }),
  });
  await finish(db, 9, "ok", { sources: 2 });
  assert.equal(bindings.length, 3);
  assert.deepEqual(bindings[0], bindings[2]);
  assert.equal(bindings[2][3], 9);
});

test("Archive rebuild executes four paced reads instead of a concurrent query burst", async () => {
  const calls = [];
  const build = load("buildMunicipalArchiveSummary", {
    sqlTimestampHoursAgo: () => "2026-11-20",
    sqlTimestampDaysAgo: () => "2025-11-21",
    retryD1Operation: (operation) => operation(),
    municipalArchiveWindows: async () => {
      calls.push("windows");
      return [];
    },
    municipalArchiveLargest: async () => {
      calls.push("largest");
      return null;
    },
    municipalArchiveLatest: async () => {
      calls.push("latest");
      return [];
    },
    waitForD1: async (delay) => {
      assert.equal(delay, 11000);
      calls.push("cooldown");
    },
    D1_RESOURCE_COOLDOWN_MS: 11000,
    municipalArchiveTerritoryRow: (row) => row,
  });
  await build({
    prepare() {
      return {
        bind() {
          return {
            all: async () => {
              calls.push("territories");
              return { results: [] };
            },
          };
        },
      };
    },
  });
  assert.deepEqual(calls, [
    "windows",
    "cooldown",
    "largest",
    "cooldown",
    "latest",
    "cooldown",
    "territories",
  ]);
});

test("summary payload and refresh timestamp publish in one retryable batch", async () => {
  const batches = [];
  const db = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) {
      batches.push(statements);
      if (batches.length === 1) throw new Error("D1 DB is overloaded");
      return [{ success: true }, { success: true }];
    },
  };
  const publish = load("storeMunicipalArchiveSummary", {
    retryD1Operation: operation => retryD1Operation(operation, { sleep: async () => {} }),
  });
  await publish(db, { generatedAt: "2026-11-21T17:00:00Z", windows: [] }, "cursor");
  assert.equal(batches.length, 2);
  assert.equal(batches[1].length, 2);
  assert.match(batches[1][0].sql, /INSERT INTO municipal_archive_summaries/);
  assert.match(batches[1][1].sql, /municipal_archive_summary_refreshed_at/);
  assert.deepEqual(batches[0], batches[1]);
});
