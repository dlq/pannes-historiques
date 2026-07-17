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
const indexSource = readFileSync(new URL("../app/templates/index.html", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../app/static/app.css", import.meta.url), "utf8");

test("detail close buttons are handled during capture for pointerup and click", () => {
  assert.match(
    sheetSource,
    /document\.addEventListener\("click", handleDetailClose, closeGestureOptions\)/,
  );
  assert.match(
    sheetSource,
    /document\.addEventListener\("pointerup", handleDetailClose, closeGestureOptions\)/,
  );
  assert.match(sheetSource, /event\.stopImmediatePropagation\(\)/);
});

test("operational detail close buttons suppress mobile ghost row clicks", () => {
  assert.match(sheetSource, /document\.addEventListener\("pointerdown", markCloseGestureStart/);
  assert.match(sheetSource, /document\.addEventListener\("mousedown", markCloseGestureStart/);
  assert.match(sheetSource, /document\.addEventListener\("touchstart", markCloseGestureStart/);
  assert.match(
    sheetSource,
    /closeGestureStartedOnClose = Boolean\(\s*event\.target\.closest\("\[data-detail-close\], \[data-dai-detail-close\]"\)/,
  );
  assert.match(sheetSource, /closeGestureStartedOnClose = true/);
  assert.match(sheetSource, /const skipGhost = closeGestureStartedOnClose/);
  assert.match(sheetSource, /if \(skipGhost\) return/);
});

test("disclosure detail close buttons use the shared sheet close lifecycle", () => {
  assert.doesNotMatch(detailPanelsSource, /addEventListener\(/);
  assert.match(sheetSource, /\[data-detail-close\], \[data-dai-detail-close\]/);
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
    /fetchSheet\(\s*\{ domain: domainLink\.dataset\.domainLink, scope: nextScope \},\s*\{ focus: "domain" \}\s*\)/,
  );
  assert.match(overviewSource, /data-domain-link="current"\s+data-scope-link="local"/);
  assert.match(overviewSource, /data-domain-link="archive"\s+data-scope-link="local"/);
});

test("dynamic sheet updates expose busy state, an announcement, and a focus target", () => {
  assert.match(
    indexSource,
    /id="sheet-status"[\s\S]*class="sr-only"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/,
  );
  assert.match(sheetSource, /body\.setAttribute\("aria-busy", "true"\)/);
  assert.match(sheetSource, /body\.setAttribute\("aria-busy", "false"\)/);
  assert.match(sheetSource, /function announceSheetUpdate\(\)/);
  assert.match(sheetSource, /function focusAfterSheetUpdate\(target\)/);
});

test("detail cards expose dialog semantics and keyboard focus handling", () => {
  assert.match(indexSource, /id="sheet-detail"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(indexSource, /id="sheet-provenance"[\s\S]*aria-labelledby="sheet-provenance-title"/);
  assert.match(indexSource, /<dai-detail-panel[\s\S]*role="dialog"[\s\S]*aria-labelledby="dai-detail-title"/);
  assert.match(sheetSource, /function trapDetailFocus\(event\)/);
  assert.match(sheetSource, /event\.key === "Escape"/);
  assert.match(sheetSource, /closeDetailCards\(\{ restoreFocus: true \}\)/);
  assert.match(sheetSource, /function setDetailBackgroundInert\(isOpen\)/);
  assert.match(detailPanelsSource, /id="dai-detail-title"/);
});

test("secondary text and motion respect the accessibility baseline", () => {
  assert.match(stylesSource, /--ph-ink-3: #6d6d73/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
});
