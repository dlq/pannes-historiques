import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  isOperationalRequest,
  runtimeEndpointRequiresOperationToken,
} from "../src/runtime-policy.js";

test("requires operation token for durable runtime write endpoints", () => {
  for (const [suffix, method] of [
    ["/geocode-cache", "POST"],
    ["/address", "POST"],
    ["/query", "POST"],
    ["/matches", "POST"],
  ]) {
    assert.equal(runtimeEndpointRequiresOperationToken(suffix, method), true);
  }
});

test("authorizes private operations with the configured token", () => {
  const request = new Request("https://pannes.ca/api/ops/cost-health", {
    headers: { "X-Pannes-Operation-Token": "expected" },
  });
  assert.equal(isOperationalRequest(request, "expected"), true);
  assert.equal(isOperationalRequest(request, "other"), false);
});

test("requires operation token for address-scoped durable runtime reads", () => {
  for (const [suffix, method] of [
    ["/query-count", "GET"],
    ["/previous-groups", "GET"],
  ]) {
    assert.equal(runtimeEndpointRequiresOperationToken(suffix, method), true);
  }
});

test("allows public access to the materialized previous archive summary", () => {
  assert.equal(runtimeEndpointRequiresOperationToken("/previous-archive-summary", "GET"), false);
});

test("allows public access to published map context", () => {
  // map-context returns only published access-to-information material. Gating
  // it broke the Contexte tab, because the container reaches the Worker with
  // neither a usable operation token nor a cf-worker header.
  assert.equal(runtimeEndpointRequiresOperationToken("/map-context", "GET"), false);
});

test("requires operation token for runtime map and status reads", () => {
  for (const [suffix, method] of [
    ["/operational-map-layers", "GET"],
    ["/previous-map-layers", "GET"],
    ["/municipal-archive/completeness", "GET"],
    ["/status", "GET"],
  ]) {
    assert.equal(runtimeEndpointRequiresOperationToken(suffix, method), true);
  }
});

test("the container calls only public runtime reads", () => {
  const servicesSource = readFileSync(
    new URL("../app/services.py", import.meta.url),
    "utf8",
  );
  const called = new Set(
    [...servicesSource.matchAll(/_durable_runtime_get\(\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  assert.ok(called.size > 0, "expected to find durable runtime calls in services.py");

  const gated = [...called].filter((path) =>
    runtimeEndpointRequiresOperationToken(`/${path.replace(/^\//, "")}`, "GET"),
  );
  assert.deepEqual([...called].sort(), ["map-context", "previous-archive-summary"]);
  assert.deepEqual(gated, []);
});
