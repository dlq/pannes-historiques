import assert from "node:assert/strict";
import { test } from "node:test";

import {
  durableHistoryNearbyResponse,
  durableNearbyResponse,
} from "../src/durable-read-handlers.js";

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

test("durable history nearby response validates coordinates before querying D1", async () => {
  let prepared = false;
  const response = await durableHistoryNearbyResponse(
    new Request("https://pannes.ca/api/durable/history-nearby?lat=bad&lon=-73.6"),
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

test("durable history nearby response clamps input and returns public newest-first rows", async () => {
  const bindings = [];
  const rows = {
    results: [
      {
        event_key: "same-time-far",
        centroid_lat: 45.5008,
        centroid_lon: -73.6008,
        customers_max: 20,
        customers_min: 10,
        record_count: 2,
        start_time: "2026-07-17 10:00:00",
        end_time: null,
        interruption_type: "A",
        status: "N",
        municipality_code: "66023",
        source_versions: "bis-1",
        first_seen_at: "2026-07-17 10:00:00",
        last_seen_at: "2026-07-17 10:05:00",
        updated_at: "2026-07-17 10:05:00",
        raw_record_json: '{"private":"source record"}',
      },
      {
        event_key: "same-time-near",
        centroid_lat: 45.5001,
        centroid_lon: -73.6001,
        customers_max: 15,
        customers_min: 15,
        record_count: 1,
        start_time: "2026-07-17 10:00:00",
        end_time: null,
        interruption_type: "A",
        status: "N",
        municipality_code: "66023",
        source_versions: "bis-1",
        first_seen_at: "2026-07-17 10:00:00",
        last_seen_at: "2026-07-17 10:00:00",
        updated_at: "2026-07-17 10:00:00",
        raw_record_json: '{"private":"source record"}',
      },
      {
        event_key: "older",
        centroid_lat: 45.5002,
        centroid_lon: -73.6002,
        customers_max: 5,
        customers_min: 5,
        record_count: 1,
        start_time: "2026-07-16 10:00:00",
        end_time: null,
        interruption_type: "A",
        status: "N",
        municipality_code: "66023",
        source_versions: "bis-1",
        first_seen_at: "2026-07-16 10:00:00",
        last_seen_at: "2026-07-16 10:00:00",
        updated_at: "2026-07-16 10:00:00",
        raw_record_json: '{"private":"source record"}',
      },
    ],
  };
  const db = {
    prepare(sql) {
      assert.match(sql, /FROM resolved_events/);
      return {
        bind(...values) {
          bindings.push(values);
          return this;
        },
        all: async () => rows,
      };
    },
  };

  const response = await durableHistoryNearbyResponse(
    new Request(
      "https://pannes.ca/api/durable/history-nearby?lat=45.5&lon=-73.6&radius_m=999999&days=99999&limit=99999",
    ),
    { DB: db },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.query, {
    latitude: 45.5,
    longitude: -73.6,
    radius_m: 50000,
    days: 3650,
    limit: 1000,
  });
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].length, 5);
  assert.deepEqual(
    payload.items.map((item) => item.event_key),
    ["same-time-near", "same-time-far", "older"],
  );
  assert.equal(payload.items[0].raw_record_json, undefined);
  assert.equal(payload.items[0].private, undefined);
});

test("durable history nearby response applies lower parameter bounds", async () => {
  const response = await durableHistoryNearbyResponse(
    new Request(
      "https://pannes.ca/api/durable/history-nearby?lat=45.5&lon=-73.6&radius_m=1&days=0&limit=0",
    ),
    {
      DB: {
        prepare() {
          return statement({ results: [] });
        },
      },
    },
  );

  const payload = await response.json();
  assert.deepEqual(payload.query, {
    latitude: 45.5,
    longitude: -73.6,
    radius_m: 100,
    days: 1,
    limit: 1,
  });
});
