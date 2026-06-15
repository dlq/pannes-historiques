import {
  countPillText,
  iconNameForStatus,
  phIcon,
  replaceWithIconText,
} from "./icons.js?v=20260613modules";
import { hydrateTimeLabels, isCurrentLocationText } from "./search.js?v=20260613modules";
import {
  fetchJson,
  formatPlannedScheduleParts,
  formatPreviousTimeParts,
  formatRelativeTime,
  label,
} from "./ui-format.js?v=20260608compact";

export const CONTEXT_LAYER_KINDS = {
  current: ["outage"],
  planned: ["planned"],
  previous: ["previous_outage"],
  published: ["disclosure", "regional_metric"],
};

export const LAYER_INFO_KEYS = {
  current: {
    title: "layer_info_current_title",
    body: "layer_info_current_body",
    sections: [
      ["layer_info_provenance", "layer_info_current_provenance"],
      ["layer_info_layout", "layer_info_current_layout"],
      ["layer_info_map", "layer_info_current_map"],
    ],
  },
  planned: {
    title: "layer_info_planned_title",
    body: "layer_info_planned_body",
    sections: [
      ["layer_info_provenance", "layer_info_planned_provenance"],
      ["layer_info_layout", "layer_info_planned_layout"],
      ["layer_info_map", "layer_info_planned_map"],
    ],
  },
  previous: {
    title: "layer_info_previous_title",
    body: "layer_info_previous_body",
    sections: [
      ["layer_info_provenance", "layer_info_previous_provenance"],
      ["layer_info_layout", "layer_info_previous_layout"],
      ["layer_info_map", "layer_info_previous_map"],
    ],
  },
  published: {
    title: "layer_info_published_title",
    body: "layer_info_published_body",
    sections: [
      ["layer_info_provenance", "layer_info_published_provenance"],
      ["layer_info_layout", "layer_info_published_layout"],
      ["layer_info_map", "layer_info_published_map"],
    ],
  },
};

export function contextLayerForKind(kind) {
  for (const [layer, kinds] of Object.entries(CONTEXT_LAYER_KINDS)) {
    if (kinds.includes(kind)) return layer;
  }
  return "current";
}

export function buildMapLayerUrl(layer) {
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

export function focusPayloadForItem(item) {
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

export function layerInfoContent(layer, labels = {}) {
  const config = LAYER_INFO_KEYS[layer];
  if (!config) return null;
  return {
    title: label(labels, config.title, layer),
    body: label(labels, config.body, ""),
    sections: config.sections.map(([headingKey, bodyKey]) => ({
      heading: label(labels, headingKey, headingKey),
      body: label(labels, bodyKey, ""),
    })),
  };
}

export function previousArchiveMapItems(summary) {
  if (summary?.mode !== "municipal_archive" || !Array.isArray(summary.territories)) return [];
  return summary.territories.map((item) => ({
    kind: "previous_outage",
    matchType: "municipal_archive",
    geometryKey: item.geometryKey || item.territoryId,
    geometry: item.geometry,
    lat: item.centroidLat,
    lon: item.centroidLon,
    label: item.territoryName,
    startTime: item.latestStartTime,
    customersAffected: Number(item.customersAffected || 0),
    eventCount: Number(item.eventCount || 0),
    territoryId: item.territoryId,
    designation: item.designation,
  }));
}

export function renderContextRow(item, labels = {}) {
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

export function expandedOperationalRows(matches, kind) {
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

export function displayRowsForLayer(layer, matches, payload = {}) {
  if (layer === "planned") return expandedOperationalRows(matches, "planned");
  if (layer === "previous") {
    if (Array.isArray(payload.previousSidebarMatches)) return payload.previousSidebarMatches;
    if (payload.previousMode === "seen_before_here") {
      const localMatches = (matches || []).filter(
        (item) => item.kind === "previous_outage" && item.matchType === "previous_query_match",
      );
      return localMatches.length
        ? localMatches
        : (matches || []).filter((item) => item.kind === "previous_outage");
    }
    return (matches || []).filter((item) => item.kind === "previous_outage");
  }
  return matches || [];
}

export function previousArchiveLineItems(summary, labels = {}) {
  if (summary?.mode === "municipal_archive" && Array.isArray(summary.territories)) {
    return summary.territories.map((item) => {
      const eventCount = Number(item.eventCount || 0);
      return {
        label: item.territoryName || label(labels, "unknown", "Unknown"),
        middle: item.designation || label(labels, "area", "Area"),
        eventCount,
        count: Number(item.customersAffected || 0),
        icon: "map",
        variant: "municipal_archive",
        focus: previousArchiveMapItems({ mode: "municipal_archive", territories: [item] })[0],
      };
    });
  }
  const items = [];
  for (const item of summary?.windows || []) {
    items.push({
      label: label(labels, item.key, item.key),
      middle: `${item.areas || 0} ${label(labels, "previous_archive_summary_areas", "areas")}`,
      count: item.totalCustomers || 0,
      icon: "archive",
    });
  }
  if (summary?.largest) {
    items.push({
      label: label(labels, summary.largest.key, "Largest"),
      middle: summary.largest.startTime
        ? String(summary.largest.startTime).slice(0, 16)
        : label(labels, "unknown", "Unknown"),
      count: summary.largest.customersAffected || 0,
      icon: "zap",
    });
  }
  for (const item of summary?.latest || []) {
    const startTime = String(item.startTime || "");
    items.push({
      label: startTime ? startTime.slice(0, 10) : label(labels, "unknown", "Unknown"),
      middle: startTime ? startTime.slice(11, 16) : "",
      count: item.customersAffected || 0,
      icon: "calendar",
      section: "latest",
    });
  }
  return items;
}

export function previousArchiveHeaderCount(summary) {
  if (summary?.mode === "municipal_archive" && Array.isArray(summary.territories)) {
    return summary.territories.length;
  }
  return null;
}

export function shouldRenderPreviousArchiveSummary(layer, payload = {}) {
  return (
    layer === "previous" &&
    payload.previousMode === "recent_archive" &&
    Boolean(payload.previousArchiveSummary)
  );
}

export function mapLayerMatchesForPayload(layer, matches, payload = {}) {
  if (layer === "previous") {
    const archiveItems = previousArchiveMapItems(payload.previousArchiveSummary);
    if (archiveItems.length) return archiveItems;
  }
  return (matches || []).filter((item) => contextLayerForKind(item.kind) === layer);
}

export function attachMapLayerToggles() {
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

  const previousHeading = (previousMode, labels) =>
    previousMode === "seen_before_here"
      ? label(labels, "previous_seen_before_here_heading", "Seen Before Here")
      : label(labels, "previous_recent_archive_heading", "Recent Archive");

  const closeLayerInfoOverlay = (root = document) => {
    const overlay = root.querySelector(".ph-layer-info-overlay");
    overlay?.remove();
  };

  const renderLayerInfoOverlay = (section, labels) => {
    const layer = section?.dataset.layerSection;
    const info = layerInfoContent(layer, labels);
    if (!section || !info) return;
    const panel = section.closest(".ph-result-sections") || section;
    closeLayerInfoOverlay(panel);

    const overlay = document.createElement("aside");
    overlay.className = "ph-layer-info-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "false");
    overlay.setAttribute("aria-label", info.title);

    const header = document.createElement("div");
    header.className = "ph-layer-info-header";

    const heading = document.createElement("div");
    heading.className = "ph-layer-info-heading";
    const eyebrow = document.createElement("p");
    eyebrow.className = "ph-layer-info-eyebrow";
    eyebrow.textContent = label(labels, "layer_info_eyebrow", "About this layer");
    const title = document.createElement("h4");
    title.textContent = info.title;
    heading.append(eyebrow, title);

    const close = document.createElement("button");
    close.className = "ph-layer-info-close";
    close.type = "button";
    close.setAttribute("aria-label", label(labels, "layer_info_close", "Close layer information"));
    close.replaceChildren(phIcon("x", "ph-toggle-icon"));
    close.addEventListener("click", () => closeLayerInfoOverlay(panel));

    header.append(heading, close);

    const body = document.createElement("div");
    body.className = "ph-layer-info-body";
    const intro = document.createElement("p");
    intro.className = "ph-layer-info-intro";
    intro.textContent = info.body;
    body.append(intro);

    for (const item of info.sections) {
      const block = document.createElement("section");
      block.className = "ph-layer-info-section";
      const sectionHeading = document.createElement("h5");
      sectionHeading.textContent = item.heading;
      const sectionBody = document.createElement("p");
      sectionBody.textContent = item.body;
      block.append(sectionHeading, sectionBody);
      body.append(block);
    }

    overlay.append(header, body);
    panel.append(overlay);
    close.focus();
  };

  const formatRadiusKm = (radiusM) => {
    const radiusKm = Number(radiusM || 0) / 1000;
    if (!radiusKm) return "";
    return Number.isInteger(radiusKm) ? `${radiusKm}` : `${radiusKm.toFixed(1)}`;
  };

  const setPreviousMode = (section, payload, labels) => {
    if (!section || section.dataset.layerSection !== "previous") return;
    const previousMode = payload?.previousMode || section.dataset.previousMode || "recent_archive";
    section.dataset.previousMode = previousMode;
    const heading = section.querySelector("h3");
    if (heading) heading.textContent = previousHeading(previousMode, labels);
    section.querySelector(".ph-layer-scope-pill")?.remove();
    if (previousMode !== "seen_before_here" || !payload?.previousRadiusM) return;
    const scope = document.createElement("span");
    scope.className = "ph-layer-scope-pill";
    const count = Array.isArray(payload.previousSidebarMatches)
      ? payload.previousSidebarMatches.length
      : "";
    const limit = payload.previousNearestLimit ? `/${payload.previousNearestLimit}` : "";
    scope.textContent = `${count}${limit} ${label(labels, "previous_nearest_scope", "nearest")} · ${formatRadiusKm(payload.previousRadiusM)} km`;
    heading?.after(scope);
  };

  const renderPreviousArchiveSummary = (rows, summary, labels) => {
    rows.innerHTML = "";
    const addSummaryRow = (item) => {
      const row = document.createElement("div");
      row.className = "ph-context-summary-row ph-context-summary-row--previous";
      if (item.variant === "municipal_archive") {
        row.classList.add("ph-context-summary-row--municipal");
      }
      if (item.focus) {
        row.classList.add("ph-match-row");
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("data-map-focus", JSON.stringify(focusPayloadForItem(item.focus)));
      }

      const labelPill = document.createElement("span");
      labelPill.className = "ph-row-pill ph-row-pill-previous-date";
      replaceWithIconText(labelPill, item.icon || "archive", item.label);

      const middlePill = document.createElement("span");
      middlePill.className = "ph-row-pill ph-row-pill-previous-time";
      middlePill.textContent = item.middle;
      row.append(labelPill, middlePill);

      if (item.eventCount != null) {
        const eventPill = document.createElement("span");
        eventPill.className = "ph-context-pill ph-context-pill-previous ph-context-pill-events";
        eventPill.setAttribute(
          "aria-label",
          `${item.eventCount || 0} ${label(labels, "previous_archive_events", "events")}`,
        );
        eventPill.replaceChildren(
          countPillText(item.eventCount || 0),
          phIcon("zap", "ph-count-icon"),
        );
        row.append(eventPill);
      }

      const countPill = document.createElement("p");
      countPill.className = "ph-context-pill ph-context-pill-previous";
      countPill.setAttribute(
        "aria-label",
        `${item.count || 0} ${label(labels, "clients", "clients")}`,
      );
      countPill.replaceChildren(countPillText(item.count || 0), phIcon("users", "ph-count-icon"));
      row.append(countPill);
      rows.append(row);
    };

    const lineItems = previousArchiveLineItems(summary, labels);
    const latestItems = lineItems.filter((item) => item.section === "latest");
    const primaryItems = lineItems.filter((item) => item.section !== "latest");
    for (const item of primaryItems) addSummaryRow(item);
    if (latestItems.length && summary?.mode !== "municipal_archive") {
      const heading = document.createElement("p");
      heading.className = "ph-context-subhead";
      heading.textContent = label(labels, "previous_archive_latest", "Latest");
      rows.append(heading);
      for (const item of latestItems) addSummaryRow(item);
    }
  };

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

  const renderLayerRows = (section, rows, layer, matches, labels, payload = {}) => {
    setPreviousMode(section, payload, labels);
    const displayMatches = displayRowsForLayer(layer, matches, payload);
    const rendersArchiveSummary = shouldRenderPreviousArchiveSummary(layer, payload);
    rows.innerHTML = "";
    if (rendersArchiveSummary) {
      renderPreviousArchiveSummary(rows, payload.previousArchiveSummary, labels);
      const archiveCount = previousArchiveHeaderCount(payload.previousArchiveSummary);
      setLayerCount(
        section,
        archiveCount,
        layerIconName(layer),
        label(labels, "previous_archive_summary_areas", "areas"),
      );
    } else {
      for (const item of displayMatches) rows.appendChild(renderContextRow(item, labels));
      hydrateTimeLabels(rows);
      setLayerCount(section, displayMatches.length, layerIconName(layer), layerNoun(layer, labels));
    }
    if (!rendersArchiveSummary && !displayMatches.length) {
      rows.innerHTML = `<p class="ph-context-empty">${document.documentElement.lang === "fr" ? "Aucune donnée pour cette couche." : "No data for this layer."}</p>`;
    }
    section.dataset.layerLoaded = "true";
    section._layerMatches = matches;
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
        const matches = mapLayerMatchesForPayload(layer, payload.matches || [], payload);
        renderLayerRows(section, rows, layer, matches, toggleLabels(), payload);
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
    const infoButton = event.target.closest("[data-layer-info]");
    if (infoButton) {
      event.preventDefault();
      event.stopPropagation();
      const section = infoButton.closest("[data-layer-section]");
      if (section) renderLayerInfoOverlay(section, toggleLabels());
      return;
    }

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

  document.body.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeLayerInfoOverlay();
  });
}
