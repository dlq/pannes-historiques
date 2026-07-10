import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sheetSource = readFileSync(new URL("../app/static/sheet.js", import.meta.url), "utf8");
const detailPanelsSource = readFileSync(
  new URL("../app/static/detail-panels.js", import.meta.url),
  "utf8",
);
const searchSource = readFileSync(new URL("../app/static/search.js", import.meta.url), "utf8");
const overviewSource = readFileSync(
  new URL("../app/templates/_sheet_overview.html", import.meta.url),
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

test("address suggestion buttons get concise accessible names", () => {
  assert.match(searchSource, /button\.setAttribute\("aria-label", suggestionAccessibleName\(item\)\)/);
  assert.match(searchSource, /function suggestionAccessibleName\(item\)/);
  assert.match(searchSource, /secondary\.startsWith\(`\$\{primary\}, `\)/);
});

test("comparison tray explains the next compare step", () => {
  assert.match(searchSource, /addAnother/);
  assert.match(searchSource, /ph-compare-hint/);
});

test("domain links preserve an explicit or user-selected scope", () => {
  assert.match(sheetSource, /const nextScope = domainLink\.dataset\.scopeLink \|\| sheetState\.scope/);
  assert.match(
    sheetSource,
    /fetchSheet\(\{ domain: domainLink\.dataset\.domainLink, scope: nextScope \}\)/,
  );
  assert.match(overviewSource, /data-domain-link="current"\s+data-scope-link="local"/);
  assert.match(overviewSource, /data-domain-link="archive"\s+data-scope-link="local"/);
});
