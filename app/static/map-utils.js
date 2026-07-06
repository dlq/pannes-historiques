export const DOMAIN_COLORS = {
  current: "#d64541",
  planned: "#c07b13",
  previous: "#6f66d6",
  context: "#1d9e75",
  address: "#2775c9",
};

export function contextLayerForKind(kind) {
  if (kind === "outage") return "current";
  if (kind === "planned") return "planned";
  if (kind === "previous_outage") return "previous";
  if (kind === "disclosure" || kind === "regional_metric") return "published";
  return "current";
}

export function radiusCirclePolygon(lat, lon, radiusM, steps = 96) {
  const coordinates = [];
  const earthRadius = 6371000;
  const latRad = (lat * Math.PI) / 180;
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * 2 * Math.PI;
    const dLat = ((radiusM * Math.cos(angle)) / earthRadius) * (180 / Math.PI);
    const dLon = ((radiusM * Math.sin(angle)) / (earthRadius * Math.cos(latRad))) * (180 / Math.PI);
    coordinates.push([lon + dLon, lat + dLat]);
  }
  return { type: "Polygon", coordinates: [coordinates] };
}

export function extendBoundsWithGeometry(bounds, geometry) {
  if (!geometry) return;
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      bounds.push([coords[0], coords[1]]);
      return;
    }
    for (const child of coords) walk(child);
  };
  walk(geometry.coordinates);
}

export function boundsToLngLatBounds(bounds) {
  if (!bounds.length) return null;
  let [minLon, minLat] = bounds[0];
  let [maxLon, maxLat] = bounds[0];
  for (const [lon, lat] of bounds) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export function itemRenderKey(item) {
  return [
    item.kind,
    item.geometryKey || "",
    item.startTime || item.label || "",
    item.lat ?? "",
    item.lon ?? "",
    item.customersAffected ?? "",
  ].join("|");
}
