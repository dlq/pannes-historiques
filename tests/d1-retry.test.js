import assert from "node:assert/strict";
import test from "node:test";
import { retryD1Operation } from "../src/d1-retry.js";

test("transient D1 overload waits beyond the resource window before retrying", async () => {
  let attempts = 0;
  const delays = [];
  const result = await retryD1Operation(
    () => {
      if (++attempts < 3)
        throw new Error(
          "D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.",
        );
      return "saved";
    },
    { sleep: async (delay) => delays.push(delay) },
  );
  assert.equal(result, "saved");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [11000, 22000]);
});

test("D1 retries terminate and permanent errors propagate immediately", async () => {
  for (const [message, expected] of [
    ["D1 DB is overloaded", 4],
    ["no such table", 1],
  ]) {
    let attempts = 0;
    await assert.rejects(
      () =>
        retryD1Operation(
          () => {
            attempts++;
            throw new Error(message);
          },
          { sleep: async () => {} },
        ),
      new RegExp(message),
    );
    assert.equal(attempts, expected);
  }
});
