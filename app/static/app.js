import { DaiDetailPanel } from "./detail-panels.js?v=20260613modules";
import { OutageMap } from "./outage-map.js?v=20260613modules";
import {
  attachAddressAutocomplete,
  attachLocationSearch,
  attachMapFocusCards,
  attachSearchRouting,
  hydrateTimeLabels,
  registerServiceWorker,
  reloadOnHistoryNavigation,
  restoreSearchInputFromUrl,
  showSearchLoading,
  syncLanguageForm,
  updateShellState,
} from "./search.js?v=20260613modules";
import { attachMapLayerToggles } from "./side-panel.js?v=20260613modules";

if (!customElements.get("dai-detail-panel")) {
  customElements.define("dai-detail-panel", DaiDetailPanel);
}

if (!customElements.get("outage-map")) {
  customElements.define("outage-map", OutageMap);
}

function bindPageInteractions() {
  syncLanguageForm();
  attachAddressAutocomplete();
  attachLocationSearch();
  attachSearchRouting();
  attachMapFocusCards();
  attachMapLayerToggles();
  hydrateTimeLabels();
  updateShellState();
}

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  reloadOnHistoryNavigation();
  restoreSearchInputFromUrl();
  bindPageInteractions();
  showSearchLoading(false);
  document.body.addEventListener("input", syncLanguageForm);
  document.body.addEventListener("change", syncLanguageForm);
});

document.body.addEventListener("htmx:afterSwap", () => {
  bindPageInteractions();
});
