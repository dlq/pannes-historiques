import assert from "node:assert/strict";
import { test } from "node:test";

import { optimizeBaseMapStyle } from "../app/static/map-style.js";

test("base map style keeps labels while removing decorative map work", () => {
  const optimized = optimizeBaseMapStyle({
    version: 8,
    sprite: "https://example.test/sprite",
    sources: { ne2_shaded: {}, openmaptiles: {} },
    layers: [
      { id: "hillshade", type: "raster", source: "ne2_shaded" },
      { id: "road", type: "line", source: "openmaptiles" },
      {
        id: "wetland-pattern",
        type: "fill",
        source: "openmaptiles",
        paint: { "fill-pattern": "wetland" },
      },
      {
        id: "one-way-arrow",
        type: "symbol",
        source: "openmaptiles",
        layout: { "icon-image": "arrow" },
      },
      {
        id: "city-label",
        type: "symbol",
        source: "openmaptiles",
        layout: {
          "icon-image": "circle",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
        },
      },
    ],
  });

  assert.equal(optimized.sprite, "https://example.test/sprite");
  assert.deepEqual(Object.keys(optimized.sources), ["openmaptiles"]);
  assert.deepEqual(
    optimized.layers.map((layer) => layer.id),
    ["road", "city-label"],
  );
  assert.deepEqual(optimized.layers[1].layout, {
    "text-field": ["get", "name"],
    "text-font": ["Noto Sans Regular"],
  });
});
