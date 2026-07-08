import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sheetSource = readFileSync(new URL("../app/static/sheet.js", import.meta.url), "utf8");
const detailPanelsSource = readFileSync(
  new URL("../app/static/detail-panels.js", import.meta.url),
  "utf8",
);
const searchSource = readFileSync(new URL("../app/static/search.js", import.meta.url), "utf8");
const sheetSourceForScope = readFileSync(new URL("../app/static/sheet.js", import.meta.url), "utf8");

test("operational detail close buttons handle pointerup as well as click", () => {
  assert.match(sheetSource, /addEventListener\("click", handleDetailClose\)/);
  assert.match(sheetSource, /addEventListener\("pointerup", handleDetailClose\)/);
});

test("disclosure detail close buttons handle pointerup as well as click", () => {
  assert.match(detailPanelsSource, /addEventListener\("click", handleClose\)/);
  assert.match(detailPanelsSource, /addEventListener\("pointerup", handleClose\)/);
});

test("address suggestion buttons get concise accessible names", () => {
  assert.match(searchSource, /button\.setAttribute\("aria-label", suggestionAccessibleName\(item\)\)/);
  assert.match(searchSource, /function suggestionAccessibleName\(item\)/);
  assert.match(searchSource, /secondary\.startsWith\(`\$\{primary\}, `\)/);
});

test("comparison tray explains the next compare step", () => {
  assert.match(searchSource, /addAnother/);
  assert.match(searchSource, /ph-compare-hint/);
});

test("address domain links keep local scope by default", () => {
  assert.match(sheetSourceForScope, /const nextScope = domainLink\.dataset\.scopeLink \|\| \(hasAddress\(\) \? "local" : sheetState\.scope\)/);
  assert.match(sheetSourceForScope, /fetchSheet\(\{ domain: domainLink\.dataset\.domainLink, scope: nextScope \}\)/);
});
