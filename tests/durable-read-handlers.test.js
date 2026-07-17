import assert from "node:assert/strict";
import { test } from "node:test";

import { durableNearbyResponse } from "../src/durable-read-handlers.js";

function statement(result) {
  return {
    all: async () => result,
    bind() {
      return this;
    },
  };
}

test("durable nearby response validates coordinates before querying D1", async () => {
  let prepared = false;
  const response = await durableNearbyResponse(
    new Request("https://pannes.ca/api/durable/nearby?lat=not-a-number&lon=-73.6"),
    {
      DB: {
        prepare() {
          prepared = true;
          throw new Error("D1 should not be queried for invalid coordinates");
        },
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(prepared, false);
  assert.deepEqual(await response.json(), {
    error: "lat and lon query parameters are required",
  });
});

test("durable nearby response returns a bounded, distance-sorted public payload", async () => {
  const versions = { results: [{ source: "bis", version: "bis-1" }] };
  const outageRows = {
    results: [
      {
        id: 1,
        source_version: "bis-1",
        centroid_lat: 45.5005,
        centroid_lon: -73.6005,
        customers_affected: 10,
        outage_start_time: "2026-07-17 10:00:00",
        estimated_restore_time: null,
        interruption_type: "A",
        status: "N",
        municipality_code: "66023",
        updated_at: "2026-07-17 10:00:00",
        raw_record_json: "{}",
      },
    ],
  };
  const empty = { results: [] };
  const db = {
    prepare(sql) {
      if (sql === "SELECT * FROM feed_versions") return statement(versions);
      if (sql.includes("current_outage_records")) return statement(outageRows);
      if (sql.includes("current_planned_interruptions")) return statement(empty);
      throw new Error(`unexpected query: ${sql}`);
    },
  };

  const response = await durableNearbyResponse(
    new Request("https://pannes.ca/api/durable/nearby?lat=45.5&lon=-73.6&radius_m=500&limit=1"),
    { DB: db },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.query, { latitude: 45.5, longitude: -73.6, radius_m: 500, limit: 1 });
  assert.equal(payload.count, 1);
  assert.equal(payload.items[0].kind, "outage");
  assert.equal(payload.items[0].raw_record, undefined);
  assert.ok(payload.items[0].distance_m < 100);
});
