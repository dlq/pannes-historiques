export const MAP_EVENTS = Object.freeze({
  address: "map-address",
  daiSelected: "dai-selected",
  focus: "map-focus",
  layerItems: "map-layer-items",
  operationalLayerSelected: "operational-layer-selected",
  regionalMetricSelected: "regional-metric-selected",
  sheetInsetChange: "sheet-inset-change",
});

let pendingFocus = null;
let latestAddress = null;
const latestLayerItems = new Map();

export function dispatchMapEvent(type, detail = undefined) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

export function updateMapLayerItems(detail) {
  if (!detail?.layer) return;
  latestLayerItems.set(detail.layer, detail.matches || []);
  dispatchMapEvent(MAP_EVENTS.layerItems, detail);
}

export function latestMapLayerItems() {
  return [...latestLayerItems.entries()].map(([layer, matches]) => ({ layer, matches }));
}

export function updateMapAddress(detail) {
  latestAddress = detail;
  dispatchMapEvent(MAP_EVENTS.address, detail);
}

export function latestMapAddress() {
  return latestAddress;
}

export function requestMapFocus(detail) {
  pendingFocus = detail;
  dispatchMapEvent(MAP_EVENTS.focus, detail);
}

export function pendingMapFocus() {
  return pendingFocus;
}

export function clearPendingMapFocus(detail) {
  if (pendingFocus === detail) pendingFocus = null;
}
