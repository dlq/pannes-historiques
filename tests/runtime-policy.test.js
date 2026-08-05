import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  isOperationalRequest,
  isTrustedContainerRuntimeProxyRequest,
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
  assert.equal(isOperationalRequest(request, "expected", "worker.example"), true);
  assert.equal(isOperationalRequest(request, "other", "worker.example"), false);
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

test("trusts only Cloudflare container proxy runtime requests for the configured Worker host", () => {
  const trusted = new Request("http://pannes.ca/api/durable/runtime/address", {
    method: "POST",
    headers: {
      "cf-worker": "dalaque.workers.dev",
      host: "pannes.ca",
      "user-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
    },
  });
  assert.equal(isTrustedContainerRuntimeProxyRequest(trusted, "dalaque.workers.dev"), true);

  // The container's outbound handler rewrites its own http: request to https:
  // before it reaches this gate, so https must be trusted on the same terms.
  // Requiring http: here silently rejected every proxied /map-context call and
  // left the Contexte tab empty in production. Identity rests on cf-worker,
  // which Cloudflare strips from client-supplied requests, so a public caller
  // cannot reach this branch by setting the header itself.
  const proxiedHttps = new Request("https://pannes.ca/api/durable/runtime/address", {
    method: "POST",
    headers: {
      "cf-worker": "dalaque.workers.dev",
      host: "pannes.ca",
      "user-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
    },
  });
  assert.equal(isTrustedContainerRuntimeProxyRequest(proxiedHttps, "dalaque.workers.dev"), true);

  const wrongHost = new Request("https://pannes.ca/api/durable/runtime/address", {
    method: "POST",
    headers: {
      "cf-worker": "dalaque.workers.dev",
      host: "evil.example",
      "user-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
    },
  });
  assert.equal(isTrustedContainerRuntimeProxyRequest(wrongHost, "dalaque.workers.dev"), false);

  const wrongWorker = new Request("http://pannes.ca/api/durable/runtime/address", {
    method: "POST",
    headers: {
      "cf-worker": "other.workers.dev",
      host: "pannes.ca",
      "user-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
    },
  });
  assert.equal(isTrustedContainerRuntimeProxyRequest(wrongWorker, "dalaque.workers.dev"), false);

  const customWorker = new Request("http://pannes.ca/api/durable/runtime/address", {
    method: "POST",
    headers: {
      "cf-worker": "runtime.pannes.example",
      host: "pannes.ca",
      "user-agent": "pannes-historiques/0.1 (+https://pannes.ca)",
    },
  });
  assert.equal(isTrustedContainerRuntimeProxyRequest(customWorker, "runtime.pannes.example"), true);
  assert.equal(isTrustedContainerRuntimeProxyRequest(customWorker, ""), false);
});

test("every runtime endpoint the container calls is reachable by the container", () => {
  // The container cannot authenticate to the Worker: envVars does not deliver
  // PANNES_OPERATION_TOKEN to the container process, and Cloudflare does not
  // stamp cf-worker on the internal hop. So any endpoint the container calls
  // must NOT be gated, or it silently 404s in production.
  //
  // This is the check that was missing when 34fee84 gated /map-context on
  // 2026-06-17 and left the Contexte tab empty for seven weeks. It asserts
  // reachability, not that the policy table matches itself.
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
  // Known-broken set, verified against production 2026-08-05: each returns 404
  // to the container. Unlike /map-context these degrade to the container's
  // baked SQLite fallback rather than an empty UI, which is why they went
  // unnoticed. Tracked in PLANS.md. This list is a ratchet: it must only ever
  // shrink. A NEW gated endpoint that the container calls fails this test.
  const knownBroken = [
    "operational-map-layers",
    "previous-groups",
    "previous-map-layers",
    "query-count",
    "status",
  ];
  const unexpected = gated.filter((path) => !knownBroken.includes(path));
  assert.deepEqual(
    unexpected,
    [],
    `these endpoints are called by the container but gated, so they 404 in production: ${unexpected.join(", ")}. ` +
      "Either ungate them or fix container token delivery (see PLANS.md).",
  );
  const fixed = knownBroken.filter((path) => called.has(path) && !gated.includes(path));
  assert.deepEqual(
    fixed,
    [],
    `these endpoints were fixed but are still listed as known-broken: ${fixed.join(", ")}. Remove them from knownBroken.`,
  );
});
