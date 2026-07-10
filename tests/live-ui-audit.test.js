import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../scripts/maintenance/live-ui-audit.mjs", import.meta.url),
  "utf8",
);

test("live UI audit targets the current sheet interface", () => {
  assert.match(source, /PANNES_AUDIT_OUTPUT_DIR \|\| "tmp\/live-ui-audit"/);
  assert.match(source, /document\.querySelector\("outage-map"\)/);
  assert.match(source, /responseUrl\.includes\("\/sheet"\)/);
  assert.match(source, /https:\/\/pannes\.ca\/\?q=/);
});

test("live UI audit does not target removed Leaflet or search-map UI", () => {
  assert.doesNotMatch(source, /leaflet/i);
  assert.doesNotMatch(source, /search-map/);
  assert.doesNotMatch(source, /sidebar/i);
});
