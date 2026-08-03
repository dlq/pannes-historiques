import { DaiDetailPanel } from "./detail-panels.js?v=20260729b";
import {
  registerServiceWorker,
  reloadOnHistoryNavigation,
  restoreSearchInputFromUrl,
} from "./search.js?v=20260729b";
import { initSheet } from "./sheet.js?v=20260729b";

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
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => void loadMap(), { timeout: 250 });
    } else {
      window.setTimeout(() => void loadMap(), 0);
    }
  };
  if (document.readyState !== "loading") {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
}

function boot() {
  registerServiceWorker();
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
