import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundsToLngLatBounds,
  contextLayerForKind,
  extendBoundsWithGeometry,
  itemRenderKey,
  radiusCirclePolygon,
} from "../app/static/map-utils.js";

test("contextLayerForKind maps match kinds onto the four map layers", () => {
  assert.equal(contextLayerForKind("outage"), "current");
  assert.equal(contextLayerForKind("planned"), "planned");
  assert.equal(contextLayerForKind("previous_outage"), "previous");
  assert.equal(contextLayerForKind("disclosure"), "published");
  assert.equal(contextLayerForKind("regional_metric"), "published");
  assert.equal(contextLayerForKind("anything-else"), "current");
});

test("radiusCirclePolygon builds a closed ring around the center", () => {
  const polygon = radiusCirclePolygon(45.5, -73.6, 5000, 32);
  assert.equal(polygon.type, "Polygon");
  const ring = polygon.coordinates[0];
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const lats = ring.map(([, lat]) => lat);
  const maxLat = Math.max(...lats);
  const minLat = Math.min(...lats);
  const spanM = ((maxLat - minLat) * Math.PI * 6371000) / 180;
  assert.ok(Math.abs(spanM - 10000) < 100, `diameter ${spanM} should be about 10 km`);
});

test("bounds helpers cover nested polygon coordinates", () => {
  const bounds = [];
  extendBoundsWithGeometry(bounds, {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [-73.7, 45.4],
          [-73.5, 45.4],
          [-73.5, 45.6],
        ],
      ],
      [
        [
          [-73.9, 45.3],
          [-73.8, 45.7],
        ],
      ],
    ],
  });
  assert.equal(bounds.length, 5);
  const box = boundsToLngLatBounds(bounds);
  assert.deepEqual(box, [
    [-73.9, 45.3],
    [-73.5, 45.7],
  ]);
});

test("boundsToLngLatBounds returns null for empty input", () => {
  assert.equal(boundsToLngLatBounds([]), null);
});

test("itemRenderKey distinguishes overlapping events", () => {
  const base = { kind: "previous_outage", startTime: "2026-07-05 11:47:00", lat: 45.5, lon: -73.6 };
  const other = { ...base, customersAffected: 2142 };
  assert.notEqual(itemRenderKey(base), itemRenderKey(other));
  assert.equal(itemRenderKey(base), itemRenderKey({ ...base }));
});

test("internal module imports share one version token", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const staticDir = new URL("../app/static/", import.meta.url);
  const tokens = new Set();
  for (const name of await readdir(staticDir)) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(new URL(name, staticDir), "utf8");
    for (const match of source.matchAll(/from "\.\/[a-z-]+\.js\?v=([0-9a-z-]+)"/g)) {
      tokens.add(match[1]);
    }
  }
  assert.equal(
    tokens.size,
    1,
    `internal import tokens diverged: ${[...tokens].join(", ")} — bump them together`,
  );
});
