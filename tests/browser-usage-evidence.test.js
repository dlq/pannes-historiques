import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { recordUsage } from "../app/static/usage-evidence.js";

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
});

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
}

test("browser usage request sends only the allowlisted pair without credentials or referrer", async () => {
  setNavigator({ doNotTrack: "0", globalPrivacyControl: false });
  let captured;
  globalThis.fetch = async (...args) => {
    captured = args;
    return new Response(null, { status: 204 });
  };

  assert.equal(await recordUsage("address", "answer"), true);
  assert.equal(captured[0], "/api/usage");
  assert.deepEqual(JSON.parse(captured[1].body), { feature: "address", action: "answer" });
  assert.equal(captured[1].credentials, "omit");
  assert.equal(captured[1].referrerPolicy, "no-referrer");
  assert.equal(captured[1].headers["X-Pannes-Interaction"], "1");
});

test("browser usage collection respects GPC and DNT and rejects unknown actions", async () => {
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(null, { status: 204 });
  };

  setNavigator({ doNotTrack: "0", globalPrivacyControl: true });
  assert.equal(await recordUsage("archive", "open"), false);
  setNavigator({ doNotTrack: "1", globalPrivacyControl: false });
  assert.equal(await recordUsage("archive", "open"), false);
  setNavigator({ doNotTrack: "0", globalPrivacyControl: false });
  assert.equal(await recordUsage("address", "open"), false);
  assert.equal(fetches, 0);
});
