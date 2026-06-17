import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../scripts/maintenance/municipal-archive-backfill.mjs", import.meta.url),
  "utf8",
);

test("maintenance territory import never substitutes display geometry for raw geometry", () => {
  assert.doesNotMatch(source, /sql\(displayGeometryJson,\s*displayGeometryJson\)/);
});

test("maintenance territory import never substitutes bbox geometry for raw geometry", () => {
  assert.doesNotMatch(source, /sql\(bboxJson,\s*bboxJson\)/);
});
