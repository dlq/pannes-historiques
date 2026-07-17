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

export function dispatchMapEvent(type, detail = undefined) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
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
