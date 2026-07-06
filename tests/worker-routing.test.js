import assert from "node:assert/strict";
import { test } from "node:test";

import { workerRouteForPath } from "../src/worker-routing.js";

test("classifies private container paths as blocked", () => {
  for (const pathname of ["/internal/export", "/cron/hydro", "/collect", "/debug/timing"]) {
    assert.equal(workerRouteForPath(pathname), "blocked");
  }
});

test("classifies durable public and runtime endpoints explicitly", () => {
  assert.equal(workerRouteForPath("/api/durable/hydro"), "durable_hydro");
  assert.equal(workerRouteForPath("/api/durable/status"), "durable_status");
  assert.equal(workerRouteForPath("/api/durable/nearby"), "durable_nearby");
  assert.equal(workerRouteForPath("/api/durable/history-nearby"), "durable_history_nearby");
  assert.equal(workerRouteForPath("/api/durable/runtime/status"), "durable_runtime");
});

test("falls back to the container for app routes", () => {
  assert.equal(workerRouteForPath("/"), "container");
  assert.equal(workerRouteForPath("/sheet"), "container");
  assert.equal(workerRouteForPath("/about"), "container");
});
