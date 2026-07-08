import { formatRelativeTime } from "./ui-format.js?v=20260707c";

let autocompleteTimer = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Installability should never block the core search/map experience.
    });
  });
}

export function reloadOnHistoryNavigation() {
  window.addEventListener("popstate", () => {
    window.location.reload();
  });
}

export function restoreSearchInputFromUrl() {
  const input = document.querySelector("#address-input");
  if (!input || input.value) return;
  const query = new URL(window.location.href).searchParams.get("q") || "";
  if (query) input.value = query;
}

export function updateSearchUrl(params = {}) {
  if (!window.history?.pushState) return;
  const lang = params.lang || document.documentElement.lang || "fr";
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("lang", lang);
  if (params.q) url.searchParams.set("q", params.q);
  if (params.latitude && params.longitude) {
    url.searchParams.set("lat", params.latitude);
    url.searchParams.set("lon", params.longitude);
  }
  if (params.accuracy) url.searchParams.set("accuracy_m", params.accuracy);
  window.history.pushState({ pannesSearch: true }, "", url);
}

export function hydrateTimeLabels(root = document) {
  const now = new Date();
  for (const element of root.querySelectorAll("[data-relative-time]")) {
    element.textContent = formatRelativeTime(element.dataset.relativeTime, {}, now);
  }
}

export function attachComparisonTray() {
  if (document.documentElement.dataset.compareTrayBound !== "1") {
    document.documentElement.dataset.compareTrayBound = "1";
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-compare-add]");
      if (!button) return;
      event.preventDefault();
      const address =
        button.dataset.compareAddress ||
        document.querySelector("#address-input")?.value ||
        window.location.search;
      const next = {
        address,
        count: Number(button.dataset.compareCount || 0),
        radiusKm: button.dataset.compareRadius || "5",
      };
      const existing = readComparedItems().filter((item) => item.address !== next.address);
      writeComparedItems([next, ...existing]);
      renderComparisonTray();
    });
  }
  renderComparisonTray();
}

const COMPARE_STORAGE_KEY = "pannesComparedAddresses";

function compareLabels() {
  const lang = document.documentElement.lang || "fr";
  return lang === "fr"
    ? { empty: "Aucune adresse comparée.", clear: "Effacer" }
    : { empty: "No compared addresses yet.", clear: "Clear" };
}

function readComparedItems() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeComparedItems(items) {
  try {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(items.slice(0, 6)));
  } catch (_error) {
    // Comparison is an optional local convenience; storage failures should not block search.
  }
}

function renderComparisonTray() {
  const tray = document.querySelector("[data-compare-tray]");
  if (!tray) return;
  const items = readComparedItems();
  tray.hidden = items.length === 0;
  if (!items.length) {
    tray.replaceChildren();
    return;
  }
  const labels = compareLabels();
  const list = document.createElement("div");
  list.className = "ph-compare-list";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "ph-compare-row";
    const address = document.createElement("span");
    address.className = "ph-compare-address";
    address.textContent = item.address;
    const count = document.createElement("span");
    count.className = "ph-compare-count";
    count.textContent = `${item.count} / ${item.radiusKm} km`;
    row.append(address, count);
    list.append(row);
  }
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "ph-compare-clear";
  clear.textContent = labels.clear;
  clear.addEventListener("click", () => {
    writeComparedItems([]);
    renderComparisonTray();
  });
  tray.replaceChildren(list, clear);
}

export function attachAddressAutocomplete() {
  const input = document.querySelector("#address-input");
  const panel = document.querySelector("#address-suggestions");
  if (!input || !panel || input.dataset.autocompleteBound === "1") return;
  input.dataset.autocompleteBound = "1";

  const closePanel = () => {
    if (autocompleteTimer) {
      window.clearTimeout(autocompleteTimer);
      autocompleteTimer = null;
    }
    panel.classList.add("hidden");
    panel.innerHTML = "";
  };

  const renderSuggestions = (items) => {
    if (!items.length) {
      closePanel();
      return;
    }
    panel.innerHTML = "";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.addressValue = item.value || item.label || "";
      button.dataset.addressLabel = item.label || item.value || "";

      const primary = document.createElement("span");
      primary.className = "ph-suggestion-primary";
      primary.textContent = item.value || item.label || "";

      const secondary = document.createElement("span");
      secondary.className = "ph-suggestion-secondary";
      secondary.textContent = item.label || item.value || "";

      button.append(primary, secondary);
      panel.appendChild(button);
    }
    panel.classList.remove("hidden");
  };

  const fetchSuggestions = async () => {
    const query = input.value.trim();
    if (query.length < 3) {
      closePanel();
      return;
    }
    const url = new URL(input.dataset.autocompleteUrl, window.location.origin);
    url.searchParams.set("q", query);
    url.searchParams.set("lang", input.dataset.lang || document.documentElement.lang || "fr");
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        closePanel();
        return;
      }
      const payload = await response.json();
      renderSuggestions(payload.suggestions || []);
    } catch (_error) {
      closePanel();
    }
  };

  input.addEventListener("input", () => {
    if (autocompleteTimer) window.clearTimeout(autocompleteTimer);
    autocompleteTimer = window.setTimeout(fetchSuggestions, 180);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 3) {
      fetchSuggestions();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePanel();
    }
  });

  input.form?.addEventListener("submit", closePanel);

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-address-value]");
    if (!button) return;
    input.value = button.dataset.addressValue || button.dataset.addressLabel || "";
    closePanel();
    input.form?.requestSubmit();
  });

  document.addEventListener("click", (event) => {
    if (event.target === input || panel.contains(event.target)) return;
    closePanel();
  });
}
