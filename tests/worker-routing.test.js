import assert from "node:assert/strict";
import { test } from "node:test";

import { workerRouteForPath } from "../src/worker-routing.js";

test("classifies private container paths as blocked", () => {
  for (const pathname of ["/internal/export", "/cron/hydro", "/collect", "/debug/timing"]) {
    assert.equal(workerRouteForPath(pathname), "blocked");
  }
});

test("blocks obvious scanner probes at the Worker edge", () => {
  for (const pathname of [
    "/.env",
    "/.git/config",
    "/wp-login.php",
    "/WP-ADMIN/install.php",
    "/xmlrpc.php",
    "/phpmyadmin/",
    "/cgi-bin/test.cgi",
    "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
    "/administrator/manifests/files/joomla.xml",
    "/libraries/joomla/session/session.php",
  ]) {
    assert.equal(workerRouteForPath(pathname), "blocked");
  }
});

test("classifies the private cost-health endpoint explicitly", () => {
  assert.equal(workerRouteForPath("/api/ops/cost-health"), "cost_health");
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

test("ingestion health probe is routed and left unauthenticated", () => {
  // An uptime monitor must reach it without a secret, so it must not be
  // classified as blocked or fall through to the container.
  assert.equal(workerRouteForPath("/api/health/ingestion"), "ingestion_health");
});
