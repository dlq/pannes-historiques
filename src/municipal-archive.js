import { feature as topojsonFeature } from "topojson-client";
import { presimplify, simplify as topojsonSimplify } from "topojson-simplify";
import { topology } from "topojson-server";

export function geometryBbox(geometry) {
  const points = geometryPoints(geometry);
  if (!points.length) return null;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
}

export function geometryCentroid(geometry) {
  const points = geometryPoints(geometry);
  if (!points.length) return { lon: null, lat: null };
  const total = points.reduce(
    (accumulator, point) => ({
      lon: accumulator.lon + point[0],
      lat: accumulator.lat + point[1],
    }),
    { lon: 0, lat: 0 },
  );
  return {
    lon: total.lon / points.length,
    lat: total.lat / points.length,
  };
}

export function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  const coordinates = geometry.coordinates || [];
  if (geometry.type === "Polygon") return pointInPolygon(point, coordinates);
  if (geometry.type === "MultiPolygon") {
    return coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

export function bboxIntersects(left, right) {
  if (!left || !right) return false;
  return (
    left.minLon <= right.maxLon &&
    left.maxLon >= right.minLon &&
    left.minLat <= right.maxLat &&
    left.maxLat >= right.minLat
  );
}

export function simplifyGeometry(geometry, toleranceDegrees = 0) {
  if (!geometry || toleranceDegrees <= 0) return geometry;
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, toleranceDegrees)),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => simplifyRing(ring, toleranceDegrees)),
      ),
    };
  }
  return geometry;
}

export function simplifyTerritoryCoverage(features, { minWeight = 0.0000001 } = {}) {
  const collection = {
    type: "FeatureCollection",
    features: features.map((item) => ({
      ...item,
      properties: { ...(item.properties || {}) },
    })),
  };
  const coverageTopology = topology({ territories: collection });
  const weightedTopology = presimplify(coverageTopology);
  const simplifiedTopology = topojsonSimplify(weightedTopology, minWeight);
  return topojsonFeature(simplifiedTopology, simplifiedTopology.objects.territories);
}

export function territoryFromFeature(
  feature,
  { displayGeometry = null, displayToleranceDegrees = 0.0005 } = {},
) {
  const properties = feature.properties || {};
  const geometry = feature.geometry;
  const bbox = geometryBbox(geometry);
  const centroid = geometryCentroid(geometry);
  const code = properties.MUS_CO_GEO || String(feature.id || "");
  return {
    territory_id: `municipality:${code}`,
    source_object_id: feature.id || properties.OBJECTID || null,
    code,
    name: properties.MUS_NM_MUN || "",
    normalized_name: properties.MUS_NM_NMC || properties.MUS_NM_MUN || "",
    designation: properties.MUS_DE_IND || "",
    designation_code: properties.MUS_CO_DES || "",
    mrc_code: properties.MUS_CO_MRC || "",
    mrc_name: properties.MUS_NM_MRC || "",
    region_code: properties.MUS_CO_REG || "",
    region_name: properties.MUS_NM_REG || "",
    version: properties.MUS_CO_VER || "",
    area_km2: numberOrNull(properties.MUS_VA_SUP),
    centroid_lon: centroid.lon,
    centroid_lat: centroid.lat,
    bbox,
    geometry,
    display_geometry: displayGeometry || simplifyGeometry(geometry, displayToleranceDegrees),
  };
}

export function assignPolygonToTerritories(polygonRow, territories) {
  const polygon = normalizePolygonRow(polygonRow);
  if (!polygon.geometry || !polygon.bbox) return [];

  const centroidPoint = {
    lon: numberOrNull(polygon.centroid_lon),
    lat: numberOrNull(polygon.centroid_lat),
  };
  const polygonVertices = geometryPoints(polygon.geometry);
  const assignments = [];
  let primary = null;

  for (const territory of territories) {
    if (!bboxIntersects(polygon.bbox, territory.bbox)) continue;
    const centroidInside =
      centroidPoint.lon !== null &&
      centroidPoint.lat !== null &&
      pointInGeometry(centroidPoint, territory.geometry);
    const polygonVertexInside = polygonVertices.some(([lon, lat]) =>
      pointInGeometry({ lon, lat }, territory.geometry),
    );
    const territoryVertexInside = geometryPoints(territory.geometry).some(([lon, lat]) =>
      pointInGeometry({ lon, lat }, polygon.geometry),
    );
    if (!centroidInside && !polygonVertexInside && !territoryVertexInside) continue;

    if (centroidInside && !primary) {
      primary = assignmentFor(polygon, territory, "primary");
    }
    assignments.push(assignmentFor(polygon, territory, "overlap"));
  }

  return primary ? [primary, ...assignments] : assignments;
}

export function normalizePolygonRow(row) {
  const geometry =
    typeof row.geometry_geojson === "string"
      ? JSON.parse(row.geometry_geojson)
      : row.geometry_geojson;
  return {
    ...row,
    geometry,
    bbox: {
      minLon: numberOrNull(row.bbox_min_lon),
      minLat: numberOrNull(row.bbox_min_lat),
      maxLon: numberOrNull(row.bbox_max_lon),
      maxLat: numberOrNull(row.bbox_max_lat),
    },
  };
}

function assignmentFor(polygon, territory, assignmentType) {
  return {
    id: `${polygon.id}:${assignmentType}:${territory.territory_id}`,
    hydro_polygon_id: polygon.id,
    source_type: polygon.source_type,
    source_version: polygon.source_version,
    polygon_id: polygon.polygon_id,
    territory_id: territory.territory_id,
    assignment_type: assignmentType,
    territory_code: territory.code,
    territory_name: territory.name,
    designation: territory.designation,
    mrc_code: territory.mrc_code,
    mrc_name: territory.mrc_name,
    region_code: territory.region_code,
    region_name: territory.region_name,
    centroid_lon: polygon.centroid_lon,
    centroid_lat: polygon.centroid_lat,
  };
}

function pointInPolygon(point, polygon) {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing(point, ring) {
  const x = point.lon;
  const y = point.lat;
  let inside = false;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    if (y1 > y !== y2 > y) {
      const xIntersection = ((x2 - x1) * (y - y1)) / (y2 - y1 || Number.EPSILON) + x1;
      if (x < xIntersection) inside = !inside;
    }
  }
  return inside;
}

function geometryPoints(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return polygonPoints(geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygonPoints(polygon));
  }
  return [];
}

function polygonPoints(polygon) {
  return polygon.flatMap((ring) => ring);
}

function simplifyRing(ring, toleranceDegrees) {
  if (ring.length <= 4) return closeRing(ring);
  const openRing = samePoint(ring[0], ring.at(-1)) ? ring.slice(0, -1) : ring.slice();
  const simplified = [openRing[0]];
  let last = openRing[0];
  for (const point of openRing.slice(1, -1)) {
    if (distanceDegrees(last, point) >= toleranceDegrees) {
      simplified.push(point);
      last = point;
    }
  }
  simplified.push(openRing.at(-1));
  return closeRing(simplified.length >= 3 ? simplified : openRing);
}

function closeRing(ring) {
  if (!ring.length) return ring;
  const closed = ring.slice();
  if (!samePoint(closed[0], closed.at(-1))) closed.push(closed[0]);
  return closed;
}

function samePoint(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

function distanceDegrees(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
