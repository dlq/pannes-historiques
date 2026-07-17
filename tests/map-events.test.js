import assert from "node:assert/strict";
import { test } from "node:test";

import { MAP_EVENTS } from "../app/static/map-events.js";

test("map event names are defined by one shared contract", () => {
  assert.deepEqual(MAP_EVENTS, {
    address: "map-address",
    daiSelected: "dai-selected",
    focus: "map-focus",
    layerItems: "map-layer-items",
    operationalLayerSelected: "operational-layer-selected",
    regionalMetricSelected: "regional-metric-selected",
    sheetInsetChange: "sheet-inset-change",
  });
});
