import assert from "node:assert/strict";
import { test } from "node:test";

import { runtimeEndpointRequiresOperationToken } from "../src/runtime-policy.js";

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

test("requires operation token for runtime map and status reads", () => {
  for (const [suffix, method] of [
    ["/operational-map-layers", "GET"],
    ["/previous-map-layers", "GET"],
    ["/status", "GET"],
    ["/map-context", "GET"],
  ]) {
    assert.equal(runtimeEndpointRequiresOperationToken(suffix, method), true);
  }
});
