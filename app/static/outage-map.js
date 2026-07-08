import {
  DOMAIN_COLORS,
  boundsToLngLatBounds,
  contextLayerForKind,
  extendBoundsWithGeometry,
  itemRenderKey,
  radiusCirclePolygon,
} from "./map-utils.js?v=20260708a";
import { escapeHtml, label } from "./ui-format.js?v=20260708a";

const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const LAYER_SOURCE_BY_KEY = {
  current: "ph-current",
  planned: "ph-planned",
  previous: "ph-previous",
  published: "ph-context",
};

export class OutageMap extends HTMLElement {
  connectedCallback() {
    const raw = this.getAttribute("data-map") || "{}";
    const data = JSON.parse(raw);
    this.innerHTML = '<div class="ph-map-canvas"></div>';
    const root = this.firstElementChild;
    const labels = data.labels || {};
    const detailPanel = document.querySelector("dai-detail-panel");
    if (detailPanel) detailPanel.labels = labels;
    const showUnavailableMessage = () => {
      root.innerHTML = `<div class="ph-map-visual-center">${escapeHtml(
        label(labels, "map_unavailable", "The map could not load. Reload the page to try again."),
      )}</div>`;
    };
    if (!window.maplibregl) {
      // The vendored MapLibre script can still be downloading (or have failed)
      // on a cold first load; wait for it instead of rendering a dead map.
      const loader = document.querySelector('script[src*="maplibre-gl"]');
      if (loader && this.dataset.mapLibreWaited !== "1") {
        this.dataset.mapLibreWaited = "1";
        let settled = false;
        const retry = () => {
          if (settled || !this.isConnected) return;
          settled = true;
          if (window.maplibregl) {
            this.connectedCallback();
          } else {
            showUnavailableMessage();
          }
        };
        loader.addEventListener("load", retry, { once: true });
        loader.addEventListener(
          "error",
          () => {
            settled = true;
            showUnavailableMessage();
          },
          { once: true },
        );
        window.setTimeout(retry, 8000);
        return;
      }
      showUnavailableMessage();
      return;
    }
    const center = data.center || [46.8, -71.2];
    const map = new maplibregl.Map({
      container: root,
      style: LIBERTY_STYLE_URL,
      center: [center[1], center[0]],
      zoom: data.zoom != null ? Math.max(0, data.zoom - 1) : 10,
      attributionControl: { compact: true },
    });
    this.map = map;
    map.touchPitch.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    const itemsByFeatureKeyByLayer = new Map();
    let focusItems = [];
    let activeMapFocus = null;
    const featuresByLayerKey = new Map();
    let styleReady = false;
    const pendingStyleOps = [];
    const whenStyleReady = (operation) => {
      if (styleReady) {
        operation();
      } else {
        pendingStyleOps.push(operation);
      }
    };

    const sheetInsets = () => {
      const sheet = document.querySelector(".ph-sheet");
      const mapRect = root.getBoundingClientRect();
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (!sheet) return { left: 0, bottom: 0, isDesktop };
      const sheetRect = sheet.getBoundingClientRect();
      if (isDesktop) {
        return {
          left: Math.max(0, sheetRect.right - mapRect.left),
          bottom: 0,
          isDesktop,
        };
      }
      return {
        left: 0,
        bottom: Math.max(0, Math.min(mapRect.bottom, window.innerHeight) - sheetRect.top),
        isDesktop,
      };
    };
    const fitPadding = (base = 40) => {
      const { left, bottom } = sheetInsets();
      return {
        top: base + 8,
        right: base,
        left: left + base,
        bottom: Math.min(bottom + base, root.clientHeight * 0.75),
      };
    };
    const easeToVisible = (lat, lon, zoom) => {
      const { left, bottom } = sheetInsets();
      map.easeTo({
        center: [lon, lat],
        zoom,
        offset: [left / 2, -bottom / 2],
        duration: 450,
      });
    };
    const fitRadius = (lat, lon, radiusM) => {
      const bounds = [];
      extendBoundsWithGeometry(bounds, radiusCirclePolygon(lat, lon, radiusM, 16));
      const box = boundsToLngLatBounds(bounds);
      if (box) map.fitBounds(box, { padding: fitPadding(28), duration: 450 });
    };

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
      this.dispatchEvent(
        new CustomEvent("operational-layer-selected", { bubbles: true, detail: item }),
      );
    };

    const featureForItem = (layerKey, item) => {
      const key = item.geometryKey || itemRenderKey(item);
      itemsByFeatureKeyByLayer.get(layerKey).set(key, item);
      const kindLayer = contextLayerForKind(item.kind);
      const properties = {
        __key: key,
        kind: item.kind,
        layerKey: kindLayer,
        customers: Number(item.customersAffected) || 0,
        isRegional: item.kind === "regional_metric",
      };
      if (item.geometry && ["Polygon", "MultiPolygon"].includes(item.geometry.type)) {
        return { type: "Feature", properties, geometry: item.geometry };
      }
      if (item.lat != null && item.lon != null) {
        return {
          type: "Feature",
          properties,
          geometry: { type: "Point", coordinates: [Number(item.lon), Number(item.lat)] },
        };
      }
      return null;
    };

    const setSourceData = (layerKey) => {
      const sourceId = LAYER_SOURCE_BY_KEY[layerKey];
      whenStyleReady(() => {
        const source = map.getSource(sourceId);
        if (!source) return;
        source.setData({
          type: "FeatureCollection",
          features: featuresByLayerKey.get(layerKey) || [],
        });
      });
    };

    const rebuildLayerFeatures = (layerKey) => {
      const features = [];
      itemsByFeatureKeyByLayer.set(layerKey, new Map());
      for (const item of focusItems) {
        if (contextLayerForKind(item.kind) !== layerKey) continue;
        if (item.deferGeometry && !item.geometry && item.lat == null) continue;
        const feature = featureForItem(layerKey, item);
        if (feature) features.push(feature);
      }
      featuresByLayerKey.set(layerKey, features);
      setSourceData(layerKey);
    };

    const updateLayerItems = (layerKey, matches) => {
      focusItems = [
        ...focusItems.filter((item) => contextLayerForKind(item.kind) !== layerKey),
        ...(matches || []),
      ];
      rebuildLayerFeatures(layerKey);
    };

    const setSelection = (key) => {
      whenStyleReady(() => {
        const filter = ["==", ["get", "__key"], key ?? "__none__"];
        if (map.getLayer("ph-selected-line")) map.setFilter("ph-selected-line", filter);
        if (map.getLayer("ph-selected-point")) map.setFilter("ph-selected-point", filter);
      });
    };

    const setFocusGeometry = (geometry) => {
      whenStyleReady(() => {
        const source = map.getSource("ph-focus");
        if (!source) return;
        source.setData({
          type: "FeatureCollection",
          features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [],
        });
      });
    };

    const itemMatchesFocus = (detail, item) => {
      if (detail.kind && item.kind && detail.kind !== item.kind) return false;
      if (detail.geometryKey && item.geometryKey) return detail.geometryKey === item.geometryKey;
      if (detail.startTime && item.startTime && detail.startTime !== item.startTime) return false;
      if (
        detail.customersAffected != null &&
        item.customersAffected != null &&
        Number(detail.customersAffected) !== Number(item.customersAffected)
      ) {
        return false;
      }
      if (detail.lat != null && item.lat != null) {
        return (
          Math.abs(Number(detail.lat) - Number(item.lat)) < 0.0005 &&
          Math.abs(Number(detail.lon) - Number(item.lon)) < 0.0005
        );
      }
      return true;
    };
    const findFocusMatch = (detail) => focusItems.find((item) => itemMatchesFocus(detail, item));

    const focusMap = (rawDetail, { remember = true } = {}) => {
      const detail = rawDetail || {};
      const matchedItem = findFocusMatch(detail) || detail;
      if (remember) {
        activeMapFocus = matchedItem;
        if (["outage", "planned", "previous_outage"].includes(matchedItem.kind)) {
          showOperational(matchedItem);
        } else if (matchedItem.kind === "disclosure" && matchedItem.recordCount != null) {
          showDisclosure(matchedItem);
        } else if (matchedItem.kind === "regional_metric" && matchedItem.metrics) {
          showRegionalMetric(matchedItem);
        }
      }
      this.dataset.activeFocusKind = matchedItem.kind || "";
      this.dataset.activeFocusLabel = matchedItem.label || "";
      this.dataset.activeFocusStartTime = matchedItem.startTime || "";
      setSelection(matchedItem.geometryKey || itemRenderKey(matchedItem));
      map.resize();
      const geometry = matchedItem.geometry || detail.geometry;
      setFocusGeometry(geometry || null);
      if (geometry) {
        const bounds = [];
        extendBoundsWithGeometry(bounds, geometry);
        const box = boundsToLngLatBounds(bounds);
        if (box) {
          map.fitBounds(box, { padding: fitPadding(40), maxZoom: 15, duration: 450 });
          return;
        }
      }
      const lat = Number(matchedItem.lat ?? detail.lat);
      const lon = Number(matchedItem.lon ?? detail.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        easeToVisible(lat, lon, Math.max(map.getZoom(), 12));
      }
    };

    this.handleMapFocus = (event) => {
      if (!this.isConnected || this.getBoundingClientRect().width === 0) return;
      const detail = event.detail || {};
      focusMap(detail);
      if (window.pendingMapFocus === detail) window.pendingMapFocus = null;
    };
    document.addEventListener("map-focus", this.handleMapFocus);

    focusItems = [...(data.matches || [])];

    const initialBounds = () => {
      const bounds = [];
      for (const item of focusItems) {
        if (contextLayerForKind(item.kind) !== "current") continue;
        if (item.geometry) extendBoundsWithGeometry(bounds, item.geometry);
        else if (item.lat != null && item.lon != null) {
          bounds.push([Number(item.lon), Number(item.lat)]);
        }
      }
      return bounds;
    };

    const fitStartupExtent = () => {
      if (activeMapFocus) return;
      if (data.center && Number.isFinite(data.radiusM)) {
        fitRadius(data.center[0], data.center[1], data.radiusM);
        return;
      }
      if (data.preserveInitialView && data.center) {
        easeToVisible(data.center[0], data.center[1], (data.zoom || 9) - 1);
        return;
      }
      const bounds = initialBounds();
      const box = boundsToLngLatBounds(bounds);
      if (box && bounds.length > 1) {
        map.fitBounds(box, { padding: fitPadding(32), maxZoom: 14, duration: 0 });
      } else if (data.center) {
        easeToVisible(data.center[0], data.center[1], (data.zoom || 9) - 1);
      }
    };

    map.on("load", () => {
      styleReady = true;
      map.addSource("ph-context", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("ph-previous", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("ph-planned", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("ph-current", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("ph-address", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("ph-focus", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "ph-context-fill",
        type: "fill",
        source: "ph-context",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": DOMAIN_COLORS.context, "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "ph-context-line",
        type: "line",
        source: "ph-context",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "line-color": DOMAIN_COLORS.context,
          "line-width": ["case", ["get", "isRegional"], 1, 1.6],
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "ph-previous-fill",
        type: "fill",
        source: "ph-previous",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": DOMAIN_COLORS.previous, "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "ph-previous-line",
        type: "line",
        source: "ph-previous",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": DOMAIN_COLORS.previous, "line-width": 1.4 },
      });
      map.addLayer({
        id: "ph-previous-point",
        type: "circle",
        source: "ph-previous",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": DOMAIN_COLORS.previous,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "customers"],
            0,
            4,
            500,
            7,
            5000,
            11,
          ],
          "circle-opacity": 0.85,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
        id: "ph-planned-fill",
        type: "fill",
        source: "ph-planned",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": DOMAIN_COLORS.planned, "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "ph-planned-line",
        type: "line",
        source: "ph-planned",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "line-color": DOMAIN_COLORS.planned,
          "line-width": 1.6,
          "line-dasharray": [2.4, 1.6],
        },
      });
      map.addLayer({
        id: "ph-planned-point",
        type: "circle",
        source: "ph-planned",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": DOMAIN_COLORS.planned,
          "circle-radius": 5,
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
        id: "ph-current-fill",
        type: "fill",
        source: "ph-current",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": DOMAIN_COLORS.current, "fill-opacity": 0.26 },
      });
      map.addLayer({
        id: "ph-current-line",
        type: "line",
        source: "ph-current",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": DOMAIN_COLORS.current, "line-width": 1.8 },
      });
      map.addLayer({
        id: "ph-current-point",
        type: "circle",
        source: "ph-current",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": DOMAIN_COLORS.current,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "customers"],
            0,
            5,
            500,
            8,
            5000,
            12,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.4,
        },
      });
      map.addLayer({
        id: "ph-selected-line",
        type: "line",
        source: "ph-current",
        filter: ["==", ["get", "__key"], "__none__"],
        paint: { "line-color": "#1b1b1f", "line-width": 2.4 },
      });
      map.addLayer({
        id: "ph-focus-fill",
        type: "fill",
        source: "ph-focus",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#1b1b1f", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "ph-focus-line",
        type: "line",
        source: "ph-focus",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#1b1b1f", "line-width": 2.2 },
      });
      map.addLayer({
        id: "ph-radius-line",
        type: "line",
        source: "ph-address",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "line-color": DOMAIN_COLORS.address,
          "line-width": 1.6,
          "line-dasharray": [2, 2],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "ph-radius-fill",
        type: "fill",
        source: "ph-address",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": DOMAIN_COLORS.address, "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "ph-address-halo",
        type: "circle",
        source: "ph-address",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": DOMAIN_COLORS.address,
          "circle-radius": 11,
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "ph-address-dot",
        type: "circle",
        source: "ph-address",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": DOMAIN_COLORS.address,
          "circle-radius": 6.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.4,
        },
      });

      if (data.center && data.showAddressMarker !== false) {
        const addressFeatures = [
          {
            type: "Feature",
            properties: { label: data.addressLabel || "" },
            geometry: { type: "Point", coordinates: [data.center[1], data.center[0]] },
          },
        ];
        if (Number.isFinite(data.radiusM)) {
          addressFeatures.push({
            type: "Feature",
            properties: {},
            geometry: radiusCirclePolygon(data.center[0], data.center[1], data.radiusM),
          });
        }
        map.getSource("ph-address").setData({
          type: "FeatureCollection",
          features: addressFeatures,
        });
      }

      const clickableLayers = [
        "ph-current-fill",
        "ph-current-point",
        "ph-planned-fill",
        "ph-planned-point",
        "ph-previous-fill",
        "ph-previous-point",
        "ph-context-fill",
      ];
      for (const layerId of clickableLayers) {
        map.on("click", layerId, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const item = itemsByFeatureKeyByLayer
            .get(feature.properties.layerKey)
            ?.get(feature.properties.__key);
          if (!item) return;
          event.preventDefault?.();
          setSelection(feature.properties.__key);
          if (item.kind === "disclosure") showDisclosure(item);
          else if (item.kind === "regional_metric") showRegionalMetric(item);
          else showOperational(item);
        });
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      for (const operation of pendingStyleOps.splice(0)) operation();
      for (const layerKey of Object.keys(LAYER_SOURCE_BY_KEY)) rebuildLayerFeatures(layerKey);
      fitStartupExtent();
      const focusDetail = window.pendingMapFocus || activeMapFocus;
      if (focusDetail) {
        focusMap(focusDetail);
        if (window.pendingMapFocus === focusDetail) window.pendingMapFocus = null;
      }
    });

    const fetchDeferredGeometries = (items) => {
      if (!data.contextGeometryUrl) return;
      if (!items.some((item) => item.deferGeometry && item.geometryKey)) return;
      fetch(data.contextGeometryUrl, { headers: { Accept: "application/json" } })
        .then((response) => (response.ok ? response.json() : { geometries: [] }))
        .then((payload) => {
          const geometries = new Map(
            (payload.geometries || []).map((entry) => [entry.geometryKey, entry.geometry]),
          );
          let touched = false;
          for (const item of focusItems) {
            if (!item.deferGeometry || !item.geometryKey || item.geometry) continue;
            const geometry = geometries.get(item.geometryKey);
            if (geometry) {
              item.geometry = geometry;
              touched = true;
            }
          }
          if (touched) {
            for (const layerKey of Object.keys(LAYER_SOURCE_BY_KEY)) rebuildLayerFeatures(layerKey);
          }
        })
        .catch(() => {});
    };
    fetchDeferredGeometries(focusItems);

    this.handleMapLayerItems = (event) => {
      const { layer, matches } = event.detail || {};
      if (!layer) return;
      activeMapFocus = null;
      setFocusGeometry(null);
      setSelection(null);
      updateLayerItems(layer, matches || []);
      fetchDeferredGeometries(matches || []);
    };
    this.handleMapAddress = (event) => {
      const detail = event.detail || {};
      whenStyleReady(() => {
        const source = map.getSource("ph-address");
        if (!source) return;
        if (!detail.center) {
          source.setData({ type: "FeatureCollection", features: [] });
          return;
        }
        const [lat, lon] = detail.center;
        const features = [
          {
            type: "Feature",
            properties: { label: detail.addressLabel || "" },
            geometry: { type: "Point", coordinates: [lon, lat] },
          },
        ];
        if (Number.isFinite(detail.radiusM)) {
          features.push({
            type: "Feature",
            properties: {},
            geometry: radiusCirclePolygon(lat, lon, detail.radiusM),
          });
        }
        source.setData({ type: "FeatureCollection", features });
        if (Number.isFinite(detail.radiusM)) {
          fitRadius(lat, lon, detail.radiusM);
        } else {
          easeToVisible(lat, lon, detail.zoom ? detail.zoom - 1 : 12);
        }
      });
    };
    this.handleSheetInsetChange = () => {
      map.resize();
      if (activeMapFocus) focusMap(activeMapFocus, { remember: false });
    };
    document.addEventListener("map-address", this.handleMapAddress);
    document.addEventListener("map-layer-items", this.handleMapLayerItems);
    document.addEventListener("sheet-inset-change", this.handleSheetInsetChange);

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      this.resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this.handleMapFocus) document.removeEventListener("map-focus", this.handleMapFocus);
    if (this.handleMapAddress) document.removeEventListener("map-address", this.handleMapAddress);
    if (this.handleMapLayerItems)
      document.removeEventListener("map-layer-items", this.handleMapLayerItems);
    if (this.handleSheetInsetChange)
      document.removeEventListener("sheet-inset-change", this.handleSheetInsetChange);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
