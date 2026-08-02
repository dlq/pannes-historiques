import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../app/static/app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../app/templates/index.html", import.meta.url), "utf8");
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

test("service worker caches map assets on demand instead of preloading them", () => {
  assert.match(serviceWorker, /const APP_SHELL_URLS = \[\s*"\/static\/offline\.html"/);
  assert.doesNotMatch(serviceWorker, /maplibre-gl\.mjs/);
  assert.match(serviceWorker, /caches\.match\(request\)/);
  assert.match(serviceWorker, /cache\.put\(request, copy\)/);
});
