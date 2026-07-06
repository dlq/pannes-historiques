import { DaiDetailPanel } from "./detail-panels.js?v=20260706a";
import { OutageMap } from "./outage-map.js?v=20260706a";
import {
  registerServiceWorker,
  reloadOnHistoryNavigation,
  restoreSearchInputFromUrl,
} from "./search.js?v=20260706a";
import { initSheet } from "./sheet.js?v=20260706e";

if (!customElements.get("dai-detail-panel")) {
  customElements.define("dai-detail-panel", DaiDetailPanel);
}

if (!customElements.get("outage-map")) {
  customElements.define("outage-map", OutageMap);
}

function boot() {
  registerServiceWorker();
  reloadOnHistoryNavigation();
  restoreSearchInputFromUrl();
  initSheet();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
