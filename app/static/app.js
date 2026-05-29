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

function label(labels, key, fallback) {
  return labels?.[key] || fallback;
}

function formatDistanceKm(value, labels = {}) {
  if (value === null || value === undefined || value === "")
    return label(labels, "unknown", "unknown");
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return label(labels, "unknown", "unknown");
  return `${(numberValue / 1000).toFixed(2)} km`;
}

function hasDistanceValue(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function detailFactList(facts) {
  const visibleFacts = facts.filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (!visibleFacts.length) return "";
  return `<dl class="mt-4 grid gap-x-5 gap-y-3 border-y border-[#d7dde6] py-3 text-sm sm:grid-cols-2">
    ${visibleFacts
      .map(
        ([factLabel, value]) => `
          <div>
            <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b778a]">${escapeHtml(factLabel)}</dt>
            <dd class="mt-0.5 font-medium text-[#223654]">${escapeHtml(value)}</dd>
          </div>
        `,
      )
      .join("")}
  </dl>`;
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

function attachContextSwitcher() {
  for (const switcher of document.querySelectorAll(".ph-context-switcher")) {
    if (switcher.dataset.switcherBound === "1") continue;
    switcher.dataset.switcherBound = "1";
    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("[data-context-target]");
      if (!button) return;
      const section = document.getElementById(button.dataset.contextTarget || "");
      if (!section) return;
      section.open = true;
      section.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
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
  attachContextSwitcher();
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDuration(seconds, labels = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0) return label(labels, "unknown", "unknown");
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function formatDateTimeCell(value, labels = {}) {
  if (!value) return label(labels, "unknown", "unknown");
  const [date, rawTime = ""] = String(value).replace("T", " ").split(" ");
  const time = rawTime ? rawTime.slice(0, 5) : "";
  return `<span class="block font-semibold text-[#223654]">${escapeHtml(date)}</span>${time ? `<span class="block text-[#4e5662]">${escapeHtml(time)}</span>` : ""}`;
}

function localizeCause(cause) {
  if (document.documentElement.lang !== "en") return cause;
  const causes = {
    Accident: "Accident",
    Animal: "Animal",
    "Bris equipement": "Equipment failure",
    "Bris équipement": "Equipment failure",
    Défaillance: "Equipment failure",
    Entretien: "Maintenance",
    "Incendie / Fuite de gaz": "Fire / gas leak",
    Indéterminé: "Undetermined",
    Pannes: "Outages",
    Protection: "Protection",
    Végétation: "Vegetation",
  };
  return causes[cause] || cause;
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

function metricValue(item) {
  if (Number.isFinite(item.continuityIndexMinutes)) return item.continuityIndexMinutes;
  if (Number.isFinite(item.outageCount)) return item.outageCount;
  if (Number.isFinite(item.longOutageCount)) return item.longOutageCount;
  return null;
}

function metricColor(value, maxValue) {
  if (value == null) return null;
  const ratio = Math.max(0, Math.min(1, value / Math.max(maxValue, 1)));
  if (ratio > 0.8) return "#8b1e3f";
  if (ratio > 0.6) return "#c2410c";
  if (ratio > 0.4) return "#ea580c";
  if (ratio > 0.2) return "#ca8a04";
  return "#0f766e";
}

function contextRegionColor(item) {
  const palette = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#0369a1", "#a16207"];
  const key = item.geometryKey || item.label || "";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % palette.length;
  }
  return palette[hash];
}

function regionalColor(item, maxValue) {
  return metricColor(metricValue(item), maxValue) || contextRegionColor(item);
}

function regionalFillOpacity(item) {
  return metricValue(item) == null ? 0.04 : 0.16;
}

function regionalWeight(item) {
  return metricValue(item) == null ? 0.8 : 1.2;
}

function mapPane(item) {
  if (item.kind === "regional_metric") return "regionalContextPane";
  if (item.kind === "disclosure") return "disclosurePane";
  if (item.kind === "previous_outage") return "previousOutagePane";
  if (item.kind === "planned") return "plannedPane";
  return "outagePane";
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

function geometryWeight(item) {
  const points = geometryPoints(item.geometry);
  if (!points.length) return 0;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return (Math.max(...lons) - Math.min(...lons)) * (Math.max(...lats) - Math.min(...lats));
}

function geometryPoints(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2);
  }
  return [];
}

function fetchJson(url, options = {}) {
  if (typeof fetch === "function") {
    return fetch(url, options).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.setRequestHeader("Accept", options.headers?.Accept || "application/json");
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`HTTP ${request.status}`));
        return;
      }
      try {
        resolve(JSON.parse(request.responseText));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("Network request failed"));
    request.send();
  });
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
        : label(labels, "current_outages", "Current or new outages");
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
    const orderedMatches = [...(data.matches || [])].sort((left, right) => {
      const rank = { regional_metric: 0, disclosure: 1, previous_outage: 2, planned: 3, outage: 3 };
      const rankDifference = (rank[left.kind] ?? 3) - (rank[right.kind] ?? 3);
      if (rankDifference !== 0) return rankDifference;
      if (left.kind === "disclosure") {
        return geometryWeight(right) - geometryWeight(left);
      }
      return 0;
    });
    focusItems = orderedMatches;
    const renderedGeometryKeys = new Set();
    const renderMatch = (item) => {
      if (item.deferGeometry && !item.geometry) return;
      if (item.geometryKey && renderedGeometryKeys.has(item.geometryKey)) return;
      const color =
        item.kind === "planned"
          ? "#0891b2"
          : item.kind === "disclosure"
            ? "#2563eb"
            : item.kind === "regional_metric"
              ? regionalColor(item, metricMax)
              : item.kind === "previous_outage"
                ? "#64748b"
                : "#f59e0b";
      let rendered = false;
      if (item.geometry && item.geometry.type === "Polygon") {
        const isDisclosure = item.kind === "disclosure";
        const isRegionalMetric = item.kind === "regional_metric";
        const isPreviousOutage = item.kind === "previous_outage";
        const layer = L.geoJSON(item.geometry, {
          pane: mapPane(item),
          style: {
            color,
            weight: isRegionalMetric
              ? regionalWeight(item)
              : isDisclosure
                ? 2
                : isPreviousOutage
                  ? 2
                  : item.matchType === "direct_match"
                    ? 4
                    : 3,
            opacity: isRegionalMetric ? 0.36 : isDisclosure ? 0.72 : 1,
            dashArray: isPreviousOutage ? "4 6" : null,
            fillColor: color,
            fillOpacity: isRegionalMetric
              ? regionalFillOpacity(item)
              : isDisclosure
                ? 0.16
                : isPreviousOutage
                  ? 0.1
                  : item.kind === "planned"
                    ? 0.34
                    : 0.38,
          },
        }).addTo(map);
        if (isDisclosure) {
          disclosureLayers.push({ layer, weight: geometryWeight(item) });
          layer.on("click", () => {
            showDisclosure(item);
            restackDisclosureLayers();
          });
          layer.bindPopup(disclosureSummaryPopup(item, labels), { maxWidth: 280 });
          layer.bindTooltip(disclosureTooltip(item, labels), { sticky: true });
        } else if (isRegionalMetric) {
          layer.on("click", () => showRegionalMetric(item));
          layer.bindTooltip(regionalMetricTooltip(item, labels), { sticky: true });
        } else {
          layer.on("click", () => showOperational(item));
          layer.bindTooltip(operationalTooltip(item, labels), { sticky: true });
        }
        const layerBounds = layer.getBounds();
        if (!isDisclosure && !isRegionalMetric && layerBounds.isValid()) {
          bounds.push(layerBounds.getSouthWest());
          bounds.push(layerBounds.getNorthEast());
        }
        if (!isDisclosure && !isRegionalMetric) layer.bringToFront();
        rendered = true;
      }
      if (item.geometry && item.geometry.type === "MultiPolygon") {
        const isDisclosure = item.kind === "disclosure";
        const isRegionalMetric = item.kind === "regional_metric";
        const isPreviousOutage = item.kind === "previous_outage";
        const layer = L.geoJSON(item.geometry, {
          pane: mapPane(item),
          style: {
            color,
            weight: isRegionalMetric
              ? regionalWeight(item)
              : isDisclosure
                ? 2
                : isPreviousOutage
                  ? 2
                  : 3,
            opacity: isRegionalMetric ? 0.36 : isDisclosure ? 0.72 : 1,
            dashArray: isPreviousOutage ? "4 6" : null,
            fillColor: color,
            fillOpacity: isRegionalMetric
              ? regionalFillOpacity(item)
              : isDisclosure
                ? 0.16
                : isPreviousOutage
                  ? 0.1
                  : item.kind === "planned"
                    ? 0.34
                    : 0.38,
          },
        }).addTo(map);
        if (isDisclosure) {
          disclosureLayers.push({ layer, weight: geometryWeight(item) });
          layer.on("click", () => {
            showDisclosure(item);
            restackDisclosureLayers();
          });
          layer.bindPopup(disclosureSummaryPopup(item, labels), { maxWidth: 280 });
          layer.bindTooltip(disclosureTooltip(item, labels), { sticky: true });
        } else if (isRegionalMetric) {
          layer.on("click", () => showRegionalMetric(item));
          layer.bindTooltip(regionalMetricTooltip(item, labels), { sticky: true });
        } else {
          layer.on("click", () => showOperational(item));
          layer.bindTooltip(operationalTooltip(item, labels), { sticky: true });
        }
        const layerBounds = layer.getBounds();
        if (!isDisclosure && !isRegionalMetric && layerBounds.isValid()) {
          bounds.push(layerBounds.getSouthWest());
          bounds.push(layerBounds.getNorthEast());
        }
        if (!isDisclosure && !isRegionalMetric) layer.bringToFront();
        rendered = true;
      }
      if (!rendered && item.lat != null && item.lon != null) {
        const isDisclosure = item.kind === "disclosure";
        const isRegionalMetric = item.kind === "regional_metric";
        const isPreviousOutage = item.kind === "previous_outage";
        const marker = L.circleMarker([item.lat, item.lon], {
          pane: mapPane(item),
          radius: isRegionalMetric
            ? 14
            : isDisclosure
              ? 12
              : isPreviousOutage
                ? 7
                : item.matchType === "direct_match"
                  ? 8
                  : 6,
          color,
          weight: isRegionalMetric ? 2 : isDisclosure ? 3.5 : isPreviousOutage ? 1.5 : 2,
          fillColor: color,
          fillOpacity: isRegionalMetric
            ? 0.48
            : isDisclosure
              ? 0.82
              : isPreviousOutage
                ? 0.38
                : 0.65,
        }).addTo(map);
        if (isDisclosure) {
          marker.on("click", () => showDisclosure(item));
          marker.bindTooltip(disclosureTooltip(item, labels), { sticky: true });
        } else if (isRegionalMetric) {
          marker.on("click", () => showRegionalMetric(item));
          marker.bindTooltip(regionalMetricTooltip(item, labels), { sticky: true });
        } else {
          marker.on("click", () => showOperational(item));
          marker.bindTooltip(operationalTooltip(item, labels), { sticky: true });
        }
        if (!isDisclosure && !isRegionalMetric) marker.bringToFront();
        if (!isDisclosure && !isRegionalMetric) bounds.push([item.lat, item.lon]);
      }
      if (item.geometryKey && item.geometry) renderedGeometryKeys.add(item.geometryKey);
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
    if (data.contextGeometryUrl) {
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
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        if (activeMapFocus) {
          focusMap(activeMapFocus, { remember: false });
        } else {
          refresh();
        }
      });
      observer.observe(this);
    }
  }

  disconnectedCallback() {
    if (this.handleMapFocus) document.removeEventListener("map-focus", this.handleMapFocus);
  }
}

customElements.define("dai-detail-panel", DaiDetailPanel);
customElements.define("outage-map", OutageMap);

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  reloadOnHistoryNavigation();
  syncLanguageForm();
  attachAddressAutocomplete();
  attachLocationSearch();
  attachSearchRouting();
  attachMapFocusCards();
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
  updateShellState();
});
