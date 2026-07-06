import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sheetSource = readFileSync(new URL("../app/static/sheet.js", import.meta.url), "utf8");
const detailPanelsSource = readFileSync(
  new URL("../app/static/detail-panels.js", import.meta.url),
  "utf8",
);

test("operational detail close buttons handle pointerup as well as click", () => {
  assert.match(sheetSource, /addEventListener\("click", handleDetailClose\)/);
  assert.match(sheetSource, /addEventListener\("pointerup", handleDetailClose\)/);
});

test("disclosure detail close buttons handle pointerup as well as click", () => {
  assert.match(detailPanelsSource, /addEventListener\("click", handleClose\)/);
  assert.match(detailPanelsSource, /addEventListener\("pointerup", handleClose\)/);
});
