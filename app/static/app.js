import {
  geometryStyle,
  geometryWeight,
  mapLayerClass,
  mapPane,
  markerStyle,
  metricValue,
} from "./map-layers.js";
import {
  detailFactList,
  escapeHtml,
  fetchJson,
  formatDateTimeCell,
  formatDistanceKm,
  formatDuration,
  hasDistanceValue,
  label,
  localizeCause,
} from "./ui-format.js";

let autocompleteTimer = null;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Installability should never block the core search/map experience.
    });
  });
}

function reloadOnHistoryNavigation() {
  window.addEventListener("popstate", () => {
    window.location.reload();
  });
}

function restoreSearchInputFromUrl() {
  const input = document.querySelector("#address-input");
  if (!input || input.value) return;
  const query = new URL(window.location.href).searchParams.get("q") || "";
  if (query) input.value = query;
}

function syncLanguageForm() {
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

function updateSearchUrl(params = {}) {
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

function isCurrentLocationText(value = "") {
  const normalized = value.toLowerCase();
  return normalized.startsWith("current location") || normalized.startsWith("position actuelle");
}

function attachAddressAutocomplete() {
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

function showSearchLoading(show) {
  const loading = document.querySelector("#search-loading");
  if (!loading) return;
  loading.style.display = show ? "block" : "none";
}

function attachMobilePanelDrawer() {
  const panel = document.querySelector("#results");
  if (!panel) return;

  let handle = panel.querySelector(".ph-panel-drawer-handle");
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

  const clampHeight = (value) => {
    const min = mobilePanelMinHeight();
    const topbar = document.querySelector(".ph-topbar")?.getBoundingClientRect().height || 100;
    const visibleMapBand = Math.max(144, window.innerHeight * 0.22);
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
      current < window.innerHeight * 0.48 ? window.innerHeight * 0.62 : window.innerHeight * 0.36;
    const nextHeight = clampHeight(target);
    document.documentElement.style.setProperty("--ph-mobile-panel-height", `${nextHeight}px`);
    syncDrawerState(nextHeight);
  });

  syncDrawerState(panel.getBoundingClientRect().height);
}

function updateShellState() {
  const hasSearchResults = Array.from(document.querySelectorAll("#results [data-map-focus]")).some(
    (item) => !item.closest(".ph-default-context-list"),
  );
  document.body.classList.toggle("ph-has-results", hasSearchResults);
  attachMobilePanelDrawer();
}

function applyResultsHtml(html, results) {
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

function attachLocationSearch() {
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
            input.value = `${currentLocationPrefix} (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`;
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

function attachSearchRouting() {
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

function attachMapFocusCards() {
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

  const focusCard = (card) => {
    try {
      const detail = JSON.parse(card.getAttribute("data-map-focus") || "{}");
      markActiveFocusCard(detail);
      window.pendingMapFocus = detail;
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

const CONTEXT_LAYER_KINDS = {
  current: ["outage"],
  planned: ["planned"],
  previous: ["previous_outage"],
  published: ["disclosure", "regional_metric"],
};

function contextLayerForKind(kind) {
  for (const [layer, kinds] of Object.entries(CONTEXT_LAYER_KINDS)) {
    if (kinds.includes(kind)) return layer;
  }
  return "current";
}

function buildMapLayerUrl(layer) {
  const url = new URL("/map-layer", window.location.origin);
  const pageUrl = new URL(window.location.href);
  const form = document.querySelector("#search-form");
  const query = form?.querySelector('[name="q"]')?.value?.trim() || pageUrl.searchParams.get("q");
  const latitude =
    form?.querySelector('[name="latitude"]')?.value || pageUrl.searchParams.get("lat");
  const longitude =
    form?.querySelector('[name="longitude"]')?.value || pageUrl.searchParams.get("lon");
  const accuracy =
    form?.querySelector('[name="accuracy_m"]')?.value || pageUrl.searchParams.get("accuracy_m");
  url.searchParams.set("layer", layer);
  url.searchParams.set("lang", document.documentElement.lang || "fr");
  if (query && !isCurrentLocationText(query)) url.searchParams.set("q", query);
  if (latitude && longitude) {
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
  }
  if (accuracy) url.searchParams.set("accuracy_m", accuracy);
  return url;
}

function focusPayloadForItem(item) {
  const payload = {
    kind: item.kind,
    lat: item.lat,
    lon: item.lon,
    geometry: item.geometry,
    geometryKey: item.geometryKey,
    label: item.label,
    startTime: item.startTime,
    customersAffected: item.customersAffected,
    distanceM: item.distanceM,
  };
  for (const key of Object.keys(payload)) {
    if (payload[key] == null) delete payload[key];
  }
  return payload;
}

function renderContextRow(item, labels = {}) {
  const row = document.createElement("article");
  row.className = "ph-context-row ph-match-row";
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  row.setAttribute("data-map-focus", JSON.stringify(focusPayloadForItem(item)));

  const isPublishedContext = item.kind === "disclosure" || item.kind === "regional_metric";
  const left = document.createElement("div");
  left.className = "min-w-0";
  const primary = document.createElement("p");
  primary.className = "truncate font-semibold text-[#095797]";
  if (isPublishedContext) {
    primary.textContent =
      item.label ||
      (item.kind === "regional_metric"
        ? label(labels, "regional_colour_legend", "Regional outage burden")
        : label(labels, "disclosure", "Disclosure"));
  } else {
    const prefix = document.createElement("span");
    prefix.className = "text-[#6b778a]";
    prefix.textContent = `${label(labels, "start", "Start")} `;
    primary.append(
      prefix,
      document.createTextNode(item.startTime || label(labels, "unknown", "Unknown")),
    );
  }
  left.append(primary);

  if (item.kind === "planned") {
    const secondary = document.createElement("p");
    secondary.className = "truncate text-[#4e5662]";
    secondary.textContent = `${label(labels, "end", "End")} ${item.endTime || label(labels, "unknown", "Unknown")}`;
    left.append(secondary);
  } else if (item.kind === "outage") {
    const secondary = document.createElement("p");
    secondary.className = "truncate text-[#4e5662]";
    secondary.textContent = item.statusLabel || label(labels, "unknown", "Unknown");
    left.append(secondary);
  } else if (item.kind === "regional_metric") {
    const secondary = document.createElement("p");
    secondary.className = "truncate text-[#4e5662]";
    secondary.textContent = label(labels, "regional_colour_legend", "Regional outage burden");
    left.append(secondary);
  }

  const pill = document.createElement("p");
  const pillColor =
    item.kind === "outage"
      ? "bg-[#f8e69a]"
      : item.kind === "planned"
        ? "bg-[#dae6f0]"
        : "bg-[#f1f1f2]";
  pill.className = `ph-context-pill ${pillColor}`;
  if (item.kind === "disclosure") {
    pill.textContent = `${item.recordCount || 0} ${label(labels, "rows", "rows")}`;
  } else if (item.kind === "regional_metric") {
    pill.textContent = `${item.outageCount || 0} ${label(labels, "outages", "Outages")}`;
  } else {
    pill.textContent = `${item.customersAffected || 0} ${label(labels, "clients", "clients")}`;
  }
  row.append(left, pill);
  return row;
}

function attachMapLayerToggles() {
  if (document.body.dataset.mapLayerTogglesBound === "1") return;
  document.body.dataset.mapLayerTogglesBound = "1";

  const setToggleState = (button, on) => {
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = on
      ? "Visible"
      : document.documentElement.lang === "fr"
        ? "Afficher"
        : "Show";
  };

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-layer-toggle]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const section = button.closest("[data-layer-section]");
    const layer = button.dataset.layerToggle;
    const rows = section?.querySelector(".ph-context-rows");
    if (!section || !layer || !rows) return;

    const isOn = button.getAttribute("aria-pressed") === "true";
    if (isOn) {
      setToggleState(button, false);
      section.open = false;
      document.dispatchEvent(
        new CustomEvent("map-layer-toggle", { detail: { layer, enabled: false } }),
      );
      return;
    }

    setToggleState(button, true);
    section.open = true;
    document.dispatchEvent(
      new CustomEvent("map-layer-toggle", { detail: { layer, enabled: true } }),
    );
    if (section.dataset.layerLoaded === "true" && section._layerMatches) {
      document.dispatchEvent(
        new CustomEvent("map-layer-items", {
          detail: { layer, matches: section._layerMatches },
        }),
      );
      return;
    }

    button.disabled = true;
    rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Chargement..." : "Loading..."}</p>`;
    try {
      const payload = await fetchJson(buildMapLayerUrl(layer), {
        headers: { Accept: "application/json" },
      });
      const matches = (payload.matches || []).filter(
        (item) => contextLayerForKind(item.kind) === layer,
      );
      const map = document.querySelector("outage-map");
      const labels = map ? JSON.parse(map.getAttribute("data-map") || "{}").labels || {} : {};
      rows.innerHTML = "";
      for (const item of matches) rows.appendChild(renderContextRow(item, labels));
      if (!matches.length) {
        rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Aucune donnee pour cette couche." : "No data for this layer."}</p>`;
      }
      section.dataset.layerLoaded = "true";
      section._layerMatches = matches;
      const count = section.querySelector(".ph-context-section-summary > span");
      if (count) {
        const noun =
          layer === "current"
            ? label(labels, "feed_areas", "feed areas")
            : label(labels, "rows", "rows");
        count.textContent = `${matches.length} ${noun}`;
      }
      document.dispatchEvent(new CustomEvent("map-layer-items", { detail: { layer, matches } }));
    } catch (_error) {
      setToggleState(button, false);
      rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Cette couche n'a pas pu etre chargee." : "This layer could not be loaded."}</p>`;
    } finally {
      button.disabled = false;
    }
  });
}

function disclosurePopup(item, labels = {}) {
  const causes = (item.topCauses || [])
    .map(
      (cause) => `<li>${escapeHtml(localizeCause(cause.cause))} (${escapeHtml(cause.count)})</li>`,
    )
    .join("");
  const events = (item.recentEvents || [])
    .map(
      (event) =>
        `<tr class="border-b border-blue-100 last:border-0">
          <td class="px-1 py-1.5 align-top">${formatDateTimeCell(event.start_time, labels)}</td>
          <td class="px-1 py-1.5 align-top">${formatDateTimeCell(event.end_time, labels)}</td>
          <td class="truncate px-1 py-1.5 align-top" title="${escapeHtml(event.row_area || "")}">${escapeHtml(event.row_area || "")}</td>
          <td class="truncate px-1 py-1.5 align-top" title="${escapeHtml(localizeCause(event.cause) || label(labels, "unknown", "unknown"))}">${escapeHtml(localizeCause(event.cause) || label(labels, "unknown", "unknown"))}</td>
          <td class="px-1 py-1.5 text-right align-top">${escapeHtml(formatDuration(event.duration_seconds, labels))}</td>
          <td class="px-1 py-1.5 text-right align-top">${escapeHtml(event.customers_affected ?? "")}</td>
        </tr>`,
    )
    .join("");
  return `
      <div class="flex h-full min-h-0 flex-col gap-4 text-sm">
      ${causes ? `<section><div class="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b778a]">${escapeHtml(label(labels, "top_causes", "Top causes"))}</div><ul class="ml-4 mt-2 list-disc leading-snug text-[#223654]">${causes}</ul></section>` : ""}
      ${
        events
          ? `<div class="flex min-h-0 flex-1 flex-col">
              <div class="overflow-hidden rounded-md border border-[#d7dde6] bg-white">
              <div class="border-b border-[#d7dde6] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b778a]">${escapeHtml(label(labels, "extracted_rows", "Extracted rows"))}</div>
              <div class="min-h-0 flex-1 overflow-auto">
                <table class="w-full min-w-[40rem] table-fixed text-left text-xs">
                  <colgroup>
                    <col class="w-[18%]">
                    <col class="w-[18%]">
                    <col class="w-[20%]">
                    <col class="w-[24%]">
                    <col class="w-[10%]">
                    <col class="w-[10%]">
                  </colgroup>
                  <thead class="sticky top-0 bg-[#f1f1f2] uppercase tracking-[0.08em] text-[#6b778a]">
                    <tr>
                      <th class="px-1 py-1.5">${escapeHtml(label(labels, "start", "Start"))}</th>
                      <th class="px-1 py-1.5">${escapeHtml(label(labels, "end", "End"))}</th>
                      <th class="px-1 py-1.5">${escapeHtml(label(labels, "area", "Area"))}</th>
                      <th class="px-1 py-1.5">${escapeHtml(label(labels, "cause", "Cause"))}</th>
                      <th class="px-1 py-1.5 text-right">${escapeHtml(label(labels, "duration_short", "Dur."))}</th>
                      <th class="px-1 py-1.5 text-right">${escapeHtml(label(labels, "clients", "clients"))}</th>
                    </tr>
                  </thead>
                  <tbody class="text-slate-700">${events}</tbody>
                </table>
              </div>
              </div>
            </div>`
          : ""
      }
    </div>
  `;
}

function disclosureTooltip(item, labels = {}) {
  return `${escapeHtml(item.label || item.sourceDai || "DAI")} · ${escapeHtml(item.regionLabel || label(labels, "disclosure_region", "Disclosure region"))}`;
}

function disclosureSummaryPopup(item, labels = {}) {
  const sources = (item.sourceDais || []).join(", ") || item.sourceDai || "";
  return `
    <div class="space-y-1 text-sm">
      <div class="font-semibold text-[#223654]">${escapeHtml(item.label || "")}</div>
      ${sources ? `<div class="text-[#4e5662]">${escapeHtml(sources)}</div>` : ""}
      <div>${escapeHtml(item.recordCount || 0)} ${escapeHtml(label(labels, "published_dai_records", "published DAI records"))}</div>
      <div class="text-xs text-[#6b778a]">${escapeHtml(label(labels, "disclosure_events", "Published events"))}: ${escapeHtml(item.startMin || label(labels, "unknown", "unknown"))} - ${escapeHtml(item.startMax || label(labels, "unknown", "unknown"))}</div>
    </div>
  `;
}

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

function operationalTooltip(item, labels = {}) {
  if (item.kind === "previous_outage") {
    return `${escapeHtml(item.kindLabel || "Previously seen outage")} · ${escapeHtml(item.eventCount || 0)} ${escapeHtml(item.eventCountLabel || "retained outages")}`;
  }
  const parts = [
    item.kindLabel || item.kind || "Outage",
    item.matchLabel || item.matchType,
    item.customersAffected == null
      ? null
      : `${item.customersAffected} ${label(labels, "clients", "clients")}`,
    item.distanceM == null ? null : formatDistanceKm(item.distanceM, labels),
  ].filter(Boolean);
  return parts.map((part) => escapeHtml(part)).join(" · ");
}

function regionalBurdenText(item, labels = {}) {
  return (
    item.regionalBurdenLabel || label(labels, "regional_colour_legend", "Regional outage burden")
  );
}

function regionalMetricTooltip(item, labels = {}) {
  const value = metricValue(item);
  if (value == null) {
    return `${escapeHtml(item.label || "Region")} · ${escapeHtml(regionalBurdenText(item, labels))}: unavailable`;
  }
  return `${escapeHtml(item.label || "Region")} · ${escapeHtml(regionalBurdenText(item, labels))}: ${escapeHtml(value)}`;
}

class DaiDetailPanel extends HTMLElement {
  uiLabels() {
    return this.labels || {};
  }

  connectedCallback() {
    if (this.dataset.closeBound !== "1") {
      this.dataset.closeBound = "1";
      this.addEventListener("click", (event) => {
        if (!event.target.closest("[data-dai-detail-close]")) return;
        this.renderEmpty();
      });
    }
    this.renderEmpty();
  }

  renderEmpty() {
    this.hidden = true;
    this.innerHTML = "";
  }

  renderDisclosure(item) {
    const labels = this.uiLabels();
    const title = this.getAttribute("title-label") || "DAI details";
    const sourceLabel = (item.sourceDais || []).join(", ") || item.sourceDai || "";
    const factList = detailFactList([
      [label(labels, "rows", "rows"), `${item.recordCount || 0} ${label(labels, "rows", "rows")}`],
      [
        label(labels, "period", "Period"),
        `${item.startMin || label(labels, "unknown", "unknown")} - ${item.startMax || label(labels, "unknown", "unknown")}`,
      ],
      [
        label(labels, "cumulative_disclosed_duration", "Cumulative disclosed outage duration"),
        formatDuration(item.durationSecondsTotal, labels),
      ],
      ["DAI", sourceLabel],
    ]);
    this.hidden = false;
    this.innerHTML = `
      <div class="flex h-full min-h-0 flex-col rounded-lg border border-[#c5cad2] bg-white/95 p-4 shadow-lg">
        <div class="mb-3 flex flex-none items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#095797]">${escapeHtml(title)}</p>
            <h4 class="mt-1 text-base font-semibold text-[#223654]">${escapeHtml(item.label || "")}</h4>
            ${sourceLabel ? `<p class="mt-1 text-sm text-[#4e5662]">${escapeHtml(sourceLabel)}</p>` : ""}
          </div>
          <button type="button" class="shrink-0 rounded-md border border-[#c5cad2] bg-white px-2 py-1 text-sm font-semibold text-[#4e5662] hover:bg-[#f1f1f2]" data-dai-detail-close aria-label="${escapeHtml(label(labels, "close", "Close"))}">×</button>
        </div>
        ${factList}
        <div class="min-h-0 flex-1 overflow-hidden pr-2">
          ${disclosurePopup(item, labels)}
        </div>
      </div>
    `;
  }

  renderRegionalMetric(item) {
    const labels = this.uiLabels();
    const title = this.getAttribute("title-label") || "DAI details";
    const burdenLabel = regionalBurdenText(item, labels);
    const rows = (item.metrics || [])
      .map(
        (metric) => `
          <tr class="border-b border-rose-100 last:border-0">
            <td class="py-2 pr-3 font-medium text-slate-950">${escapeHtml(metric.period_label || metric.year || label(labels, "unknown", "unknown"))}</td>
            <td class="py-2 pr-3">${escapeHtml(metric.source_dai || "")}</td>
            <td class="py-2 pr-3 text-right">${escapeHtml(metric.outage_count ?? label(labels, "unknown", "unknown"))}</td>
            <td class="py-2 pr-3 text-right">${escapeHtml(metric.average_duration_minutes ?? label(labels, "unknown", "unknown"))}</td>
            <td class="py-2 pr-3 text-right">${escapeHtml(metric.continuity_index_minutes ?? label(labels, "unknown", "unknown"))}</td>
            <td class="py-2 text-right">${escapeHtml(metric.long_outage_count ?? "")}</td>
          </tr>
        `,
      )
      .join("");
    const sourceCount = (item.sourceDais || []).length || 1;
    const sourceLabel = label(
      labels,
      sourceCount === 1 ? "dai_source" : "dai_sources",
      sourceCount === 1 ? "DAI source" : "DAI sources",
    );
    const factList = detailFactList([
      [
        label(labels, "period", "Period"),
        item.periodLabel || item.year || label(labels, "unknown", "unknown"),
      ],
      [
        label(labels, "outages", "Outages"),
        item.outageCount ?? label(labels, "unknown", "unknown"),
      ],
      [
        label(labels, "average_duration", "Average duration"),
        `${item.averageDurationMinutes ?? label(labels, "unknown", "unknown")} min`,
      ],
      [burdenLabel, item.continuityIndexMinutes ?? label(labels, "unknown", "unknown")],
      [
        label(labels, "outages_over_8h", "Outages > 8h"),
        item.longOutageCount ?? label(labels, "unknown", "unknown"),
      ],
    ]);
    this.hidden = false;
    this.innerHTML = `
      <div class="rounded-lg border border-[#c5cad2] bg-[#f1f1f2] p-4">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#095797]">${escapeHtml(title)}</p>
            <h4 class="mt-1 text-base font-semibold text-[#223654]">${escapeHtml(item.label || "")}</h4>
            <p class="mt-1 text-sm text-[#4e5662]">${escapeHtml(sourceCount)} ${escapeHtml(sourceLabel)} · ${escapeHtml(label(labels, "latest_map_source", "latest shown on map"))}: ${escapeHtml(item.sourceDai)}</p>
          </div>
          <button type="button" class="shrink-0 rounded-md border border-[#c5cad2] bg-white px-2 py-1 text-sm font-semibold text-[#4e5662] hover:bg-[#f1f1f2]" data-dai-detail-close aria-label="${escapeHtml(label(labels, "close", "Close"))}">×</button>
        </div>
        ${factList}
        ${
          rows
            ? `<div class="mt-4 max-h-[28rem] overflow-auto rounded-md border border-[#d7dde6] bg-white">
                <div class="border-b border-[#d7dde6] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b778a]">${escapeHtml(label(labels, "rows", "rows"))}</div>
                <table class="w-full min-w-[42rem] text-left text-sm">
                  <thead class="sticky top-0 bg-[#f1f1f2] text-xs uppercase tracking-[0.08em] text-[#6b778a]">
                    <tr>
                      <th class="px-3 py-2">${escapeHtml(label(labels, "period", "Period"))}</th>
                      <th class="px-3 py-2">DAI</th>
                      <th class="px-3 py-2 text-right">${escapeHtml(label(labels, "outages", "Outages"))}</th>
                      <th class="px-3 py-2 text-right">${escapeHtml(label(labels, "average_duration", "Average duration"))}</th>
                      <th class="px-3 py-2 text-right">${escapeHtml(burdenLabel)}</th>
                      <th class="px-3 py-2 text-right">${escapeHtml(label(labels, "outages_over_8h", "> 8h"))}</th>
                    </tr>
                  </thead>
                  <tbody class="text-slate-700">${rows}</tbody>
                </table>
              </div>`
            : ""
        }
      </div>
    `;
  }

  renderOperational(item) {
    const labels = this.uiLabels();
    const isPreviousOutage = item.kind === "previous_outage";
    const isPlanned = item.kind === "planned";
    const title = isPreviousOutage
      ? label(labels, "previous_outages_legend", "Previously seen outages")
      : isPlanned
        ? label(labels, "planned_panel", "Current planned interruptions")
        : label(labels, "current_outages", "Current Hydro-Quebec feed outages");
    const kindLabel = isPlanned
      ? item.kindLabel || label(labels, "planned", "Planned interruption")
      : isPreviousOutage
        ? item.kindLabel || "Previously seen outage"
        : item.kindLabel || label(labels, "outage", "Outage");
    const recentEvents = item.recentEvents || [];
    const showEventRows = isPreviousOutage || item.matchType === "current_feed_map";
    const primaryDate =
      item.startTime || item.latestStartTime || item.label || label(labels, "unknown", "unknown");
    const customerValue =
      item.customersAffected == null
        ? ""
        : `${item.customersAffected} ${label(labels, "clients", "clients")}`;
    const statusValue = item.statusLabel || item.status || "";
    const distanceValue = hasDistanceValue(item.distanceM)
      ? formatDistanceKm(item.distanceM, labels)
      : "";
    const metaKind = isPlanned || isPreviousOutage ? kindLabel : "";
    const primaryMeta = metaKind;
    const summary = detailFactList([
      [label(labels, "customers", "Customers"), customerValue],
      [label(labels, "status", "Status"), statusValue],
      [label(labels, "end", "End"), item.endTime],
      [label(labels, "distance", "Distance"), distanceValue],
    ]);
    const events = (showEventRows ? recentEvents : [])
      .map((event) => {
        const eventDistance = hasDistanceValue(event.distance_m)
          ? formatDistanceKm(event.distance_m, labels)
          : "";
        const eventSource = isPreviousOutage
          ? label(labels, "nearby_match", "Nearby match")
          : item.matchLabel || item.matchType || "";
        return `
          <article class="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[#223654]">${escapeHtml(event.start_time || label(labels, "unknown", "unknown"))}</p>
              ${eventSource ? `<p class="mt-0.5 text-xs font-medium text-[#6b778a]">${escapeHtml(eventSource)}</p>` : ""}
            </div>
            <div class="flex flex-wrap justify-end gap-2 text-right text-xs font-semibold text-[#223654]">
              <span class="rounded-sm bg-[#f8e69a] px-2 py-1">${escapeHtml(event.customers_affected ?? 0)} ${escapeHtml(label(labels, "clients", "clients"))}</span>
              ${eventDistance ? `<span class="rounded-sm bg-[#e7edf3] px-2 py-1">${escapeHtml(eventDistance)}</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("");
    this.hidden = false;
    this.innerHTML = `
      <div class="rounded-lg border border-[#c5cad2] bg-[#f1f1f2] p-4">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#095797]">${escapeHtml(title)}</p>
            <h4 class="mt-1 text-base font-semibold text-[#223654]">${escapeHtml(label(labels, "start", "Start"))} ${escapeHtml(primaryDate)}</h4>
            ${primaryMeta ? `<p class="mt-1 text-sm text-[#4e5662]">${escapeHtml(primaryMeta)}</p>` : ""}
          </div>
          <button type="button" class="shrink-0 rounded-md border border-[#c5cad2] bg-white px-2 py-1 text-sm font-semibold text-[#4e5662] hover:bg-[#f1f1f2]" data-dai-detail-close aria-label="${escapeHtml(label(labels, "close", "Close"))}">×</button>
        </div>
        ${summary}
        ${events ? `<div class="mt-4 overflow-hidden rounded-md border border-[#d7dde6] bg-white text-sm"><div class="border-b border-[#d7dde6] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6b778a]">${escapeHtml(label(labels, "rows", "rows"))}</div><div class="divide-y divide-[#e2e6ec]">${events}</div></div>` : ""}
      </div>
    `;
  }
}

class OutageMap extends HTMLElement {
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
        if (item.kind !== "previous_outage") return false;
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
    const metricValues = (data.matches || [])
      .filter((item) => item.kind === "regional_metric")
      .map((item) => metricValue(item))
      .filter((value) => value != null);
    const metricMax = Math.max(1, ...metricValues);
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
    const isContextLayer = (item) => item.kind === "disclosure" || item.kind === "regional_metric";
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
        layer.bindTooltip(disclosureTooltip(item, labels), { sticky: true });
        return;
      }
      if (item.kind === "regional_metric") {
        layer.on("click", () => showRegionalMetric(item));
        layer.bindTooltip(regionalMetricTooltip(item, labels), { sticky: true });
        return;
      }
      layer.on("click", () => showOperational(item));
      layer.bindTooltip(operationalTooltip(item, labels), { sticky: true });
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
    const addLayerItems = (layerKey, matches) => {
      const nextItems = orderMatches(matches || []);
      focusItems = [
        ...focusItems.filter((item) => contextLayerForKind(item.kind) !== layerKey),
        ...nextItems,
      ];
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
            refresh();
          })
          .catch(() => {});
      }
      restackDisclosureLayers();
      refresh();
    };
    for (const item of orderedMatches) {
      renderMatch(item);
    }
    restackDisclosureLayers();
    const refresh = () => {
      map.invalidateSize();
      if (data.center && Number.isFinite(data.radiusM)) {
        setVisibleCenter(data.center, data.zoom || 14);
      } else if (data.center && data.preserveInitialView) {
        setVisibleCenter(data.center, data.zoom || 14);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { ...visibleMapPadding(24), maxZoom: 16 });
      } else if (data.center) {
        setVisibleCenter(data.center, data.zoom || 14);
      }
    };
    const replayPendingFocus = () => {
      const focusDetail = window.pendingMapFocus || activeMapFocus;
      if (!focusDetail || !this.isConnected) return;
      focusMap(focusDetail);
      if (window.pendingMapFocus === focusDetail) window.pendingMapFocus = null;
    };
    requestAnimationFrame(() =>
      setTimeout(() => {
        refresh();
        replayPendingFocus();
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
            refresh();
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
    this.handleMapLayerToggle = (event) => {
      const { layer, enabled } = event.detail || {};
      if (!layer) return;
      if (!enabled) removeLayer(layer);
    };
    document.addEventListener("map-layer-items", this.handleMapLayerItems);
    document.addEventListener("map-layer-toggle", this.handleMapLayerToggle);
    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => {
        if (activeMapFocus) {
          focusMap(activeMapFocus, { remember: false });
        } else {
          refresh();
        }
      });
      this.resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this.handleMapFocus) document.removeEventListener("map-focus", this.handleMapFocus);
    if (this.handleMapLayerItems)
      document.removeEventListener("map-layer-items", this.handleMapLayerItems);
    if (this.handleMapLayerToggle)
      document.removeEventListener("map-layer-toggle", this.handleMapLayerToggle);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }
}

customElements.define("dai-detail-panel", DaiDetailPanel);
customElements.define("outage-map", OutageMap);

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  reloadOnHistoryNavigation();
  restoreSearchInputFromUrl();
  syncLanguageForm();
  attachAddressAutocomplete();
  attachLocationSearch();
  attachSearchRouting();
  attachMapFocusCards();
  attachMapLayerToggles();
  updateShellState();
  showSearchLoading(false);
  document.body.addEventListener("input", syncLanguageForm);
  document.body.addEventListener("change", syncLanguageForm);
});

document.body.addEventListener("htmx:afterSwap", () => {
  syncLanguageForm();
  attachAddressAutocomplete();
  attachLocationSearch();
  attachSearchRouting();
  attachMapFocusCards();
  attachMapLayerToggles();
  updateShellState();
});
