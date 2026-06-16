import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assignPolygonToTerritories,
  bboxIntersects,
  compareHydroPolygonIds,
  geometryBbox,
  geometryCentroid,
  parseHydroPolygonId,
  pointInGeometry,
  simplifyGeometry,
  simplifyTerritoryCoverage,
  territoryFromFeature,
} from "../src/municipal-archive.js";

const square = (west, south, east, north) => ({
  type: "Polygon",
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
});

test("computes bbox and centroid for a polygon", () => {
  const geometry = square(-75, 45, -73, 47);

  assert.deepEqual(geometryBbox(geometry), {
    minLon: -75,
    minLat: 45,
    maxLon: -73,
    maxLat: 47,
  });
  assert.deepEqual(geometryCentroid(geometry), { lon: -74.2, lat: 45.8 });
});

test("checks point containment for Polygon and MultiPolygon", () => {
  const geometry = {
    type: "MultiPolygon",
    coordinates: [square(-75, 45, -74, 46).coordinates, square(-73, 47, -72, 48).coordinates],
  };

  assert.equal(pointInGeometry({ lon: -74.5, lat: 45.5 }, geometry), true);
  assert.equal(pointInGeometry({ lon: -72.5, lat: 47.5 }, geometry), true);
  assert.equal(pointInGeometry({ lon: -73.5, lat: 46.5 }, geometry), false);
});

test("checks bbox intersection", () => {
  assert.equal(
    bboxIntersects(
      { minLon: -75, minLat: 45, maxLon: -74, maxLat: 46 },
      { minLon: -74.5, minLat: 45.5, maxLon: -73.5, maxLat: 46.5 },
    ),
    true,
  );
  assert.equal(
    bboxIntersects(
      { minLon: -75, minLat: 45, maxLon: -74, maxLat: 46 },
      { minLon: -73.5, minLat: 45.5, maxLon: -72.5, maxLat: 46.5 },
    ),
    false,
  );
});

test("simplifies polygon rings while preserving closure", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [-75, 45],
        [-74.99, 45.01],
        [-74, 45],
        [-74, 46],
        [-75, 46],
        [-75, 45],
      ],
    ],
  };

  const simplified = simplifyGeometry(geometry, 0.05);

  assert.equal(simplified.type, "Polygon");
  assert.deepEqual(simplified.coordinates[0][0], simplified.coordinates[0].at(-1));
  assert.ok(simplified.coordinates[0].length < geometry.coordinates[0].length);
  assert.ok(simplified.coordinates[0].length >= 4);
});

test("simplifies territory coverage while preserving shared borders", () => {
  const sharedBorder = [
    [1, 0],
    [1.01, 0.2],
    [1, 0.4],
    [0.99, 0.6],
    [1, 0.8],
    [1, 1],
  ];
  const left = {
    type: "Feature",
    id: "left",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], ...sharedBorder, [0, 1], [0, 0]]],
    },
  };
  const right = {
    type: "Feature",
    id: "right",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[2, 0], [2, 1], ...sharedBorder.toReversed(), [2, 0]]],
    },
  };

  const simplified = simplifyTerritoryCoverage([left, right], { minWeight: 0.00001 });
  const [simplifiedLeft, simplifiedRight] = simplified.features;

  assert.ok(
    simplifiedLeft.geometry.coordinates[0].length < left.geometry.coordinates[0].length,
    "expected the left polygon to lose display-only vertices",
  );
  assert.deepEqual(
    normalizedSharedEdge(simplifiedLeft.geometry),
    normalizedSharedEdge(simplifiedRight.geometry),
  );
});

function normalizedSharedEdge(geometry) {
  const seen = new Set();
  return geometry.coordinates[0]
    .filter(([lon]) => lon > 0.9 && lon < 1.1)
    .map(roundPoint)
    .filter((point) => {
      const key = point.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);
}

function roundPoint(point) {
  return point.map((coordinate) => Number(coordinate.toFixed(6)));
}

test("normalizes a Donnees Quebec municipality feature", () => {
  const territory = territoryFromFeature({
    type: "Feature",
    id: 123,
    properties: {
      MUS_CO_GEO: "06066",
      MUS_NM_MUN: "Montréal",
      MUS_DE_IND: "Municipalité",
      MUS_CO_DES: "V",
      MUS_NM_NMC: "Ville de Montréal",
      MUS_CO_MRC: "66",
      MUS_NM_MRC: "Montréal",
      MUS_CO_REG: "06",
      MUS_NM_REG: "Montréal",
      MUS_CO_VER: "V2026-05",
    },
    geometry: square(-74, 45, -73, 46),
  });

  assert.equal(territory.territory_id, "municipality:06066");
  assert.equal(territory.name, "Montréal");
  assert.equal(territory.designation, "Municipalité");
  assert.equal(territory.region_code, "06");
  assert.deepEqual(territory.bbox, { minLon: -74, minLat: 45, maxLon: -73, maxLat: 46 });
});

test("assigns outage polygon to primary centroid territory and overlap territories", () => {
  const west = {
    territory_id: "municipality:west",
    name: "West",
    geometry: square(-76, 44, -74, 47),
    bbox: { minLon: -76, minLat: 44, maxLon: -74, maxLat: 47 },
  };
  const east = {
    territory_id: "municipality:east",
    name: "East",
    geometry: square(-74, 44, -72, 47),
    bbox: { minLon: -74, minLat: 44, maxLon: -72, maxLat: 47 },
  };
  const polygon = {
    id: "bispoly:version:1",
    source_type: "bispoly",
    source_version: "version",
    polygon_id: "1",
    centroid_lon: -74.25,
    centroid_lat: 45,
    bbox_min_lon: -74.5,
    bbox_min_lat: 44.5,
    bbox_max_lon: -73.5,
    bbox_max_lat: 45.5,
    geometry_geojson: JSON.stringify(square(-74.5, 44.5, -73.5, 45.5)),
  };

  const assignments = assignPolygonToTerritories(polygon, [west, east]);

  assert.deepEqual(
    assignments.map((assignment) => [assignment.assignment_type, assignment.territory_id]),
    [
      ["primary", "municipality:west"],
      ["overlap", "municipality:west"],
      ["overlap", "municipality:east"],
    ],
  );
});

test("orders Hydro polygon ids by source version and numeric polygon index", () => {
  assert.deepEqual(parseHydroPolygonId("bispoly:20260615193004:10"), {
    sourceType: "bispoly",
    sourceVersion: "20260615193004",
    polygonIndex: 10,
  });
  assert.equal(compareHydroPolygonIds("bispoly:20260615193004:9", "bispoly:20260615193004:10"), -1);
  assert.equal(compareHydroPolygonIds("bispoly:20260615193004:604", "bispoly:20260615200010:0"), -1);
  assert.deepEqual(
    ["bispoly:20260615193004:9", "bispoly:20260615193004:10"].sort(),
    ["bispoly:20260615193004:10", "bispoly:20260615193004:9"],
  );
});
