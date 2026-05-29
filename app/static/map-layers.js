export function metricValue(item) {
  if (Number.isFinite(item.continuityIndexMinutes)) return item.continuityIndexMinutes;
  if (Number.isFinite(item.outageCount)) return item.outageCount;
  if (Number.isFinite(item.longOutageCount)) return item.longOutageCount;
  return null;
}

function metricColor(value, maxValue) {
  if (value == null) return null;
  const ratio = Math.max(0, Math.min(1, value / Math.max(maxValue, 1)));
  if (ratio > 0.8) return "#8b1e3f";
  if (ratio > 0.6) return "#c2410c";
  if (ratio > 0.4) return "#ea580c";
  if (ratio > 0.2) return "#ca8a04";
  return "#0f766e";
}

function contextRegionColor(item) {
  const palette = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#0369a1", "#a16207"];
  const key = item.geometryKey || item.label || "";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % palette.length;
  }
  return palette[hash];
}

export function regionalColor(item, maxValue) {
  return metricColor(metricValue(item), maxValue) || contextRegionColor(item);
}

export function regionalFillOpacity(item) {
  return metricValue(item) == null ? 0.04 : 0.16;
}

export function regionalWeight(item) {
  return metricValue(item) == null ? 0.8 : 1.2;
}

export function mapPane(item) {
  if (item.kind === "regional_metric") return "regionalContextPane";
  if (item.kind === "disclosure") return "disclosurePane";
  if (item.kind === "previous_outage") return "previousOutagePane";
  if (item.kind === "planned") return "plannedPane";
  return "outagePane";
}

export function geometryPoints(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2);
  }
  return [];
}

export function geometryWeight(itemOrGeometry) {
  const geometry = itemOrGeometry?.geometry || itemOrGeometry;
  const points = geometryPoints(geometry);
  if (!points.length) return 0;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return (Math.max(...lons) - Math.min(...lons)) * (Math.max(...lats) - Math.min(...lats));
}

export function layerColor(item, metricMax) {
  if (item.kind === "planned") return "#0891b2";
  if (item.kind === "disclosure") return "#2563eb";
  if (item.kind === "regional_metric") return regionalColor(item, metricMax);
  if (item.kind === "previous_outage") return "#64748b";
  return "#f59e0b";
}

export function geometryStyle(item, metricMax) {
  const isDisclosure = item.kind === "disclosure";
  const isRegionalMetric = item.kind === "regional_metric";
  const isPreviousOutage = item.kind === "previous_outage";
  const color = layerColor(item, metricMax);
  return {
    color,
    weight: isRegionalMetric
      ? regionalWeight(item)
      : isDisclosure
        ? 2
        : isPreviousOutage
          ? 2
          : item.matchType === "direct_match"
            ? 4
            : 3,
    opacity: isRegionalMetric ? 0.36 : isDisclosure ? 0.72 : 1,
    dashArray: isPreviousOutage ? "4 6" : null,
    fillColor: color,
    fillOpacity: isRegionalMetric
      ? regionalFillOpacity(item)
      : isDisclosure
        ? 0.16
        : isPreviousOutage
          ? 0.1
          : item.kind === "planned"
            ? 0.34
            : 0.38,
  };
}

export function markerStyle(item, metricMax) {
  const isDisclosure = item.kind === "disclosure";
  const isRegionalMetric = item.kind === "regional_metric";
  const isPreviousOutage = item.kind === "previous_outage";
  const color = layerColor(item, metricMax);
  return {
    pane: mapPane(item),
    radius: isRegionalMetric
      ? 14
      : isDisclosure
        ? 12
        : isPreviousOutage
          ? 7
          : item.matchType === "direct_match"
            ? 8
            : 6,
    color,
    weight: isRegionalMetric ? 2 : isDisclosure ? 3.5 : isPreviousOutage ? 1.5 : 2,
    fillColor: color,
    fillOpacity: isRegionalMetric ? 0.48 : isDisclosure ? 0.82 : isPreviousOutage ? 0.38 : 0.65,
  };
}
