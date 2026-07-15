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
