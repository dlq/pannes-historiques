import assert from "node:assert/strict";
import test from "node:test";

import { fetchContainerRequest } from "../src/container-proxy.js";

test("proxies a container response and exposes timing and runtime markers", async () => {
  const names = [];
  const requests = [];
  const env = {
    PANNES_CONTAINER: {
      getByName(name) {
        names.push(name);
        return {
          async fetch(request) {
            requests.push(request);
            return new Response("container response", {
              status: 201,
              headers: { "X-Container": "yes" },
            });
          },
        };
      },
    },
  };
  const request = new Request("https://pannes.ca/about", { headers: { "cf-ray": "abc" } });
  const originalLog = console.log;
  console.log = () => {};

  try {
    const response = await fetchContainerRequest(request, env, "web");
    assert.deepEqual(names, ["web"]);
    assert.deepEqual(requests, [request]);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("X-Container"), "yes");
    assert.match(response.headers.get("X-Pannes-Worker-Container-Fetch-Ms"), /^\d+$/);
    assert.equal(response.headers.get("X-Pannes-Runtime"), "container");
    assert.match(response.headers.get("Server-Timing"), /worker-container;dur=\d+/);
    assert.equal(await response.text(), "container response");
  } finally {
    console.log = originalLog;
  }
});

test("propagates a rejected container fetch", async () => {
  const error = new Error("container unavailable");
  const env = {
    PANNES_CONTAINER: {
      getByName() {
        return { fetch: async () => Promise.reject(error) };
      },
    },
  };

  await assert.rejects(
    fetchContainerRequest(new Request("https://pannes.ca/about"), env),
    /container unavailable/,
  );
});

test("preserves failed container responses while adding observability headers", async () => {
  const env = {
    PANNES_CONTAINER: {
      getByName() {
        return {
          async fetch() {
            return new Response("upstream failed", {
              status: 502,
              statusText: "Bad Gateway",
              headers: {
                "content-type": "text/plain",
                "server-timing": "origin;dur=7",
                "x-container": "failure",
              },
            });
          },
        };
      },
    },
  };
  const originalLog = console.log;
  console.log = () => {};

  try {
    const response = await fetchContainerRequest(new Request("https://pannes.ca/about"), env);
    assert.equal(response.status, 502);
    assert.equal(response.statusText, "Bad Gateway");
    assert.equal(response.headers.get("content-type"), "text/plain");
    assert.equal(response.headers.get("x-container"), "failure");
    assert.match(response.headers.get("server-timing"), /origin;dur=7/);
    assert.match(response.headers.get("server-timing"), /worker-container;dur=\d+/);
    assert.match(response.headers.get("x-pannes-worker-container-fetch-ms"), /^\d+$/);
    assert.equal(response.headers.get("x-pannes-runtime"), "container");
    assert.equal(await response.text(), "upstream failed");
  } finally {
    console.log = originalLog;
  }
});
