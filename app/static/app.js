import {
  geometryStyle,
  geometryWeight,
  mapLayerClass,
  mapPane,
  markerStyle,
  metricValue,
} from "./map-layers.js";
import {
  escapeHtml,
  fetchJson,
  formatDistanceKm,
  formatDuration,
  formatPlannedScheduleParts,
  formatPreviousTimeParts,
  formatRelativeTime,
  hasDistanceValue,
  label,
  localizeCause,
} from "./ui-format.js?v=20260605icons";

const ICON_SPRITE_URL = "/static/icons.svg?v=20260606b";

function phIcon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("ph-icon");
  if (className) svg.classList.add(...className.split(" ").filter(Boolean));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `${ICON_SPRITE_URL}#ph-icon-${name}`);
  svg.append(use);
  return svg;
}

function phIconMarkup(name, className = "ph-pill-icon") {
  const classes = ["ph-icon", ...String(className).split(/\s+/).filter(Boolean)]
    .map((item) => escapeHtml(item))
    .join(" ");
  return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="${escapeHtml(ICON_SPRITE_URL)}#ph-icon-${escapeHtml(name)}"></use></svg>`;
}

function detailPill(iconName, text, className = "", title = "") {
  if (text === null || text === undefined || text === "") return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  const titleAttr = title
    ? ` title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${text}`)}"`
    : "";
  return `<span class="ph-detail-pill${extraClass}"${titleAttr}>${phIconMarkup(iconName)}<span>${escapeHtml(text)}</span></span>`;
}

function detailPillGrid(pills, className = "") {
  const visible = pills.filter(Boolean).join("");
  if (!visible) return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  return `<div class="ph-detail-pill-grid${extraClass}">${visible}</div>`;
}

function sourcePdfLink(url) {
  if (!url) return "";
  const text = document.documentElement.lang === "fr" ? "PDF Hydro-Québec" : "Hydro-Québec PDF";
  const title =
    document.documentElement.lang === "fr"
      ? "Ouvrir le PDF source sur le site d'Hydro-Québec"
      : "Open the source PDF on Hydro-Québec";
  return `<a class="ph-detail-source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${phIconMarkup("external-link")}<span>${escapeHtml(text)}</span></a>`;
}

function detailSection(title, iconName, body, className = "") {
  if (!body) return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  return `
    <section class="ph-detail-section${extraClass}">
      <div class="ph-detail-section-title">${phIconMarkup(iconName, "ph-layer-count-icon")}${escapeHtml(title)}</div>
      ${body}
    </section>
  `;
}

function detailPanelShell({
  tone,
  eyebrow,
  title,
  subtitle = "",
  sourceAction = "",
  pills = "",
  body = "",
  labels = {},
}) {
  return `
    <div class="ph-detail-card ph-detail-card--${escapeHtml(tone || "neutral")}">
      <div class="ph-detail-header">
        <div class="ph-detail-heading">
          ${eyebrow ? `<p class="ph-detail-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
          <h4 class="ph-detail-title">${escapeHtml(title || label(labels, "unknown", "unknown"))}</h4>
          ${subtitle ? `<p class="ph-detail-subtitle">${escapeHtml(subtitle)}</p>` : ""}
          ${sourceAction}
        </div>
        <button type="button" class="ph-detail-close" data-dai-detail-close aria-label="${escapeHtml(label(labels, "close", "Close"))}">×</button>
      </div>
      ${pills}
      ${body}
    </div>
  `;
}

function appendText(parent, value) {
  const span = document.createElement("span");
  span.textContent = value;
  parent.append(span);
  return span;
}

function replaceWithIconText(element, iconName, text, iconClass = "ph-pill-icon") {
  element.replaceChildren(phIcon(iconName, iconClass), document.createTextNode(text || ""));
}

function countPillText(value) {
  const span = document.createElement("span");
  span.className = "ph-count-value";
  span.textContent = value ?? 0;
  return span;
}

function iconNameForStatus(status, statusLabel = "") {
  if (status === "L") return "hard-hat";
  if (status === "R") return "truck";
  if (status === "A") return "archive";
  const normalized = `${status || ""} ${statusLabel || ""}`.toLowerCase();
  if (normalized.includes("l") || normalized.includes("work") || normalized.includes("travail")) {
    return "hard-hat";
  }
  if (normalized.includes("r") || normalized.includes("route")) return "truck";
  if (normalized.includes("a") || normalized.includes("assign")) return "archive";
  return "help";
}

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

function hydrateTimeLabels(root = document) {
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
  if (typeof window.phSyncContextSections === "function") window.phSyncContextSections();
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
    if (detail.startTime && payload.startTime && detail.startTime !== payload.startTime) {
      return false;
    }
    if (detail.geometryKey && payload.geometryKey)
      return detail.geometryKey === payload.geometryKey;
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
  left.className = "min-w-0 flex-1";
  if (isPublishedContext) {
    const pillGroup = document.createElement("div");
    pillGroup.className = "ph-row-pill-group";

    const labelPill = document.createElement("span");
    labelPill.className = "ph-row-pill ph-row-pill-published-label";
    replaceWithIconText(
      labelPill,
      item.kind === "regional_metric" ? "map" : "file-search",
      item.label ||
        (item.kind === "regional_metric"
          ? label(labels, "regional_colour_legend", "Regional outage burden")
          : label(labels, "disclosure", "Disclosure")),
    );
    labelPill.title =
      item.kind === "regional_metric"
        ? item.regionalBurdenLabel || label(labels, "regional_colour_legend", "Regional burden")
        : label(labels, "disclosure_area_context", "Published area context");
    pillGroup.append(labelPill);

    left.append(pillGroup);
  } else {
    const pillGroup = document.createElement("div");
    pillGroup.className = "ph-row-pill-group";
    if (item.kind === "planned") {
      const parts = formatPlannedScheduleParts(item.startTime, item.endTime, labels);
      const schedulePill = document.createElement("span");
      schedulePill.className = "ph-row-pill ph-row-pill-planned-schedule";
      replaceWithIconText(schedulePill, "calendar", parts.schedule);
      pillGroup.append(schedulePill);

      if (parts.duration) {
        const durationPill = document.createElement("span");
        durationPill.className = "ph-row-pill ph-row-pill-planned-duration";
        replaceWithIconText(durationPill, "clock", parts.duration);
        pillGroup.append(durationPill);
      }
    } else if (item.kind === "previous_outage") {
      const parts = formatPreviousTimeParts(item.startTime, labels);
      const datePill = document.createElement("span");
      datePill.className = "ph-row-pill ph-row-pill-previous-date";
      replaceWithIconText(datePill, "calendar", parts.date);
      pillGroup.append(datePill);

      if (parts.time) {
        const timePill = document.createElement("span");
        timePill.className = "ph-row-pill ph-row-pill-previous-time";
        replaceWithIconText(timePill, "clock", parts.time);
        pillGroup.append(timePill);
      }
    } else {
      const timePill = document.createElement("span");
      timePill.className =
        item.kind === "outage"
          ? "ph-row-pill ph-row-pill-current-time"
          : "ph-row-pill ph-row-pill-time";
      if (item.kind === "outage") {
        timePill.dataset.relativeTime = item.startTime || "";
        replaceWithIconText(timePill, "clock-rewind", formatRelativeTime(item.startTime, labels));
      } else {
        timePill.textContent = item.startTime || label(labels, "unknown", "Unknown");
      }
      pillGroup.append(timePill);
    }
    if (item.kind === "outage") {
      const statusPill = document.createElement("span");
      statusPill.className = "ph-row-pill ph-row-pill-current-status";
      statusPill.dataset.statusCode = item.status || "";
      replaceWithIconText(
        statusPill,
        iconNameForStatus(item.status, item.statusLabel),
        item.statusLabel || label(labels, "unknown", "Unknown"),
        "ph-status-icon",
      );
      pillGroup.append(statusPill);
    }
    left.append(pillGroup);
  }

  const pill = document.createElement("p");
  const pillColor =
    item.kind === "outage"
      ? "bg-[#f8e69a]"
      : item.kind === "planned"
        ? "bg-[#dae6f0]"
        : item.kind === "previous_outage"
          ? "ph-context-pill-previous"
          : item.kind === "regional_metric"
            ? "ph-context-pill-regional"
            : "ph-context-pill-disclosure";
  pill.className = `ph-context-pill ${pillColor}`;
  if (item.kind === "disclosure") {
    pill.setAttribute("aria-label", `${item.recordCount || 0} ${label(labels, "rows", "rows")}`);
    pill.replaceChildren(
      countPillText(item.recordCount || 0),
      phIcon("file-search", "ph-count-icon"),
    );
  } else if (item.kind === "regional_metric") {
    pill.setAttribute(
      "aria-label",
      `${item.outageCount || 0} ${label(labels, "outages", "Outages")}`,
    );
    pill.replaceChildren(countPillText(item.outageCount || 0), phIcon("zap", "ph-count-icon"));
  } else {
    pill.setAttribute(
      "aria-label",
      `${item.customersAffected || 0} ${label(labels, "clients", "clients")}`,
    );
    pill.replaceChildren(
      countPillText(item.customersAffected || 0),
      phIcon("users", "ph-count-icon"),
    );
  }
  row.append(left, pill);
  return row;
}

function expandedOperationalRows(matches, kind) {
  return (matches || []).flatMap((item) => {
    if (item.kind !== kind) return [item];
    const events = item.recentEvents || [];
    if (!events.length) return [item];
    return events.map((event) => ({
      ...item,
      lat: event.centroid_lat ?? item.lat,
      lon: event.centroid_lon ?? item.lon,
      label: event.start_time || item.label,
      startTime: event.start_time || item.startTime,
      endTime: event.end_time || item.endTime,
      customersAffected: event.customers_affected ?? item.customersAffected,
      status: event.status ?? item.status,
      distanceM: event.distance_m ?? item.distanceM,
      recentEvents: [],
    }));
  });
}

function displayRowsForLayer(layer, matches) {
  if (layer === "planned") return expandedOperationalRows(matches, "planned");
  if (layer === "previous") return expandedOperationalRows(matches, "previous_outage");
  return matches || [];
}

function attachMapLayerToggles() {
  if (document.body.dataset.mapLayerTogglesBound === "1") return;
  document.body.dataset.mapLayerTogglesBound = "1";

  const toggleLabels = () => {
    const map = document.querySelector("outage-map");
    try {
      return map ? JSON.parse(map.getAttribute("data-map") || "{}").labels || {} : {};
    } catch (_error) {
      return {};
    }
  };

  const layerNoun = (layer, labels) =>
    layer === "current" ? label(labels, "areas", "areas") : label(labels, "rows", "rows");

  const layerIconName = (layer) =>
    layer === "current"
      ? "map"
      : layer === "planned"
        ? "calendar"
        : layer === "previous"
          ? "archive"
          : "file-search";

  const setLayerCount = (section, value, iconName, labelText = "") => {
    const count = section?.querySelector(".ph-layer-count");
    if (!count) return;
    if (value === "" || value == null) {
      count.textContent = "";
      count.removeAttribute("aria-label");
      return;
    }
    count.setAttribute("aria-label", `${value} ${labelText}`.trim());
    const number = document.createElement("span");
    number.className = "ph-layer-count-value";
    number.textContent = value;
    count.replaceChildren(number, phIcon(iconName, "ph-layer-count-icon"));
  };

  const setToggleState = (button, on) => {
    const labels = toggleLabels();
    const layer = button.dataset.layerToggle;
    const sectionLabel =
      button.closest("[data-layer-section]")?.querySelector("h3")?.textContent?.trim() ||
      layer ||
      "";
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    const action = on
      ? label(labels, "map_layer_on", document.documentElement.lang === "fr" ? "Masquer" : "Hide")
      : label(
          labels,
          "map_layer_off",
          document.documentElement.lang === "fr" ? "Afficher" : "Show",
        );
    button.setAttribute("aria-label", `${action} ${sectionLabel}`.trim());
    button.replaceChildren(phIcon(on ? "eye-off" : "eye", "ph-toggle-icon"));
  };

  const closeSiblingSections = (section) => {
    for (const candidate of document.querySelectorAll("[data-layer-section]")) {
      if (candidate !== section) candidate.open = false;
    }
  };

  const openContextSection = (section) => {
    if (!section) return;
    section.open = true;
    closeSiblingSections(section);
  };

  const renderLayerRows = (section, rows, layer, matches, labels) => {
    const displayMatches = displayRowsForLayer(layer, matches);
    rows.innerHTML = "";
    for (const item of displayMatches) rows.appendChild(renderContextRow(item, labels));
    hydrateTimeLabels(rows);
    if (!displayMatches.length) {
      rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Aucune donnée pour cette couche." : "No data for this layer."}</p>`;
    }
    section.dataset.layerLoaded = "true";
    section._layerMatches = matches;
    setLayerCount(section, displayMatches.length, layerIconName(layer), layerNoun(layer, labels));
  };

  const loadLayerSection = async (section, options = {}) => {
    const showOnMap = options.showOnMap === true;
    const layer = section?.dataset.layerSection;
    const rows = section?.querySelector(".ph-context-rows");
    if (!section || !layer || !rows) return [];

    if (section._layerMatches) {
      if (showOnMap) {
        document.dispatchEvent(
          new CustomEvent("map-layer-items", {
            detail: { layer, matches: section._layerMatches },
          }),
        );
      }
      return section._layerMatches;
    }

    if (section._layerLoadPromise) {
      const matches = await section._layerLoadPromise;
      if (showOnMap) {
        document.dispatchEvent(new CustomEvent("map-layer-items", { detail: { layer, matches } }));
      }
      return matches;
    }

    const button = section.querySelector("[data-layer-toggle]");
    const labels = toggleLabels();
    setLayerCount(
      section,
      label(
        labels,
        "layer_loading",
        document.documentElement.lang === "fr" ? "Chargement" : "Loading",
      ),
      layerIconName(layer),
    );
    rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Chargement..." : "Loading..."}</p>`;
    if (button && showOnMap) button.disabled = true;

    section._layerLoadPromise = fetchJson(buildMapLayerUrl(layer), {
      headers: { Accept: "application/json" },
    })
      .then((payload) => {
        const matches = (payload.matches || []).filter(
          (item) => contextLayerForKind(item.kind) === layer,
        );
        renderLayerRows(section, rows, layer, matches, toggleLabels());
        document.dispatchEvent(new CustomEvent("map-layer-data", { detail: { layer, matches } }));
        return matches;
      })
      .catch((_error) => {
        if (showOnMap && button) setToggleState(button, false);
        if (showOnMap) {
          section.dataset.layerState = "off";
        }
        setLayerCount(
          section,
          label(
            toggleLabels(),
            "layer_off",
            document.documentElement.lang === "fr" ? "Masquée" : "Off",
          ),
          layerIconName(layer),
        );
        rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Cette couche n'a pas pu être chargée." : "This layer could not be loaded."}</p>`;
        return [];
      })
      .finally(() => {
        section._layerLoadPromise = undefined;
        if (button) button.disabled = false;
      });

    const matches = await section._layerLoadPromise;
    if (showOnMap && matches.length) {
      document.dispatchEvent(new CustomEvent("map-layer-items", { detail: { layer, matches } }));
    }
    return matches;
  };

  const preloadContextLayers = () => {
    const run = () => {
      for (const section of document.querySelectorAll("[data-layer-section]")) {
        if (section.dataset.layerSection === "current") continue;
        if (section._layerMatches || section._layerLoadPromise) continue;
        loadLayerSection(section, { showOnMap: false });
      }
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      window.setTimeout(run, 250);
    }
  };

  window.phSyncContextSections = () => {
    const openSection = document.querySelector("[data-layer-section][open]");
    if (openSection) {
      closeSiblingSections(openSection);
    } else {
      const currentSection = document.querySelector('[data-layer-section="current"]');
      if (currentSection) currentSection.open = true;
    }
    preloadContextLayers();
  };

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-layer-toggle]");
    const summary = event.target.closest(".ph-context-section-summary");
    if (!button && summary) {
      const section = summary.closest("[data-layer-section]");
      if (!section) return;
      event.preventDefault();
      openContextSection(section);
      const toggle = section.querySelector("[data-layer-toggle]");
      await loadLayerSection(section, {
        showOnMap: toggle?.getAttribute("aria-pressed") === "true",
      });
      return;
    }

    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const section = button.closest("[data-layer-section]");
    const layer = button.dataset.layerToggle;
    if (!section || !layer) return;

    const isOn = button.getAttribute("aria-pressed") === "true";
    if (isOn) {
      setToggleState(button, false);
      section.dataset.layerState = "off";
      document.dispatchEvent(
        new CustomEvent("map-layer-toggle", { detail: { layer, enabled: false } }),
      );
      return;
    }

    setToggleState(button, true);
    section.dataset.layerState = "on";
    openContextSection(section);
    document.dispatchEvent(
      new CustomEvent("map-layer-toggle", { detail: { layer, enabled: true } }),
    );
    await loadLayerSection(section, { showOnMap: true });
  });
}

function disclosurePopup(item, labels = {}) {
  const causes = (item.topCauses || [])
    .map(
      (cause) =>
        `<li>${detailPill("zap", `${localizeCause(cause.cause) || label(labels, "unknown", "unknown")} (${cause.count})`, "ph-detail-pill--soft")}</li>`,
    )
    .join("");
  const events = (item.recentEvents || [])
    .map((event) => {
      const startParts = formatPreviousTimeParts(event.start_time, labels);
      const endParts = formatPreviousTimeParts(event.end_time, labels);
      const startLabel = startParts.time
        ? `${startParts.date} ${startParts.time}`
        : startParts.date;
      const endLabel = endParts.time ? `${endParts.date} ${endParts.time}` : endParts.date;
      return `<tr>
          <td>${detailPill("calendar", startLabel)}</td>
          <td>${detailPill("clock", endLabel)}</td>
          <td class="truncate" title="${escapeHtml(event.row_area || "")}">${escapeHtml(event.row_area || "")}</td>
          <td class="truncate" title="${escapeHtml(localizeCause(event.cause) || label(labels, "unknown", "unknown"))}">${detailPill("zap", localizeCause(event.cause) || label(labels, "unknown", "unknown"))}</td>
          <td class="text-right">${detailPill("clock", formatDuration(event.duration_seconds, labels), "ph-detail-pill--count")}</td>
          <td class="text-right">${detailPill("users", event.customers_affected ?? 0, "ph-detail-pill--count")}</td>
        </tr>`;
    })
    .join("");
  return `
      ${causes ? detailSection(label(labels, "top_causes", "Top causes"), "zap", `<ul class="ph-detail-cause-list">${causes}</ul>`) : ""}
      ${
        events
          ? detailSection(
              label(labels, "extracted_rows", "Extracted rows"),
              "file-search",
              `<div class="ph-detail-table-wrap">
                <table class="ph-detail-table">
                  <colgroup>
                    <col class="w-[18%]">
                    <col class="w-[18%]">
                    <col class="w-[20%]">
                    <col class="w-[24%]">
                    <col class="w-[10%]">
                    <col class="w-[10%]">
                  </colgroup>
                  <thead>
                    <tr>
                      <th>${escapeHtml(label(labels, "start", "Start"))}</th>
                      <th>${escapeHtml(label(labels, "end", "End"))}</th>
                      <th>${escapeHtml(label(labels, "area", "Area"))}</th>
                      <th>${escapeHtml(label(labels, "cause", "Cause"))}</th>
                      <th class="text-right">${escapeHtml(label(labels, "duration_short", "Dur."))}</th>
                      <th class="text-right">${escapeHtml(label(labels, "clients", "clients"))}</th>
                    </tr>
                  </thead>
                  <tbody>${events}</tbody>
                </table>
              </div>`,
              "ph-detail-section--scroll",
            )
          : ""
      }
  `;
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

function regionalBurdenText(item, labels = {}) {
  return (
    item.regionalBurdenLabel || label(labels, "regional_colour_legend", "Regional outage burden")
  );
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
    const periodValue = `${item.startMin || label(labels, "unknown", "unknown")} - ${item.startMax || label(labels, "unknown", "unknown")}`;
    const pills = detailPillGrid([
      detailPill(
        "file-search",
        `${item.recordCount || 0} ${label(labels, "rows", "rows")}`,
        "ph-detail-pill--count",
      ),
      detailPill("calendar", periodValue),
      detailPill(
        "clock",
        formatDuration(item.durationSecondsTotal, labels),
        "ph-detail-pill--duration",
      ),
      detailPill("archive", sourceLabel),
    ]);
    this.hidden = false;
    this.innerHTML = detailPanelShell({
      tone: "disclosure",
      eyebrow: title,
      title: item.label || label(labels, "disclosure", "Disclosure"),
      subtitle: sourceLabel,
      sourceAction: sourcePdfLink(item.sourceUrl),
      pills,
      body: `<div class="ph-detail-scroll">${disclosurePopup(item, labels)}</div>`,
      labels,
    });
  }

  renderRegionalMetric(item) {
    const labels = this.uiLabels();
    const title = this.getAttribute("title-label") || "DAI details";
    const burdenLabel = regionalBurdenText(item, labels);
    const unknownLabel = label(labels, "unknown", "unknown");
    const sourceMetricRows = (item.metrics || []).filter((metric) => {
      const metricPeriod = metric.period_label || metric.year || "";
      const itemPeriod = item.periodLabel || item.year || "";
      return metric.source_dai !== item.sourceDai || String(metricPeriod) !== String(itemPeriod);
    });
    const rows = sourceMetricRows
      .map((metric) => {
        const metricPills = [
          detailPill(
            "zap",
            metric.outage_count,
            "ph-detail-pill--count",
            label(labels, "outages", "Outages"),
          ),
          detailPill(
            "clock",
            metric.average_duration_minutes == null ? "" : `${metric.average_duration_minutes} min`,
            "ph-detail-pill--count",
            label(labels, "average_duration", "Average duration"),
          ),
          detailPill("map", metric.continuity_index_minutes, "ph-detail-pill--count", burdenLabel),
          detailPill(
            "clock-rewind",
            metric.long_outage_count,
            "ph-detail-pill--count",
            label(labels, "outages_over_8h", "> 8h"),
          ),
        ]
          .filter(Boolean)
          .join("");
        return `
            <article class="ph-detail-source-row">
              <div class="ph-detail-source-main">
                ${detailPill("calendar", metric.period_label || metric.year || unknownLabel)}
                ${detailPill("archive", metric.source_dai || "")}
              </div>
              <div class="ph-detail-source-metrics">
                ${metricPills || detailPill("help", unknownLabel, "ph-detail-pill--muted")}
              </div>
            </article>
          `;
      })
      .join("");
    const sourceCount = (item.sourceDais || []).length || 1;
    const sourceLabel = label(
      labels,
      sourceCount === 1 ? "dai_source" : "dai_sources",
      sourceCount === 1 ? "DAI source" : "DAI sources",
    );
    const pills = detailPillGrid([
      detailPill("calendar", item.periodLabel || item.year || label(labels, "unknown", "unknown")),
      detailPill(
        "zap",
        item.outageCount ?? label(labels, "unknown", "unknown"),
        "ph-detail-pill--count",
      ),
      detailPill(
        "clock",
        `${item.averageDurationMinutes ?? label(labels, "unknown", "unknown")} min`,
      ),
      detailPill("map", item.continuityIndexMinutes ?? label(labels, "unknown", "unknown")),
      detailPill(
        "clock",
        item.longOutageCount ?? label(labels, "unknown", "unknown"),
        "ph-detail-pill--count",
      ),
    ]);
    const body = rows
      ? detailSection(
          document.documentElement.lang === "fr" ? "Autres sources DAI" : "Other DAI sources",
          "layers",
          `<div class="ph-detail-source-list">${rows}</div>`,
          "ph-detail-section--scroll",
        )
      : "";
    this.hidden = false;
    this.innerHTML = detailPanelShell({
      tone: "regional",
      eyebrow: title,
      title: item.label || label(labels, "regional_colour_legend", "Regional outage burden"),
      subtitle: `${sourceCount} ${sourceLabel} · ${label(labels, "latest_map_source", "latest shown on map")}: ${item.sourceDai}`,
      sourceAction: sourcePdfLink(item.sourceUrl),
      pills,
      body,
      labels,
    });
  }

  renderOperational(item) {
    const labels = this.uiLabels();
    const isPreviousOutage = item.kind === "previous_outage";
    const isPlanned = item.kind === "planned";
    if (isPlanned || isPreviousOutage) {
      this.hidden = true;
      this.innerHTML = "";
      return;
    }
    const tone = isPlanned ? "planned" : isPreviousOutage ? "previous" : "current";
    const title = isPreviousOutage
      ? label(labels, "previous_layer_short", "Local archive")
      : isPlanned
        ? label(labels, "planned_layer_short", "Planned")
        : label(labels, "current_layer_short", "Current feed");
    const kindLabel = isPlanned
      ? item.kindLabel || label(labels, "planned", "Planned interruption")
      : isPreviousOutage
        ? item.kindLabel || "Previously seen outage"
        : item.kindLabel || label(labels, "outage", "Outage");
    const recentEvents = item.recentEvents || [];
    const showEventRows =
      recentEvents.length > 1 && (isPreviousOutage || item.matchType === "current_feed_map");
    if (!isPlanned && !isPreviousOutage && !showEventRows) {
      this.hidden = true;
      this.innerHTML = "";
      return;
    }
    const clientLabel = label(labels, "clients", "clients");
    const customerValue = item.customersAffected == null ? "" : `${item.customersAffected}`;
    const customerTitle =
      item.customersAffected == null ? "" : `${item.customersAffected} ${clientLabel}`;
    const statusValue = item.statusLabel || item.status || "";
    const distanceValue = hasDistanceValue(item.distanceM)
      ? formatDistanceKm(item.distanceM, labels)
      : "";
    const plannedParts = isPlanned
      ? formatPlannedScheduleParts(item.startTime, item.endTime, labels)
      : null;
    const previousParts = isPreviousOutage ? formatPreviousTimeParts(item.startTime, labels) : null;
    const currentTimeLabel =
      !isPlanned && !isPreviousOutage
        ? formatRelativeTime(item.startTime || item.latestStartTime, labels)
        : "";
    const headline = isPlanned
      ? kindLabel
      : isPreviousOutage
        ? kindLabel
        : label(labels, "outage", "Outage");
    const pills = showEventRows
      ? ""
      : detailPillGrid([
          isPlanned ? detailPill("calendar", plannedParts?.schedule) : "",
          isPlanned ? detailPill("clock", plannedParts?.duration) : "",
          isPreviousOutage ? detailPill("calendar", previousParts?.date) : "",
          isPreviousOutage ? detailPill("clock", previousParts?.time) : "",
          currentTimeLabel ? detailPill("clock-rewind", currentTimeLabel) : "",
          statusValue && !isPlanned
            ? detailPill(iconNameForStatus(item.status, statusValue), statusValue)
            : "",
          customerValue
            ? detailPill("users", customerValue, "ph-detail-pill--count", customerTitle)
            : "",
          distanceValue ? detailPill("route", distanceValue) : "",
        ]);
    const events = (showEventRows ? recentEvents : [])
      .map((event) => {
        const eventDistance = hasDistanceValue(event.distance_m)
          ? formatDistanceKm(event.distance_m, labels)
          : "";
        const eventTime = isPlanned
          ? formatPlannedScheduleParts(event.start_time, event.end_time, labels)
          : formatPreviousTimeParts(event.start_time, labels);
        if (isPlanned) {
          return `
            <article class="ph-detail-event-row ph-detail-event-row--planned">
              ${detailPill("calendar", eventTime.schedule)}
              ${detailPill("clock", eventTime.duration)}
              ${detailPill(
                "users",
                event.customers_affected ?? 0,
                "ph-detail-pill--count",
                `${event.customers_affected ?? 0} ${clientLabel}`,
              )}
            </article>
          `;
        }
        return `
          <article class="ph-detail-event-row ${eventDistance ? "ph-detail-event-row--distance" : ""}">
            ${detailPill("calendar", eventTime.date)}
            ${eventTime.time ? detailPill("clock", eventTime.time) : ""}
            ${eventDistance ? detailPill("route", eventDistance) : ""}
            ${detailPill(
              "users",
              event.customers_affected ?? 0,
              "ph-detail-pill--count",
              `${event.customers_affected ?? 0} ${clientLabel}`,
            )}
          </article>
        `;
      })
      .join("");
    this.hidden = false;
    this.innerHTML = detailPanelShell({
      tone,
      eyebrow: title,
      title: headline,
      pills,
      body: events
        ? detailSection(
            label(labels, "rows", "rows"),
            isPreviousOutage ? "archive" : "layers",
            `<div class="ph-detail-event-list">${events}</div>`,
            "ph-detail-section--scroll",
          )
        : "",
      labels,
    });
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
  hydrateTimeLabels();
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
  hydrateTimeLabels();
  updateShellState();
});
