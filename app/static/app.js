import { DaiDetailPanel } from "./detail-panels.js?v=23e7467abe97";
import {
  registerServiceWorker,
  reloadOnHistoryNavigation,
  restoreSearchInputFromUrl,
} from "./search.js?v=23e7467abe97";
import { initSheet } from "./sheet.js?v=23e7467abe97";

const ASSET_VERSION = new URL(import.meta.url).searchParams.get("v") || "";

if (!customElements.get("dai-detail-panel")) {
  customElements.define("dai-detail-panel", DaiDetailPanel);
}

function loadStylesheet(url) {
  const existing = document.querySelector(`link[rel="stylesheet"][href="${url}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error(`Could not load ${url}`)), {
      once: true,
    });
    document.head.append(link);
  });
}

async function loadMap() {
  const mapElement = document.querySelector("outage-map");
  if (!mapElement || customElements.get("outage-map")) return;
  try {
    const [{ OutageMap }] = await Promise.all([
      import(mapElement.dataset.mapModuleUrl),
      loadStylesheet(mapElement.dataset.mapStylesheetUrl),
    ]);
    if (!customElements.get("outage-map")) customElements.define("outage-map", OutageMap);
  } catch (error) {
    mapElement.dataset.mapLoadError = "1";
    mapElement.removeAttribute("aria-busy");
    const loading = mapElement.querySelector("[data-map-loading]");
    if (loading) loading.textContent = mapElement.dataset.mapUnavailableLabel || "Map unavailable.";
    console.error("Map loading failed", error);
  }
}

function scheduleMapLoad() {
  const start = () => {
    let started = false;
    const loadOnce = () => {
      if (started) return;
      started = true;
      void loadMap();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(loadOnce, { timeout: 250 });
      // Safari can expose requestIdleCallback without delivering it promptly.
      window.setTimeout(loadOnce, 500);
    } else {
      window.setTimeout(loadOnce, 0);
    }
  };
  if (document.readyState !== "loading") {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
}

function boot() {
  registerServiceWorker(ASSET_VERSION);
  reloadOnHistoryNavigation();
  restoreSearchInputFromUrl();
  initSheet();
  scheduleMapLoad();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
