import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  classifyUsageRequest,
  cleanupUsageEvidence,
  incrementDailyUsage,
  normalizeUsageEvent,
  readUsageEvidence,
  usageCollectionResponse,
  usageEvidenceResponse,
  usageRetentionCutoff,
} from "../src/usage-evidence.js";

function fakeDb(rows = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) {
          call.values = values;
          return this;
        },
        async run() {
          return { meta: { changes: 2 } };
        },
        async all() {
          return { results: rows };
        },
      };
    },
  };
}

test("usage events accept only the fixed feature/action contract", () => {
  assert.deepEqual(normalizeUsageEvent({ feature: "archive", action: "detail" }), {
    feature: "archive",
    action: "detail",
  });
  assert.deepEqual(
    normalizeUsageEvent({
      feature: "address",
      action: "answer",
      address: "must be discarded",
      visitorId: "must be discarded",
    }),
    { feature: "address", action: "answer" },
  );
  assert.equal(normalizeUsageEvent({ feature: "address", action: "open" }), null);
  assert.equal(normalizeUsageEvent({ feature: "page", action: "view" }), null);
  assert.equal(normalizeUsageEvent(null), null);
});

test("classification requires an explicit same-origin interaction and rejects obvious bots", () => {
  const human = new Request("https://pannes.ca/api/usage", {
    headers: {
      "X-Pannes-Interaction": "1",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 Safari/605.1.15",
    },
  });
  assert.equal(classifyUsageRequest(human), "human");

  for (const headers of [
    { "User-Agent": "Mozilla/5.0 Safari/605.1.15" },
    {
      "X-Pannes-Interaction": "1",
      "Sec-Fetch-Site": "cross-site",
      "User-Agent": "Mozilla/5.0 Safari/605.1.15",
    },
    {
      "X-Pannes-Interaction": "1",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Googlebot/2.1",
    },
  ]) {
    assert.equal(
      classifyUsageRequest(new Request("https://pannes.ca/api/usage", { headers })),
      "non_human",
    );
  }
});

test("daily writes increment only one classification and discard request context", async () => {
  const db = fakeDb();
  const now = new Date("2026-08-21T15:00:00.000Z");
  await incrementDailyUsage(db, { feature: "archive", action: "open" }, "human", now);

  assert.match(db.calls[0].sql, /INSERT INTO usage_collection_days/);
  assert.match(db.calls[1].sql, /ON CONFLICT \(usage_date, feature, action\) DO UPDATE/);
  assert.deepEqual(db.calls[1].values, [
    "2026-08-21",
    "archive",
    "open",
    1,
    0,
    "2026-08-21T15:00:00.000Z",
  ]);
});

test("usage evidence expires after the fixed 90-day window", async () => {
  const db = fakeDb();
  const now = new Date("2026-08-21T15:00:00.000Z");
  assert.equal(usageRetentionCutoff(now), "2026-05-23");
  assert.deepEqual(await cleanupUsageEvidence(db, now), {
    aggregate_rows_deleted: 2,
    collection_days_deleted: 2,
    retention_days: 90,
    retained_after: "2026-05-23",
  });
  assert.match(db.calls[1].sql, /DELETE FROM usage_daily_aggregates WHERE usage_date < \?/);
  assert.match(db.calls[2].sql, /DELETE FROM usage_collection_days WHERE usage_date < \?/);
  assert.deepEqual(db.calls[1].values, ["2026-05-23"]);
});

test("private readout labels counts as interactions and exposes retention status", async () => {
  const db = fakeDb([
    {
      usage_date: "2026-08-21",
      feature: "current",
      action: "open",
      human_interaction_count: 3,
      non_human_count: 2,
      collection_status: "active",
      updated_at: "2026-08-21T15:00:00.000Z",
    },
  ]);
  const report = await readUsageEvidence(db, new Date("2026-08-21T15:00:00.000Z"));

  assert.equal(report.collection_status, "active");
  assert.deepEqual(report.totals, { human_interactions: 3, non_human: 2 });
  assert.equal(report.retention.days, 90);
  assert.deepEqual(report.collection_coverage, {
    observed_days: 1,
    newest_day: "2026-08-21",
    oldest_day: "2026-08-21",
  });
  assert.match(report.metric_definitions.audience, /never people or unique visitors/);
});

test("Worker collection is write-only and the aggregate report requires authorization", async () => {
  const db = fakeDb([
    {
      usage_date: "2026-08-21",
      feature: "comparison",
      action: "add",
      human_interaction_count: 1,
      non_human_count: 0,
      collection_status: "active",
      updated_at: "2026-08-21T15:00:00.000Z",
    },
  ]);
  const collection = await usageCollectionResponse(
    new Request("https://pannes.ca/api/usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pannes-Interaction": "1",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 Safari/605.1.15",
      },
      body: JSON.stringify({ feature: "comparison", action: "add", address: "discard me" }),
    }),
    db,
    new Date("2026-08-21T15:00:00.000Z"),
  );
  assert.equal(collection.status, 204);
  assert.equal(await collection.text(), "");
  assert.deepEqual(db.calls[1].values.slice(1, 3), ["comparison", "add"]);

  const publicRead = await usageEvidenceResponse(db, { authorized: false });
  assert.equal(publicRead.status, 404);

  const privateRead = await usageEvidenceResponse(db, {
    authorized: true,
    now: new Date("2026-08-21T15:00:00.000Z"),
  });
  assert.equal(privateRead.status, 200);
  const payload = await privateRead.json();
  assert.equal(payload.rows[0].feature, "comparison");
  assert.equal(payload.rows[0].address, undefined);
});

test("Worker collection rejects unsupported methods, payload types, and oversized bodies", async () => {
  const db = fakeDb();
  const getResponse = await usageCollectionResponse(
    new Request("https://pannes.ca/api/usage"),
    db,
  );
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");

  const textResponse = await usageCollectionResponse(
    new Request("https://pannes.ca/api/usage", { method: "POST", body: "archive:open" }),
    db,
  );
  assert.equal(textResponse.status, 415);

  const oversizedResponse = await usageCollectionResponse(
    new Request("https://pannes.ca/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "archive", action: "open", padding: "x".repeat(512) }),
    }),
    db,
  );
  assert.equal(oversizedResponse.status, 413);
  assert.equal(db.calls.length, 0);
});

test("usage migration contains only aggregate fields and enforces valid pairs", async () => {
  const migration = await readFile(
    new URL("../migrations/0012_usage_evidence.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /PRIMARY KEY \(usage_date, feature, action\)/);
  assert.match(migration, /feature = 'address' AND action = 'answer'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS usage_collection_days/);
  assert.doesNotMatch(
    migration,
    /\b(address|query|coordinate|ip_address|user_agent|identifier|fingerprint)\s+TEXT\b/,
  );
});

test("Worker routes both usage endpoints without exposing the private readout", async () => {
  const workerSource = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(
    workerSource,
    /usageEvidenceResponse\(env\.DB, \{ authorized: operationalRequest\(request, env\) \}\)/,
  );
  assert.match(workerSource, /usageCollectionResponse\(request, env\.DB\)/);
});
