import { phIcon, replaceWithIconText } from "./icons.js?v=20260613modules";
import {
  escapeHtml,
  formatPlannedScheduleParts,
  formatPreviousTimeParts,
  formatRelativeTime,
} from "./ui-format.js?v=20260608compact";

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

export function syncLanguageForm() {
  const searchForm = document.querySelector("#search-form");
  const languageForm = document.querySelector("#language-form");
  if (!searchForm || !languageForm) return;
  const setSyncedValue = (name, value) => {
    const field = languageForm.querySelector(`[data-sync="${name}"]`);
    if (!field) return;
    field.value = value;
    field.disabled = value === "";
  };
  const q = searchForm.querySelector('[name="q"]')?.value || "";
  const latitude = searchForm.querySelector('[name="latitude"]')?.value || "";
  const longitude = searchForm.querySelector('[name="longitude"]')?.value || "";
  const accuracy = searchForm.querySelector('[name="accuracy_m"]')?.value || "";
  const preserveLocation = isCurrentLocationText(q) && latitude && longitude;
  setSyncedValue("q", preserveLocation ? "" : q);
  setSyncedValue("latitude", preserveLocation ? latitude : "");
  setSyncedValue("longitude", preserveLocation ? longitude : "");
  setSyncedValue("accuracy_m", preserveLocation ? accuracy : "");
}

export function updateSearchUrl(params = {}) {
  if (!window.history?.pushState) return;
  const lang =
    params.lang ||
    document.querySelector('#search-form [name="lang"]')?.value ||
    document.documentElement.lang ||
    "fr";
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

export function isCurrentLocationText(value = "") {
  const normalized = value.toLowerCase();
  return normalized.startsWith("current location") || normalized.startsWith("position actuelle");
}

export function hydrateTimeLabels(root = document) {
  const now = new Date();
  for (const element of root.querySelectorAll("[data-relative-time]")) {
    const text = formatRelativeTime(element.dataset.relativeTime, {}, now);
    if (element.classList.contains("ph-row-pill-current-time")) {
      replaceWithIconText(element, "clock-rewind", text);
    } else {
      element.textContent = text;
    }
  }
  for (const element of root.querySelectorAll("[data-planned-schedule]")) {
    const parts = formatPlannedScheduleParts(
      element.dataset.plannedStart,
      element.dataset.plannedEnd,
      {},
    );
    const scheduleElement = element.querySelector("[data-planned-schedule-label]");
    const durationElement = element.querySelector("[data-planned-duration]");
    if (scheduleElement) replaceWithIconText(scheduleElement, "calendar", parts.schedule);
    if (durationElement) {
      replaceWithIconText(durationElement, "clock", parts.duration);
      durationElement.hidden = !parts.duration;
    }
  }
  for (const element of root.querySelectorAll("[data-previous-time]")) {
    const parts = formatPreviousTimeParts(element.dataset.previousTime, {});
    const dateElement = element.querySelector("[data-previous-date]");
    const timeElement = element.querySelector("[data-previous-clock]");
    if (dateElement) replaceWithIconText(dateElement, "calendar", parts.date);
    if (timeElement) {
      replaceWithIconText(timeElement, "clock", parts.time);
      timeElement.hidden = !parts.time;
    }
  }
}

export function attachComparisonTray() {
  if (document.documentElement.dataset.compareTrayBound === "1") return;
  document.documentElement.dataset.compareTrayBound = "1";
  const storageKey = "pannesComparedAddresses";
  const lang = document.documentElement.lang || "fr";
  const labels =
    lang === "fr"
      ? { empty: "Aucune adresse comparée.", clear: "Effacer", suffix: "dans" }
      : { empty: "No compared addresses yet.", clear: "Clear", suffix: "within" };

  const readItems = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const writeItems = (items) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 6)));
    } catch (_error) {
      // Comparison is an optional local convenience; storage failures should not block search.
    }
  };

  const render = () => {
    const tray = document.querySelector("[data-compare-tray]");
    if (!tray) return;
    const items = readItems();
    tray.hidden = items.length === 0;
    if (!items.length) {
      tray.replaceChildren();
      return;
    }
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
      writeItems([]);
      render();
    });
    tray.replaceChildren(list, clear);
  };

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
    const existing = readItems().filter((item) => item.address !== next.address);
    writeItems([next, ...existing]);
    render();
  });

  render();
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
      button.className =
        "block w-full px-3 py-2 text-left text-sm text-[#223654] hover:bg-[#f1f1f2]";
      button.dataset.addressValue = item.value || item.label || "";
      button.dataset.addressLabel = item.label || item.value || "";

      const primary = document.createElement("span");
      primary.className = "block font-medium text-[#223654]";
      primary.textContent = item.value || item.label || "";

      const secondary = document.createElement("span");
      secondary.className = "block text-xs text-[#6b778a]";
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
    syncLanguageForm();
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
  input.form?.addEventListener("htmx:beforeRequest", closePanel);

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-address-value]");
    if (!button) return;
    input.value = button.dataset.addressValue || button.dataset.addressLabel || "";
    syncLanguageForm();
    closePanel();
    input.focus();
  });

  document.addEventListener("click", (event) => {
    if (event.target === input || panel.contains(event.target)) return;
    closePanel();
  });
}

export function showSearchLoading(show) {
  const loading = document.querySelector("#search-loading");
  if (!loading) return;
  loading.style.display = show ? "block" : "none";
}

export function attachMobilePanelDrawer() {
  const panel = document.querySelector("#results");
  if (!panel) return;

  let handle = panel.querySelector(".ph-panel-drawer-handle");
  const createdHandle = !handle;
  if (!handle) {
    handle = document.createElement("button");
    handle.type = "button";
    handle.className = "ph-panel-drawer-handle";
    handle.setAttribute("aria-label", "Resize results panel");
    panel.prepend(handle);
  }

  if (handle.dataset.drawerBound === "1") return;
  handle.dataset.drawerBound = "1";
  let dragStartY = 0;
  let dragged = false;
  let suppressClick = false;

  const mobilePanelMinHeight = () => {
    if (!window.matchMedia("(max-width: 767px)").matches) return 136;
    const summaries = Array.from(panel.querySelectorAll(".ph-context-section-summary"));
    if (!summaries.length) return 192;
    const handleHeight = handle.getBoundingClientRect().height || 20;
    const sections = panel.querySelector(".ph-result-sections");
    const sectionStyles = sections ? window.getComputedStyle(sections) : null;
    const sectionPadding = sectionStyles
      ? Number.parseFloat(sectionStyles.paddingTop) + Number.parseFloat(sectionStyles.paddingBottom)
      : 16;
    const gap = sectionStyles ? Number.parseFloat(sectionStyles.rowGap || sectionStyles.gap) : 8;
    const summaryHeight = summaries.reduce(
      (total, summary) => total + summary.getBoundingClientRect().height,
      0,
    );
    return Math.ceil(
      handleHeight + sectionPadding + gap * (summaries.length - 1) + summaryHeight + 24,
    );
  };

  const mobilePanelDefaultHeight = () => {
    const hasSearchContext = !!panel.querySelector(".ph-search-context-list");
    return window.innerHeight * (hasSearchContext ? 0.78 : 0.48);
  };

  const clampHeight = (value) => {
    const min = mobilePanelMinHeight();
    const topbar = document.querySelector(".ph-topbar")?.getBoundingClientRect().height || 100;
    const visibleMapBand = Math.max(48, window.innerHeight * 0.08);
    const max = Math.max(min, window.innerHeight - topbar - visibleMapBand);
    return Math.min(Math.max(value, min), max);
  };

  const syncDrawerState = (height) => {
    const expanded =
      window.matchMedia("(max-width: 767px)").matches && height >= window.innerHeight * 0.54;
    panel.classList.toggle("is-expanded", expanded);
  };

  const setPanelHeight = (clientY) => {
    const nextHeight = clampHeight(window.innerHeight - clientY - 12);
    document.documentElement.style.setProperty("--ph-mobile-panel-height", `${nextHeight}px`);
    syncDrawerState(nextHeight);
  };

  handle.addEventListener("pointerdown", (event) => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    event.preventDefault();
    dragStartY = event.clientY;
    dragged = false;
    handle.setPointerCapture(event.pointerId);
    setPanelHeight(event.clientY);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    if (Math.abs(event.clientY - dragStartY) > 6) {
      dragged = true;
    }
    setPanelHeight(event.clientY);
  });

  handle.addEventListener("pointerup", (event) => {
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    suppressClick = dragged;
  });

  handle.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    const current = panel.getBoundingClientRect().height;
    const target =
      current < window.innerHeight * 0.64 ? window.innerHeight * 0.86 : window.innerHeight * 0.52;
    const nextHeight = clampHeight(target);
    document.documentElement.style.setProperty("--ph-mobile-panel-height", `${nextHeight}px`);
    syncDrawerState(nextHeight);
  });

  if (createdHandle && window.matchMedia("(max-width: 767px)").matches) {
    const nextHeight = clampHeight(mobilePanelDefaultHeight());
    document.documentElement.style.setProperty("--ph-mobile-panel-height", `${nextHeight}px`);
    syncDrawerState(nextHeight);
    return;
  }

  syncDrawerState(panel.getBoundingClientRect().height);
}

export function updateShellState() {
  const hasSearchResults = Array.from(document.querySelectorAll("#results [data-map-focus]")).some(
    (item) => !item.closest(".ph-default-context-list"),
  );
  document.body.classList.toggle("ph-has-results", hasSearchResults);
  attachMobilePanelDrawer();
  if (typeof window.phSyncContextSections === "function") window.phSyncContextSections();
}

export function applyResultsHtml(html, results) {
  const container = document.createElement("div");
  container.innerHTML = html;
  for (const node of Array.from(container.querySelectorAll("[hx-swap-oob]"))) {
    if (!node.id) continue;
    const target = document.getElementById(node.id);
    if (target) {
      target.innerHTML = node.innerHTML;
      if (window.htmx) window.htmx.process(target);
    }
    node.remove();
  }
  results.innerHTML = container.innerHTML;
  updateShellState();
}

export function attachLocationSearch() {
  const button = document.querySelector("#location-search-button");
  const input = document.querySelector("#address-input");
  const results = document.querySelector("#results");
  const searchForm = document.querySelector("#search-form");
  if (!button || !results || button.dataset.locationBound === "1") return;
  button.dataset.locationBound = "1";

  const originalHtml = button.innerHTML;
  const originalAriaLabel = button.getAttribute("aria-label") || button.textContent.trim();
  const currentLocationPrefix = button.dataset.currentLocationLabel || "Current location";
  const locationUnavailable =
    button.dataset.locationUnavailableLabel || "Current location could not be found.";
  const locationDenied =
    button.dataset.locationDeniedLabel ||
    "Location access was not allowed. Search by address instead.";
  const locationTimeout =
    button.dataset.locationTimeoutLabel ||
    "Current location took too long. Search by address instead.";
  const locating = button.dataset.locatingLabel || "Finding location...";

  const renderLocationError = (message) => {
    results.innerHTML = `<div class="rounded-lg border border-[#cb381f] bg-[#ffdbd6] p-4 text-sm text-[#692519] sm:p-6">${escapeHtml(message)}</div>`;
  };

  const finishLocationSearch = () => {
    button.disabled = false;
    button.innerHTML = originalHtml;
    button.setAttribute("aria-label", originalAriaLabel);
    showSearchLoading(false);
  };

  button.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      renderLocationError(locationUnavailable);
      return;
    }

    button.disabled = true;
    button.setAttribute("aria-label", locating);
    button.innerHTML = `<span class="ph-button-spinner" aria-hidden="true"></span><span class="sr-only">${escapeHtml(locating)}</span>`;
    showSearchLoading(true);
    window.pendingMapFocus = null;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const formData = new FormData();
        formData.set(
          "lang",
          searchForm?.querySelector('[name="lang"]')?.value ||
            document.documentElement.lang ||
            "fr",
        );
        formData.set("latitude", String(position.coords.latitude));
        formData.set("longitude", String(position.coords.longitude));
        if (Number.isFinite(position.coords.accuracy)) {
          formData.set("accuracy_m", String(position.coords.accuracy));
        }
        try {
          const response = await fetch(button.dataset.locationUrl, {
            method: "POST",
            headers: { "HX-Request": "true" },
            body: formData,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          applyResultsHtml(html, results);
          updateSearchUrl({
            accuracy: Number.isFinite(position.coords.accuracy)
              ? String(position.coords.accuracy)
              : "",
            lang: formData.get("lang"),
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
          });
          if (window.htmx) window.htmx.process(results);
          attachMapFocusCards();
          if (input) {
            input.value = currentLocationPrefix;
            input.title = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
            searchForm
              ?.querySelector('[name="latitude"]')
              ?.setAttribute("value", String(position.coords.latitude));
            searchForm
              ?.querySelector('[name="longitude"]')
              ?.setAttribute("value", String(position.coords.longitude));
            if (Number.isFinite(position.coords.accuracy)) {
              searchForm
                ?.querySelector('[name="accuracy_m"]')
                ?.setAttribute("value", String(position.coords.accuracy));
            }
            syncLanguageForm();
          }
        } catch (_error) {
          renderLocationError(locationUnavailable);
        } finally {
          finishLocationSearch();
        }
      },
      (error) => {
        const message =
          error?.code === 1
            ? locationDenied
            : error?.code === 3
              ? locationTimeout
              : locationUnavailable;
        renderLocationError(message);
        finishLocationSearch();
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  });
}

export function attachSearchRouting() {
  const searchForm = document.querySelector("#search-form");
  const input = document.querySelector("#address-input");
  const locationButton = document.querySelector("#location-search-button");
  if (!searchForm || !input || !locationButton || searchForm.dataset.routingBound === "1") return;
  searchForm.dataset.routingBound = "1";

  const isCurrentLocationValue = () => isCurrentLocationText(input.value);

  searchForm.addEventListener("htmx:beforeRequest", () => {
    window.pendingMapFocus = null;
    showSearchLoading(true);
  });

  searchForm.addEventListener("htmx:afterRequest", (event) => {
    showSearchLoading(false);
    if (!event.detail.successful || isCurrentLocationValue()) return;
    updateSearchUrl({
      lang: searchForm.querySelector('[name="lang"]')?.value || document.documentElement.lang,
      q: input.value.trim(),
    });
  });

  for (const eventName of ["htmx:responseError", "htmx:sendError", "htmx:timeout"]) {
    searchForm.addEventListener(eventName, () => {
      showSearchLoading(false);
    });
  }

  input.addEventListener("input", () => {
    if (!isCurrentLocationValue()) {
      searchForm.querySelector('[name="latitude"]')?.setAttribute("value", "");
      searchForm.querySelector('[name="longitude"]')?.setAttribute("value", "");
      searchForm.querySelector('[name="accuracy_m"]')?.setAttribute("value", "");
    }
  });

  searchForm.addEventListener("htmx:configRequest", (event) => {
    const latitude = searchForm.querySelector('[name="latitude"]')?.value || "";
    const longitude = searchForm.querySelector('[name="longitude"]')?.value || "";
    if (!latitude || !longitude || !isCurrentLocationValue()) {
      return;
    }
    event.detail.path = locationButton.dataset.locationUrl;
    event.detail.parameters.latitude = latitude;
    event.detail.parameters.longitude = longitude;
    const accuracy = searchForm.querySelector('[name="accuracy_m"]')?.value || "";
    if (accuracy) event.detail.parameters.accuracy_m = accuracy;
  });
}

export function attachMapFocusCards() {
  if (document.body.dataset.mapFocusDelegated === "1") return;
  document.body.dataset.mapFocusDelegated = "1";

  const focusDetailsMatch = (detail, payload) => {
    if (!detail || !payload) return false;
    if (detail.kind && payload.kind && detail.kind !== payload.kind) return false;
    if (detail.geometryKey && payload.geometryKey)
      return detail.geometryKey === payload.geometryKey;
    if (detail.startTime && payload.startTime && detail.startTime !== payload.startTime) {
      return false;
    }
    if (detail.label && payload.label && detail.kind && detail.label !== payload.label)
      return false;
    if (
      detail.customersAffected != null &&
      payload.customersAffected != null &&
      Number(detail.customersAffected) !== Number(payload.customersAffected)
    ) {
      return false;
    }
    if (detail.distanceM != null && payload.distanceM != null) {
      return Math.abs(Number(detail.distanceM) - Number(payload.distanceM)) < 1;
    }
    return true;
  };

  const markActiveFocusCard = (detail) => {
    for (const candidate of document.querySelectorAll("[data-map-focus]")) {
      let selected = false;
      try {
        const payload = JSON.parse(candidate.getAttribute("data-map-focus") || "{}");
        selected = focusDetailsMatch(detail, payload);
      } catch (_error) {
        selected = false;
      }
      candidate.classList.toggle("is-map-selected", selected);
      candidate.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  };

  const matchingLayerItem = (card, detail) => {
    const section = card.closest("[data-layer-section]");
    const matches = section?._layerMatches || [];
    return matches.find((item) => focusDetailsMatch(detail, item));
  };

  const renderImmediateDetail = (card, detail) => {
    const detailPanel = document.querySelector("dai-detail-panel");
    if (!detailPanel) return;
    const match = matchingLayerItem(card, detail);
    if (!match) return;
    if (match.kind === "disclosure" && typeof detailPanel.renderDisclosure === "function") {
      detailPanel.renderDisclosure(match);
    }
    if (
      match.kind === "regional_metric" &&
      typeof detailPanel.renderRegionalMetric === "function"
    ) {
      detailPanel.renderRegionalMetric(match);
    }
  };

  const focusCard = (card) => {
    try {
      const detail = JSON.parse(card.getAttribute("data-map-focus") || "{}");
      markActiveFocusCard(detail);
      renderImmediateDetail(card, detail);
      window.pendingMapFocus = detail;
      if (["disclosure", "regional_metric"].includes(detail.kind)) {
        window.setTimeout(() => {
          document.dispatchEvent(new CustomEvent("map-focus", { detail }));
        }, 0);
        return;
      }
      document.dispatchEvent(new CustomEvent("map-focus", { detail }));
    } catch (_error) {
      // Ignore malformed focus payloads; cards remain normal result rows.
    }
  };

  document.body.addEventListener("click", (event) => {
    const card = event.target.closest("[data-map-focus]");
    if (!card) return;
    focusCard(card);
  });

  document.body.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-map-focus]");
    if (!card) return;
    event.preventDefault();
    focusCard(card);
  });

  for (const eventName of [
    "operational-layer-selected",
    "dai-selected",
    "regional-metric-selected",
  ]) {
    document.body.addEventListener(eventName, (event) => {
      markActiveFocusCard(event.detail || {});
    });
  }
}
