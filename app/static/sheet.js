import { contextLayerForKind } from "./map-utils.js?v=20260710a";
import {
  attachAddressAutocomplete,
  attachComparisonTray,
  hydrateTimeLabels,
  updateSearchUrl,
} from "./search.js?v=20260710a";
import {
  escapeHtml,
  formatDistanceKm,
  formatDuration,
  formatPreviousTimeParts,
  hasDistanceValue,
  label,
} from "./ui-format.js?v=20260710a";

const DETENTS = ["peek", "half", "full"];
// The sheet height transition in app.css runs 280ms; wait slightly longer
// before measuring insets or moving the camera.
const SHEET_SETTLE_MS = 320;
const LAYER_KEYS = ["current", "planned", "previous", "published"];

let mapLabels = {};
const sheetState = {
  lang: document.documentElement.lang || "fr",
  domain: "current",
  scope: "local",
  q: "",
  lat: "",
  lon: "",
  accuracy: "",
  rowSort: "clients",
};

function sheetElement() {
  return document.querySelector(".ph-sheet");
}

function sheetBody() {
  return document.querySelector("#sheet-body");
}

function sheetDetail() {
  return document.querySelector("#sheet-detail");
}

function detailPanel() {
  return document.querySelector("dai-detail-panel");
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function announceSheetInsetChange() {
  document.dispatchEvent(new CustomEvent("sheet-inset-change"));
}

function setDetent(name) {
  const sheet = sheetElement();
  if (!sheet || !DETENTS.includes(name)) return;
  sheet.dataset.detent = name;
  sheet.style.height = "";
  window.setTimeout(announceSheetInsetChange, SHEET_SETTLE_MS);
}

function currentDetent() {
  return sheetElement()?.dataset.detent || "half";
}

function detentHeights() {
  const viewport = window.innerHeight;
  return {
    peek: 196,
    half: Math.round(viewport * 0.52),
    full: viewport - 14,
  };
}

function attachSheetDrag() {
  const sheet = sheetElement();
  const grabber = sheet?.querySelector(".ph-sheet-grabber");
  if (!sheet || !grabber || grabber.dataset.dragBound === "1") return;
  grabber.dataset.dragBound = "1";
  let startY = 0;
  let startHeight = 0;
  let dragged = false;

  grabber.addEventListener("pointerdown", (event) => {
    if (!isMobileLayout()) return;
    event.preventDefault();
    startY = event.clientY;
    startHeight = sheet.getBoundingClientRect().height;
    dragged = false;
    sheet.classList.add("is-dragging");
    grabber.setPointerCapture(event.pointerId);
  });

  grabber.addEventListener("pointermove", (event) => {
    if (!grabber.hasPointerCapture(event.pointerId)) return;
    const delta = startY - event.clientY;
    if (Math.abs(delta) > 4) dragged = true;
    const heights = detentHeights();
    const next = Math.min(heights.full, Math.max(120, startHeight + delta));
    sheet.style.height = `${next}px`;
  });

  const finishDrag = (event) => {
    if (!grabber.hasPointerCapture(event.pointerId)) return;
    grabber.releasePointerCapture(event.pointerId);
    sheet.classList.remove("is-dragging");
    if (!dragged) {
      sheet.style.height = "";
      return;
    }
    const height = sheet.getBoundingClientRect().height;
    const heights = detentHeights();
    let closest = "half";
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const name of DETENTS) {
      const distance = Math.abs(heights[name] - height);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = name;
      }
    }
    setDetent(closest);
  };
  grabber.addEventListener("pointerup", finishDrag);
  grabber.addEventListener("pointercancel", finishDrag);

  grabber.addEventListener("click", () => {
    if (!isMobileLayout() || dragged) return;
    const order = { peek: "half", half: "full", full: "peek" };
    setDetent(order[currentDetent()] || "half");
  });
}

function readBootState() {
  const content = sheetBody()?.querySelector(".ph-sheet-content");
  const params = new URL(window.location.href).searchParams;
  sheetState.lang = params.get("lang") || sheetState.lang;
  sheetState.q = params.get("q") || "";
  sheetState.lat = params.get("lat") || "";
  sheetState.lon = params.get("lon") || "";
  sheetState.accuracy = params.get("accuracy_m") || "";
  if (content) {
    sheetState.domain = content.dataset.domain || sheetState.domain;
    sheetState.scope = content.dataset.scope || sheetState.scope;
  }
  const mapElement = document.querySelector("outage-map");
  if (mapElement) {
    try {
      mapLabels = JSON.parse(mapElement.getAttribute("data-map") || "{}").labels || {};
    } catch (_error) {
      mapLabels = {};
    }
  }
}

function hasAddress() {
  return Boolean(sheetState.q) || Boolean(sheetState.lat && sheetState.lon);
}

function applyMapUpdate(root) {
  const script = root.querySelector("script[data-map-update]");
  if (!script || script.dataset.applied === "1") return;
  script.dataset.applied = "1";
  let payload = null;
  try {
    payload = JSON.parse(script.textContent || "{}");
  } catch (_error) {
    return;
  }
  const groups = Object.fromEntries(LAYER_KEYS.map((key) => [key, []]));
  for (const item of payload.matches || []) {
    const layerKey = contextLayerForKind(item.kind);
    if (groups[layerKey]) groups[layerKey].push(item);
  }
  for (const layerKey of LAYER_KEYS) {
    document.dispatchEvent(
      new CustomEvent("map-layer-items", {
        detail: { layer: layerKey, matches: groups[layerKey] },
      }),
    );
  }
  window.setTimeout(() => {
    document.dispatchEvent(
      new CustomEvent("map-address", {
        detail: {
          center: payload.center || null,
          radiusM: payload.radiusM || null,
          addressLabel: payload.addressLabel || "",
          zoom: payload.zoom || null,
        },
      }),
    );
  }, SHEET_SETTLE_MS);
}

function closeDetailCards() {
  const detail = sheetDetail();
  if (detail) {
    detail.hidden = true;
    detail.innerHTML = "";
  }
  const provenance = document.querySelector("#sheet-provenance");
  if (provenance) provenance.hidden = true;
  const panel = detailPanel();
  if (panel && typeof panel.renderEmpty === "function") panel.renderEmpty();
}

function rowSortValues(item) {
  let payload = {};
  try {
    payload = JSON.parse(
      item.querySelector("[data-map-focus]")?.getAttribute("data-map-focus") || "{}",
    );
  } catch (_error) {
    payload = {};
  }
  return {
    customers: Number(payload.customersAffected) || 0,
    startTime: payload.startTime || "",
  };
}

function applyRowSort(option) {
  const list = sheetBody()?.querySelector("[data-sortable-rows]");
  if (!list) return;
  const items = [...list.children];
  items.sort((left, right) => {
    const a = rowSortValues(left);
    const b = rowSortValues(right);
    if (option === "recent") {
      return a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0;
    }
    return b.customers - a.customers;
  });
  list.append(...items);
  for (const button of sheetBody()?.querySelectorAll("[data-sort-option]") || []) {
    const active = button.dataset.sortOption === option;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function bindSheetContent() {
  const body = sheetBody();
  if (!body) return;
  hydrateTimeLabels(body);
  attachAddressAutocomplete();
  attachComparisonTray();
  const content = body.querySelector(".ph-sheet-content");
  if (content) {
    sheetState.domain = content.dataset.domain || sheetState.domain;
    sheetState.scope = content.dataset.scope || sheetState.scope;
    document.body.dataset.mode = content.dataset.mode || "explore";
  }
  if (sheetState.rowSort && sheetState.rowSort !== "clients") {
    applyRowSort(sheetState.rowSort);
  }
}

function showSheetError() {
  const body = sheetBody();
  if (!body) return;
  body.querySelector(".ph-sheet-error")?.remove();
  const error = document.createElement("div");
  error.className = "ph-sheet-error";
  error.setAttribute("role", "alert");
  error.textContent = label(
    mapLabels,
    "sheet_load_error",
    "The content could not load. Try again.",
  );
  body.prepend(error);
  if (isMobileLayout() && currentDetent() === "peek") setDetent("half");
}

let sheetFetchSequence = 0;

export async function fetchSheet(updates = {}, { pushUrl = true } = {}) {
  const previousState = { ...sheetState };
  Object.assign(sheetState, updates);
  const sheet = sheetElement();
  const body = sheetBody();
  if (!sheet || !body) return;
  const requestId = ++sheetFetchSequence;
  const isCurrentRequest = () => requestId === sheetFetchSequence;
  closeDetailCards();
  sheet.classList.add("is-loading");
  const url = new URL("/sheet", window.location.origin);
  url.searchParams.set("lang", sheetState.lang);
  url.searchParams.set("domain", sheetState.domain);
  url.searchParams.set("scope", sheetState.scope);
  if (sheetState.q) {
    url.searchParams.set("q", sheetState.q);
  } else if (sheetState.lat && sheetState.lon) {
    url.searchParams.set("lat", sheetState.lat);
    url.searchParams.set("lon", sheetState.lon);
    if (sheetState.accuracy) url.searchParams.set("accuracy_m", sheetState.accuracy);
  }
  try {
    const response = await fetch(url, { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (!isCurrentRequest()) return;
    body.innerHTML = html;
    bindSheetContent();
    if (isMobileLayout() && hasAddress() && currentDetent() !== "half") {
      setDetent("half");
    }
    applyMapUpdate(body);
    body.scrollTop = 0;
    if (pushUrl) {
      updateSearchUrl({
        lang: sheetState.lang,
        q: sheetState.q,
        latitude: sheetState.q ? "" : sheetState.lat,
        longitude: sheetState.q ? "" : sheetState.lon,
        accuracy: sheetState.q ? "" : sheetState.accuracy,
      });
    }
  } catch (_error) {
    if (!isCurrentRequest()) return;
    Object.assign(sheetState, previousState);
    showSheetError();
  } finally {
    if (isCurrentRequest()) sheet.classList.remove("is-loading");
  }
}

function operationalDetailHtml(item) {
  const isPlanned = item.kind === "planned";
  const startParts = formatPreviousTimeParts(item.startTime, mapLabels);
  const endParts = formatPreviousTimeParts(item.endTime, mapLabels);
  const facts = [];
  const pushFact = (labelKey, fallback, value) => {
    if (!value) return;
    facts.push(
      `<li><span class="ph-detail-fact-label">${escapeHtml(label(mapLabels, labelKey, fallback))}</span>` +
        `<span class="ph-detail-fact-value">${escapeHtml(value)}</span></li>`,
    );
  };
  // A current outage's "end" is Hydro-Quebec's estimated restoration time,
  // not an observation; only archive records get the "observed" framing.
  const isCurrent = item.kind === "outage";
  const startLabelKey = isCurrent || isPlanned ? "start" : "detail_start_observed";
  const endLabelKey = isPlanned
    ? "end"
    : isCurrent
      ? "detail_estimated_restore"
      : "detail_end_observed";
  pushFact(
    startLabelKey,
    "Start",
    startParts.time ? `${startParts.date} · ${startParts.time}` : startParts.date,
  );
  if (item.endTime) {
    pushFact(
      endLabelKey,
      isCurrent ? "Estimated restoration" : "End",
      endParts.time ? `${endParts.date} · ${endParts.time}` : endParts.date,
    );
  }
  if (!isCurrent && item.startTime && item.endTime) {
    const durationSeconds = (new Date(item.endTime) - new Date(item.startTime)) / 1000;
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      pushFact(
        isPlanned ? "duration" : "detail_duration_observed",
        "Duration",
        `≈ ${formatDuration(durationSeconds, mapLabels)}`,
      );
    }
  }
  if (isCurrent && item.startTime) {
    const ageSeconds = (Date.now() - new Date(item.startTime)) / 1000;
    if (Number.isFinite(ageSeconds) && ageSeconds > 0) {
      pushFact("detail_age", "Ongoing for", `≈ ${formatDuration(ageSeconds, mapLabels)}`);
    }
  }
  pushFact(
    isPlanned ? "detail_customers_planned" : "detail_customers",
    isPlanned ? "Customers to be affected" : "Customers affected",
    item.customersAffected != null ? String(item.customersAffected) : "",
  );
  // Status is live-feed information: planned-notice codes are unverified
  // (see NOTES.md) and a resolved archive record has no current status.
  if (isCurrent) {
    pushFact("detail_last_status", "Last seen status", item.statusLabel || "");
  }
  const distanceLine = hasDistanceValue(item.distanceM)
    ? label(mapLabels, "detail_distance", "{distance_km} km from your address").replace(
        "{distance_km}",
        formatDistanceKm(item.distanceM, mapLabels).replace(/\s*km$/, ""),
      )
    : "";
  const title =
    item.kindLabel || label(mapLabels, item.kind === "outage" ? "outage" : item.kind, "");
  const dateTitle = startParts.date ? ` · ${startParts.date}` : "";
  return `
    <header class="ph-sheet-header">
      <button class="ph-round-button" type="button" data-detail-close aria-label="${escapeHtml(label(mapLabels, "detail_close", "Close"))}">
        <svg class="ph-icon" aria-hidden="true" focusable="false"><use href="/static/icons.svg#ph-icon-chevron-left"></use></svg>
      </button>
      <div class="ph-sheet-header-text">
        <h2 class="ph-sheet-title">${escapeHtml(title)}${escapeHtml(dateTitle)}</h2>
        ${distanceLine ? `<p class="ph-sheet-subtitle">${escapeHtml(distanceLine)}</p>` : ""}
      </div>
      <button class="ph-round-button" type="button" data-detail-close aria-label="${escapeHtml(label(mapLabels, "detail_close", "Close"))}">
        <svg class="ph-icon" aria-hidden="true" focusable="false"><use href="/static/icons.svg#ph-icon-x"></use></svg>
      </button>
    </header>
    <ul class="ph-detail-facts">${facts.join("")}</ul>
    <p class="ph-detail-source-note">${escapeHtml(
      label(
        mapLabels,
        "detail_source_feed",
        "Captured from the public Hydro-Quebec feed, retained by pannes.ca.",
      ),
    )}</p>
  `;
}

function showOperationalDetail(item) {
  const detail = sheetDetail();
  if (!detail) return;
  const panel = detailPanel();
  if (panel && typeof panel.renderEmpty === "function") panel.renderEmpty();
  detail.innerHTML = operationalDetailHtml(item);
  detail.hidden = false;
  detail.scrollTop = 0;
  if (isMobileLayout() && currentDetent() === "full") setDetent("half");
}

function bindGlobalHandlers() {
  const handleDetailClose = (event) => {
    const detailClose = event.target.closest("[data-detail-close]");
    if (detailClose) {
      event.preventDefault();
      closeDetailCards();
    }
  };
  document.body.addEventListener("click", handleDetailClose);
  document.body.addEventListener("pointerup", handleDetailClose);

  document.body.addEventListener("click", (event) => {
    const layerInfo = event.target.closest("[data-layer-info]");
    if (layerInfo) {
      event.preventDefault();
      const provenance = document.querySelector("#sheet-provenance");
      if (provenance) {
        provenance.hidden = false;
        provenance.scrollTop = 0;
        if (isMobileLayout() && currentDetent() === "peek") setDetent("half");
      }
      return;
    }
    const domainLink = event.target.closest("[data-domain-link]");
    if (domainLink) {
      event.preventDefault();
      closeDetailCards();
      const nextScope = domainLink.dataset.scopeLink || sheetState.scope;
      fetchSheet({ domain: domainLink.dataset.domainLink, scope: nextScope });
      return;
    }
    const scopeLink = event.target.closest("[data-scope-link]");
    if (scopeLink) {
      event.preventDefault();
      fetchSheet({ scope: scopeLink.dataset.scopeLink });
      return;
    }
    const sortOption = event.target.closest("[data-sort-option]");
    if (sortOption) {
      event.preventDefault();
      sheetState.rowSort = sortOption.dataset.sortOption || "clients";
      applyRowSort(sheetState.rowSort);
      return;
    }
    const clearButton = event.target.closest('[data-action="clear-search"]');
    if (clearButton) {
      event.preventDefault();
      const input = document.querySelector("#address-input");
      if (input) input.value = "";
      fetchSheet({ q: "", lat: "", lon: "", accuracy: "", domain: "current", scope: "local" });
      return;
    }
    const langSwitch = event.target.closest("[data-lang-switch]");
    if (langSwitch) {
      event.preventDefault();
      const url = new URL(langSwitch.href, window.location.origin);
      if (sheetState.q) {
        url.searchParams.set("q", sheetState.q);
      } else if (sheetState.lat && sheetState.lon) {
        url.searchParams.set("lat", sheetState.lat);
        url.searchParams.set("lon", sheetState.lon);
        if (sheetState.accuracy) url.searchParams.set("accuracy_m", sheetState.accuracy);
      }
      window.location.assign(url.toString());
      return;
    }
  });

  document.body.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-sheet-search]");
    if (!form) return;
    event.preventDefault();
    const query = form.querySelector('[name="q"]')?.value.trim() || "";
    if (!query) return;
    fetchSheet({ q: query, lat: "", lon: "", accuracy: "", domain: "overview", scope: "local" });
  });

  for (const eventName of ["operational-layer-selected"]) {
    document.body.addEventListener(eventName, (event) => {
      if (event.detail) showOperationalDetail(event.detail);
    });
  }
  for (const eventName of ["dai-selected", "regional-metric-selected"]) {
    document.body.addEventListener(eventName, () => {
      const detail = sheetDetail();
      if (detail) {
        detail.hidden = true;
        detail.innerHTML = "";
      }
      if (isMobileLayout() && currentDetent() === "peek") setDetent("half");
    });
  }

  document.body.addEventListener("click", (event) => {
    const row = event.target.closest("[data-map-focus]");
    if (!row) return;
    focusRow(row);
  });
  document.body.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-map-focus]");
    if (!row) return;
    event.preventDefault();
    focusRow(row);
  });
}

function focusRow(row) {
  let detail = null;
  try {
    detail = JSON.parse(row.getAttribute("data-map-focus") || "{}");
  } catch (_error) {
    return;
  }
  for (const candidate of document.querySelectorAll("[data-map-focus]")) {
    candidate.classList.toggle("is-map-selected", candidate === row);
  }
  window.pendingMapFocus = detail;
  document.dispatchEvent(new CustomEvent("map-focus", { detail }));
  if (isMobileLayout() && currentDetent() === "full") setDetent("half");
}

function attachLocationSearch() {
  const button = document.querySelector("#location-search-button");
  if (!button || button.dataset.locationBound === "1") return;
  button.dataset.locationBound = "1";
  const originalHtml = button.innerHTML;
  const showError = (message) => showSheetError(message);
  button.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      showError(button.dataset.locationUnavailableLabel || "Location unavailable.");
      return;
    }
    button.disabled = true;
    button.innerHTML = `<span class="ph-button-spinner" aria-hidden="true"></span>`;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const accuracy = Number.isFinite(position.coords.accuracy)
          ? String(position.coords.accuracy)
          : "";
        await fetchSheet({
          q: "",
          lat: String(position.coords.latitude),
          lon: String(position.coords.longitude),
          accuracy,
          domain: "overview",
          scope: "local",
        });
        const input = document.querySelector("#address-input");
        if (input) input.value = button.dataset.currentLocationLabel || "Current location";
        button.disabled = false;
        button.innerHTML = originalHtml;
        if (isMobileLayout()) setDetent("half");
      },
      (error) => {
        const message =
          error?.code === 1
            ? button.dataset.locationDeniedLabel
            : error?.code === 3
              ? button.dataset.locationTimeoutLabel
              : button.dataset.locationUnavailableLabel;
        showError(message || "Location unavailable.");
        button.disabled = false;
        button.innerHTML = originalHtml;
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  });
}

export function initSheet() {
  readBootState();
  attachSheetDrag();
  bindGlobalHandlers();
  bindSheetContent();
  attachLocationSearch();
  window.addEventListener("resize", announceSheetInsetChange);
}
