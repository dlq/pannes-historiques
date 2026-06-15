import { disclosureSummaryPopup } from "./detail-panels.js?v=20260613modules";
import {
  geometryStyle,
  geometryWeight,
  mapLayerClass,
  mapPane,
  markerStyle,
  metricValue,
} from "./map-layers.js?v=20260615archive-style";
import { contextLayerForKind } from "./side-panel.js?v=20260614previous-totals";
import { escapeHtml, fetchJson, label } from "./ui-format.js?v=20260608compact";

function applyMapLayerClass(layer, item) {
  const classes = mapLayerClass(item).split(/\s+/).filter(Boolean);
  const applyToElement = (element) => {
    if (element) element.classList.add(...classes);
  };
  if (typeof layer.eachLayer === "function") {
    layer.eachLayer((childLayer) => applyToElement(childLayer.getElement?.()));
  }
  applyToElement(layer.getElement?.());
}
export class OutageMap extends HTMLElement {
  connectedCallback() {
    const raw = this.getAttribute("data-map") || "{}";
    const data = JSON.parse(raw);
    this.innerHTML = '<div class="h-full w-full"></div>';
    const root = this.firstElementChild;
    const detailPanel = document.querySelector("dai-detail-panel");
    const labels = data.labels || {};
    if (detailPanel) detailPanel.labels = labels;
    if (!window.L) {
      root.innerHTML = `<div class="ph-map-visual-center">${escapeHtml(label(labels, "map_unavailable", "The map could not load. Reload the page to try again."))}</div>`;
      return;
    }
    const map = L.map(root, { zoomControl: false }).setView(data.center || [46.8, -71.2], 11);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
    }).addTo(map);
    map.createPane("regionalContextPane");
    map.getPane("regionalContextPane").style.zIndex = 350;
    map.createPane("disclosurePane");
    map.getPane("disclosurePane").style.zIndex = 360;
    map.createPane("previousOutagePane");
    map.getPane("previousOutagePane").style.zIndex = 430;
    map.createPane("plannedPane");
    map.getPane("plannedPane").style.zIndex = 440;
    map.createPane("outagePane");
    map.getPane("outagePane").style.zIndex = 450;
    const bounds = [];
    let focusItems = [];
    let activeMapFocus = null;
    const renderedLeafletLayers = new Map();
    const renderedItemKeysByLayer = new Map();
    const visibleMapPadding = (base = 36) => {
      const rail = document.querySelector(".ph-side-rail");
      const mapRect = root.getBoundingClientRect();
      const railRect = rail?.getBoundingClientRect();
      const isMobileLayout = window.matchMedia("(max-width: 767px)").matches;
      const leftOverlay =
        railRect &&
        !isMobileLayout &&
        railRect.right > mapRect.left &&
        railRect.left < mapRect.right
          ? Math.max(0, railRect.right - mapRect.left + 16)
          : 0;
      const bottomOverlay =
        railRect && railRect.bottom > mapRect.top && railRect.top < mapRect.bottom && isMobileLayout
          ? Math.max(0, mapRect.bottom - railRect.top + 16)
          : 0;
      return {
        padding: [base, base],
        paddingTopLeft: [leftOverlay + base, base],
        paddingBottomRight: [base, bottomOverlay + base],
        leftOverlay,
        bottomOverlay,
      };
    };
    const offsetCenterForVisibleMap = (center, zoom) => {
      const { leftOverlay, bottomOverlay } = visibleMapPadding();
      if (leftOverlay <= 0 && bottomOverlay <= 0) return center;
      const projected = map.project(center, zoom);
      const adjusted = L.point(projected.x - leftOverlay / 2, projected.y + bottomOverlay / 2);
      return map.unproject(adjusted, zoom);
    };
    const setVisibleCenter = (center, zoom) => {
      map.setView(offsetCenterForVisibleMap(center, zoom), zoom);
    };
    const numbersClose = (left, right, tolerance = 1) => {
      if (left == null || right == null) return true;
      return Math.abs(Number(left) - Number(right)) <= tolerance;
    };
    const eventMatchesFocus = (detail, event) => {
      if (!detail.startTime || !event.start_time) return false;
      if (detail.startTime !== event.start_time) return false;
      if (
        detail.customersAffected != null &&
        event.customers_affected != null &&
        Number(detail.customersAffected) !== Number(event.customers_affected)
      ) {
        return false;
      }
      return numbersClose(detail.distanceM, event.distance_m);
    };
    const itemMatchesFocus = (detail, item) => {
      if (detail.kind && item.kind && detail.kind !== item.kind) return false;
      if (detail.geometryKey && item.geometryKey) return detail.geometryKey === item.geometryKey;
      if (detail.label && item.label && detail.kind && detail.label !== item.label) return false;
      if (detail.startTime && item.startTime && detail.startTime !== item.startTime) return false;
      if (
        detail.customersAffected != null &&
        item.customersAffected != null &&
        Number(detail.customersAffected) !== Number(item.customersAffected)
      ) {
        return false;
      }
      return numbersClose(detail.distanceM, item.distanceM);
    };
    const findFocusMatch = (detail) =>
      focusItems.find((item) => {
        if (itemMatchesFocus(detail, item)) return true;
        if (!["planned", "previous_outage"].includes(item.kind)) return false;
        return (item.recentEvents || []).some((event) => eventMatchesFocus(detail, event));
      });
    const enrichFocusDetail = (detail) => {
      if (detail.geometry) return detail;
      if (
        detail.kind === "previous_outage" &&
        Number.isFinite(Number(detail.lat)) &&
        Number.isFinite(Number(detail.lon))
      ) {
        return detail;
      }
      const match = findFocusMatch(detail);
      if (!match?.geometry) return detail;
      return {
        ...detail,
        lat: detail.lat ?? match.lat,
        lon: detail.lon ?? match.lon,
        geometry: match.geometry,
      };
    };
    const focusMap = (rawDetail, { remember = true } = {}) => {
      const raw = rawDetail || {};
      const matchedItem = findFocusMatch(raw);
      if (matchedItem?.kind === "disclosure") {
        if (remember) showDisclosure(matchedItem);
        restackDisclosureLayers();
      }
      if (matchedItem?.kind === "regional_metric" && remember) showRegionalMetric(matchedItem);
      if (
        matchedItem &&
        ["outage", "planned", "previous_outage"].includes(matchedItem.kind) &&
        remember
      ) {
        showOperational(matchedItem);
      }
      const detail = enrichFocusDetail(raw);
      if (remember) activeMapFocus = detail;
      this.dataset.activeFocusKind = detail.kind || "";
      this.dataset.activeFocusLabel = detail.label || "";
      this.dataset.activeFocusStartTime = detail.startTime || "";
      map.invalidateSize();
      if (detail.geometry) {
        const layer = L.geoJSON(detail.geometry);
        const layerBounds = layer.getBounds();
        if (layerBounds.isValid()) {
          map.fitBounds(layerBounds, { ...visibleMapPadding(36), maxZoom: 16 });
          return;
        }
      }
      const lat = Number(detail.lat);
      const lon = Number(detail.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const targetZoom = Math.max(map.getZoom(), 13);
        setVisibleCenter([lat, lon], targetZoom);
      }
    };
    this.handleMapFocus = (event) => {
      if (!this.offsetParent) return;
      const detail = event.detail || {};
      focusMap(detail);
      if (window.pendingMapFocus === detail) window.pendingMapFocus = null;
    };
    document.addEventListener("map-focus", this.handleMapFocus);
    if (data.center && data.showAddressMarker !== false) {
      L.marker(data.center)
        .addTo(map)
        .bindPopup(data.addressLabel || label(labels, "address", "Address"));
      bounds.push(data.center);
    }
    const regionalMetricMax = (items) => {
      const metricValues = (items || [])
        .filter((item) => item.kind === "regional_metric")
        .map((item) => metricValue(item))
        .filter((value) => value != null);
      return Math.max(1, ...metricValues);
    };
    let metricMax = regionalMetricMax(data.matches || []);
    const showDisclosure = (item) => {
      if (detailPanel && typeof detailPanel.renderDisclosure === "function") {
        detailPanel.renderDisclosure(item);
      }
      this.dispatchEvent(new CustomEvent("dai-selected", { bubbles: true, detail: item }));
    };
    const showRegionalMetric = (item) => {
      if (detailPanel && typeof detailPanel.renderRegionalMetric === "function") {
        detailPanel.renderRegionalMetric(item);
      }
      this.dispatchEvent(
        new CustomEvent("regional-metric-selected", { bubbles: true, detail: item }),
      );
    };
    const showOperational = (item) => {
      if (detailPanel && typeof detailPanel.renderOperational === "function") {
        detailPanel.renderOperational(item);
      }
      this.dispatchEvent(
        new CustomEvent("operational-layer-selected", { bubbles: true, detail: item }),
      );
    };
    const disclosureLayers = [];
    const restackDisclosureLayers = () => {
      const orderedDisclosureLayers = disclosureLayers
        .slice()
        .sort((left, right) => right.weight - left.weight);
      for (const { layer } of orderedDisclosureLayers) {
        layer.bringToFront();
      }
    };
    const orderMatches = (matches) =>
      [...(matches || [])].sort((left, right) => {
        const rank = {
          regional_metric: 0,
          disclosure: 1,
          previous_outage: 2,
          planned: 3,
          outage: 3,
        };
        const rankDifference = (rank[left.kind] ?? 3) - (rank[right.kind] ?? 3);
        if (rankDifference !== 0) return rankDifference;
        if (left.kind === "disclosure") {
          return geometryWeight(right) - geometryWeight(left);
        }
        return 0;
      });
    const orderedMatches = orderMatches(data.matches || []);
    focusItems = orderedMatches;
    const renderedGeometryKeys = new Set();
    const initialExtentBounds = [];
    const isContextLayer = (item) => item.kind === "disclosure" || item.kind === "regional_metric";
    const shouldContributeToInitialExtent = (item) =>
      !isContextLayer(item) && contextLayerForKind(item.kind) === "current";
    const itemRenderKey = (item) =>
      [
        item.kind,
        item.geometryKey || "",
        item.startTime || item.label || "",
        item.lat ?? "",
        item.lon ?? "",
        item.customersAffected ?? "",
      ].join("|");
    const rememberRenderedLayer = (item, layer) => {
      const contextLayer = contextLayerForKind(item.kind);
      if (!renderedLeafletLayers.has(contextLayer)) renderedLeafletLayers.set(contextLayer, []);
      renderedLeafletLayers.get(contextLayer).push(layer);
      if (!renderedItemKeysByLayer.has(contextLayer)) renderedItemKeysByLayer.set(contextLayer, []);
      renderedItemKeysByLayer.get(contextLayer).push(item.geometryKey || itemRenderKey(item));
    };
    const bindLayerInteractions = (layer, item) => {
      if (item.kind === "disclosure") {
        disclosureLayers.push({ layer, weight: geometryWeight(item) });
        layer.on("click", () => {
          showDisclosure(item);
          restackDisclosureLayers();
        });
        layer.bindPopup(disclosureSummaryPopup(item, labels), { maxWidth: 280 });
        return;
      }
      if (item.kind === "regional_metric") {
        layer.on("click", () => showRegionalMetric(item));
        return;
      }
      layer.on("click", () => showOperational(item));
    };
    const renderMatch = (item) => {
      if (item.deferGeometry && !item.geometry) return;
      const renderKey = item.geometryKey || itemRenderKey(item);
      if (renderedGeometryKeys.has(renderKey)) return;
      let rendered = false;
      if (item.geometry && ["Polygon", "MultiPolygon"].includes(item.geometry.type)) {
        const layer = L.geoJSON(item.geometry, {
          pane: mapPane(item),
          style: geometryStyle(item, metricMax),
        }).addTo(map);
        applyMapLayerClass(layer, item);
        bindLayerInteractions(layer, item);
        rememberRenderedLayer(item, layer);
        const layerBounds = layer.getBounds();
        if (!isContextLayer(item) && layerBounds.isValid()) {
          bounds.push(layerBounds.getSouthWest());
          bounds.push(layerBounds.getNorthEast());
        }
        if (shouldContributeToInitialExtent(item) && layerBounds.isValid()) {
          initialExtentBounds.push(layerBounds.getSouthWest());
          initialExtentBounds.push(layerBounds.getNorthEast());
        }
        if (!isContextLayer(item)) layer.bringToFront();
        rendered = true;
      }
      if (!rendered && item.lat != null && item.lon != null) {
        const marker = L.circleMarker([item.lat, item.lon], markerStyle(item, metricMax)).addTo(
          map,
        );
        applyMapLayerClass(marker, item);
        bindLayerInteractions(marker, item);
        rememberRenderedLayer(item, marker);
        if (!isContextLayer(item)) marker.bringToFront();
        if (!isContextLayer(item)) bounds.push([item.lat, item.lon]);
        if (shouldContributeToInitialExtent(item)) initialExtentBounds.push([item.lat, item.lon]);
      }
      renderedGeometryKeys.add(renderKey);
    };
    const removeLayer = (layerKey) => {
      for (const layer of renderedLeafletLayers.get(layerKey) || []) {
        map.removeLayer(layer);
      }
      for (const key of renderedItemKeysByLayer.get(layerKey) || []) {
        renderedGeometryKeys.delete(key);
      }
      renderedLeafletLayers.delete(layerKey);
      renderedItemKeysByLayer.delete(layerKey);
      focusItems = focusItems.filter((item) => contextLayerForKind(item.kind) !== layerKey);
      map.invalidateSize();
    };
    const updateLayerData = (layerKey, matches) => {
      const nextItems = orderMatches(matches || []);
      focusItems = [
        ...focusItems.filter((item) => contextLayerForKind(item.kind) !== layerKey),
        ...nextItems,
      ];
      metricMax = regionalMetricMax(focusItems);
    };
    const addLayerItems = (layerKey, matches) => {
      const nextItems = orderMatches(matches || []);
      focusItems = [
        ...focusItems.filter((item) => contextLayerForKind(item.kind) !== layerKey),
        ...nextItems,
      ];
      metricMax = regionalMetricMax(focusItems);
      for (const item of nextItems) renderMatch(item);
      if (
        data.contextGeometryUrl &&
        nextItems.some((item) => item.deferGeometry && item.geometryKey)
      ) {
        fetchJson(data.contextGeometryUrl, {
          headers: { Accept: "application/json" },
        })
          .then((payload) => {
            const geometries = new Map(
              (payload.geometries || []).map((item) => [item.geometryKey, item.geometry]),
            );
            for (const item of nextItems) {
              if (!item.deferGeometry || !item.geometryKey) continue;
              item.geometry = geometries.get(item.geometryKey);
              renderMatch(item);
            }
            map.invalidateSize();
          })
          .catch(() => {});
      }
      restackDisclosureLayers();
      map.invalidateSize();
    };
    for (const item of orderedMatches) {
      renderMatch(item);
    }
    restackDisclosureLayers();
    const refresh = (options = {}) => {
      const fitToBounds = options.fitToBounds === true;
      const allowDefaultCenter = options.allowDefaultCenter === true;
      const fitBounds = options.bounds?.length ? options.bounds : bounds;
      map.invalidateSize();
      if (data.center && Number.isFinite(data.radiusM)) {
        setVisibleCenter(data.center, data.zoom || 14);
      } else if (data.center && data.preserveInitialView) {
        setVisibleCenter(data.center, data.zoom || 14);
      } else if (fitToBounds && fitBounds.length > 1) {
        map.fitBounds(fitBounds, { ...visibleMapPadding(24), maxZoom: 16 });
      } else if (fitToBounds && fitBounds.length === 1) {
        setVisibleCenter(fitBounds[0], data.zoom || 8);
      } else if (allowDefaultCenter && data.center) {
        setVisibleCenter(data.center, data.zoom || 14);
      }
    };
    const startupBounds = () => (initialExtentBounds.length ? initialExtentBounds : bounds);
    const fitStartupExtent = () => {
      if (activeMapFocus) return;
      refresh({
        fitToBounds: !data.preserveInitialView,
        allowDefaultCenter: true,
        bounds: startupBounds(),
      });
    };
    const replayPendingFocus = () => {
      const focusDetail = window.pendingMapFocus || activeMapFocus;
      if (!focusDetail || !this.isConnected) return;
      focusMap(focusDetail);
      if (window.pendingMapFocus === focusDetail) window.pendingMapFocus = null;
    };
    requestAnimationFrame(() =>
      setTimeout(() => {
        fitStartupExtent();
        replayPendingFocus();
        setTimeout(fitStartupExtent, 250);
        setTimeout(fitStartupExtent, 900);
      }, 0),
    );
    if (
      data.contextGeometryUrl &&
      orderedMatches.some((item) => item.deferGeometry && item.geometryKey)
    ) {
      fetchJson(data.contextGeometryUrl, {
        headers: { Accept: "application/json" },
      })
        .then((payload) => {
          const geometries = new Map(
            (payload.geometries || []).map((item) => [item.geometryKey, item.geometry]),
          );
          requestAnimationFrame(() => {
            map.invalidateSize();
            for (const item of orderedMatches) {
              if (!item.deferGeometry || !item.geometryKey) continue;
              item.geometry = geometries.get(item.geometryKey);
              renderMatch(item);
            }
            fitStartupExtent();
            replayPendingFocus();
          });
        })
        .catch(() => {
          // Context geometry is secondary; operational outage layers remain usable without it.
        });
    }
    this.handleMapLayerItems = (event) => {
      const { layer, matches } = event.detail || {};
      if (!layer) return;
      removeLayer(layer);
      addLayerItems(layer, matches || []);
    };
    this.handleMapLayerData = (event) => {
      const { layer, matches } = event.detail || {};
      if (!layer) return;
      updateLayerData(layer, matches || []);
    };
    this.handleMapLayerToggle = (event) => {
      const { layer, enabled } = event.detail || {};
      if (!layer) return;
      if (!enabled) removeLayer(layer);
    };
    document.addEventListener("map-layer-items", this.handleMapLayerItems);
    document.addEventListener("map-layer-data", this.handleMapLayerData);
    document.addEventListener("map-layer-toggle", this.handleMapLayerToggle);
    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => {
        if (activeMapFocus) {
          focusMap(activeMapFocus, { remember: false });
        } else {
          map.invalidateSize();
        }
      });
      this.resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this.handleMapFocus) document.removeEventListener("map-focus", this.handleMapFocus);
    if (this.handleMapLayerItems)
      document.removeEventListener("map-layer-items", this.handleMapLayerItems);
    if (this.handleMapLayerData)
      document.removeEventListener("map-layer-data", this.handleMapLayerData);
    if (this.handleMapLayerToggle)
      document.removeEventListener("map-layer-toggle", this.handleMapLayerToggle);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }
}
