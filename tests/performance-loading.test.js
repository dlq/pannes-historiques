import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../app/static/app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../app/templates/index.html", import.meta.url), "utf8");
const map = readFileSync(new URL("../app/static/outage-map.js", import.meta.url), "utf8");
const mapEvents = readFileSync(new URL("../app/static/map-events.js", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../app/static/sheet.js", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../app/static/service-worker.js", import.meta.url), "utf8");

test("map code and stylesheet load after the initial sheet boot", () => {
  assert.doesNotMatch(app, /from "\.\/outage-map\.js/);
  assert.match(app, /import\(mapElement\.dataset\.mapModuleUrl\)/);
  assert.match(app, /loadStylesheet\(mapElement\.dataset\.mapStylesheetUrl\)/);
  assert.match(app, /initSheet\(\);\s*scheduleMapLoad\(\);/);
  assert.match(index, /data-map-module-url=/);
  assert.match(index, /data-map-stylesheet-url=/);
  assert.match(index, /data-map-unavailable-label=/);
  assert.match(index, /aria-busy="true"/);
  assert.doesNotMatch(index, /<link rel="stylesheet"\s+href="[^\"]*maplibre-gl\.css/);
});

test("deferred map startup retains the latest sheet state", () => {
  assert.match(mapEvents, /const latestLayerItems = new Map\(\)/);
  assert.match(mapEvents, /export function updateMapLayerItems\(detail\)/);
  assert.match(mapEvents, /export function latestMapLayerItems\(\)/);
  assert.match(mapEvents, /export function updateMapAddress\(detail\)/);
  assert.match(sheet, /updateMapLayerItems\(\{ layer: layerKey, matches: groups\[layerKey\] \}\)/);
  assert.match(sheet, /updateMapAddress\(\{/);
  assert.match(map, /latestMapLayerItems\(\)/);
  assert.match(map, /latestMapAddress\(\)/);
});

test("map initialization errors leave a visible unavailable state", () => {
  assert.match(map, /const showUnavailable = \(error\) =>/);
  assert.match(map, /map\.on\("error", \(event\) =>/);
  assert.match(map, /showUnavailable\(event\.error \|\| event\)/);
});

test("service worker caches map assets on demand instead of preloading them", () => {
  assert.match(serviceWorker, /pannes-historiques-v0\.4\.7-runtime-static-2/);
  assert.match(serviceWorker, /const APP_SHELL_URLS = \[\s*"\/static\/offline\.html"/);
  assert.doesNotMatch(serviceWorker, /maplibre-gl\.mjs/);
  assert.match(serviceWorker, /caches\.match\(request\)/);
  assert.match(serviceWorker, /cache\.put\(request, copy\)/);
  assert.match(serviceWorker, /if \(!response\.ok\) return response;/);
});

test("the default map style omits decorative Natural Earth raster tiles", () => {
  assert.match(map, /delete sources\.ne2_shaded/);
  assert.match(map, /layer\.source !== "ne2_shaded"/);
});
