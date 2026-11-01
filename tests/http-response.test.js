import assert from "node:assert/strict";
import test from "node:test";
import { jsonResponse } from "../src/http-response.js";

test("Worker JSON responses preserve Unicode, status and header overrides", async () => {
  const response = jsonResponse(
    { municipality: "Montréal" },
    { status: 202, headers: { "cache-control": "private", "x-request-id": "abc" } },
  );
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "private");
  assert.equal(response.headers.get("x-pannes-runtime"), "worker-d1");
  assert.equal(response.headers.get("x-request-id"), "abc");
  assert.deepEqual(await response.json(), { municipality: "Montréal" });
  assert.equal(jsonResponse({}).headers.get("cache-control"), "no-store");
});
