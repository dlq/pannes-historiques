import assert from "node:assert/strict";
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

test("requires operation token for runtime map and status reads", () => {
  for (const [suffix, method] of [
    ["/operational-map-layers", "GET"],
    ["/previous-map-layers", "GET"],
    ["/municipal-archive/completeness", "GET"],
    ["/status", "GET"],
    ["/map-context", "GET"],
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
