let autocompleteTimer = null;

function syncLanguageForm() {
  const searchForm = document.querySelector("#search-form");
  const languageForm = document.querySelector("#language-form");
  if (!searchForm || !languageForm) return;
  const q = searchForm.querySelector('[name="q"]')?.value || "";
  const radius = searchForm.querySelector('[name="radius_m"]')?.value || "5000";
  const days = searchForm.querySelector('[name="days"]')?.value || "365";
  const includePlanned = searchForm.querySelector('[name="include_planned"]')?.checked ? "1" : "0";
  languageForm.querySelector('[data-sync="q"]').value = q;
  languageForm.querySelector('[data-sync="radius_m"]').value = radius;
  languageForm.querySelector('[data-sync="days"]').value = days;
  languageForm.querySelector('[data-sync="include_planned"]').value = includePlanned;
}

function attachAddressAutocomplete() {
  const input = document.querySelector("#address-input");
  const panel = document.querySelector("#address-suggestions");
  if (!input || !panel || input.dataset.autocompleteBound === "1") return;
  input.dataset.autocompleteBound = "1";

  const closePanel = () => {
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
        "block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-stone-100";
      button.dataset.addressValue = item.value || item.label || "";
      button.dataset.addressLabel = item.label || item.value || "";

      const primary = document.createElement("span");
      primary.className = "block font-medium text-slate-900";
      primary.textContent = item.value || item.label || "";

      const secondary = document.createElement("span");
      secondary.className = "block text-xs text-slate-500";
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

class CacheFreshnessBadge extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute("label") || "Freshness";
    const latest = this.getAttribute("latest");
    const value = latest ? new Date(latest).toLocaleString() : "No snapshot";
    this.innerHTML = `<div class="rounded-[1.5rem] bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200"><div class="text-xs uppercase tracking-[0.2em]">${label}</div><div class="mt-1 font-medium">${value}</div></div>`;
  }
}

class OutageTimeline extends HTMLElement {
  connectedCallback() {
    const raw = this.getAttribute("data-items") || "[]";
    const items = JSON.parse(raw);
    if (!items.length) {
      this.innerHTML =
        '<div class="rounded-2xl bg-stone-100 p-5 text-sm text-slate-600">No archived outage has been observed near this address yet.</div>';
      return;
    }
    const bars = items
      .slice(0, 18)
      .map((item) => {
        const value = Math.max(14, Math.round((item.confidence || 0.2) * 100));
        const hue = item.outage_kind === "planned" ? "bg-sky-400" : "bg-amber-400";
        const label = (item.start_time || "").slice(5, 10) || "--";
        return `
        <div class="flex min-w-0 flex-1 flex-col justify-end">
          <div class="flex h-40 items-end rounded-2xl bg-white/70 px-1">
            <div class="w-full rounded-t-xl ${hue}" style="height:${value}%; min-height:16px"></div>
          </div>
          <div class="mt-2 text-center text-[10px] text-slate-500">${label}</div>
        </div>
      `;
      })
      .join("");
    this.innerHTML = `
      <div class="rounded-[1.5rem] bg-stone-100 p-4">
        <div class="mb-3 flex items-center gap-4 text-xs text-slate-600">
          <div class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded-sm bg-amber-400"></span><span>Outage archive</span></div>
        </div>
        <div class="flex items-end gap-2 overflow-x-auto">${bars}</div>
      </div>
    `;
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

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function disclosurePopup(item) {
  const causes = (item.topCauses || [])
    .map((cause) => `<li>${escapeHtml(cause.cause)} (${escapeHtml(cause.count)})</li>`)
    .join("");
  const events = (item.recentEvents || [])
    .map(
      (event) =>
        `<tr class="border-b border-blue-100 last:border-0">
          <td class="py-2 pr-3 font-medium text-slate-950">${escapeHtml(event.start_time || "unknown")}</td>
          <td class="py-2 pr-3">${escapeHtml(event.end_time || "")}</td>
          <td class="py-2 pr-3">${escapeHtml(event.source_dai || "")}</td>
          <td class="py-2 pr-3">${escapeHtml(event.row_area || "")}</td>
          <td class="py-2 pr-3">${escapeHtml(event.cause || "unknown")}</td>
          <td class="py-2 pr-3 text-right">${escapeHtml(formatDuration(event.duration_seconds))}</td>
          <td class="py-2 text-right">${escapeHtml(event.customers_affected ?? "")}</td>
        </tr>`,
    )
    .join("");
  const sources = (item.sourceDais || []).map((source) => escapeHtml(source)).join(", ");
  return `
    <div class="space-y-2 text-sm">
      <div class="font-semibold">${escapeHtml(item.label || "")}</div>
      ${sources ? `<div>Sources: ${sources}</div>` : `<div>${escapeHtml(item.sourceDai || "")}</div>`}
      <div>${escapeHtml(item.recordCount || 0)} published DAI records</div>
      <div>${escapeHtml(item.startMin || "unknown")} → ${escapeHtml(item.startMax || "unknown")}</div>
      <div>Total disclosed duration: ${escapeHtml(formatDuration(item.durationSecondsTotal))}</div>
      ${causes ? `<div><div class="font-medium">Top causes</div><ul class="ml-4 list-disc">${causes}</ul></div>` : ""}
      ${
        events
          ? `<div>
              <div class="font-medium">Extracted rows</div>
              <div class="mt-2 max-h-[24rem] overflow-auto rounded-xl bg-white ring-1 ring-blue-100">
                <table class="w-full min-w-[54rem] text-left text-xs">
                  <thead class="sticky top-0 bg-blue-50 uppercase tracking-[0.12em] text-blue-700">
                    <tr>
                      <th class="px-3 py-2">Start</th>
                      <th class="px-3 py-2">End</th>
                      <th class="px-3 py-2">DAI</th>
                      <th class="px-3 py-2">Area</th>
                      <th class="px-3 py-2">Cause</th>
                      <th class="px-3 py-2 text-right">Duration</th>
                      <th class="px-3 py-2 text-right">Customers</th>
                    </tr>
                  </thead>
                  <tbody class="text-slate-700">${events}</tbody>
                </table>
              </div>
            </div>`
          : ""
      }
      <div class="text-xs text-slate-500">${escapeHtml(item.geographyType || "")} · ${escapeHtml(item.precisionLabel || "")}</div>
    </div>
  `;
}

function itemPopup(item) {
  return `${escapeHtml(item.kind)}: ${escapeHtml(item.label || "")}`;
}

function metricValue(item) {
  if (Number.isFinite(item.continuityIndexMinutes)) return item.continuityIndexMinutes;
  if (Number.isFinite(item.outageCount)) return item.outageCount;
  if (Number.isFinite(item.longOutageCount)) return item.longOutageCount;
  return 0;
}

function metricColor(value, maxValue) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(maxValue, 1)));
  if (ratio > 0.8) return "#991b1b";
  if (ratio > 0.6) return "#dc2626";
  if (ratio > 0.4) return "#f97316";
  if (ratio > 0.2) return "#facc15";
  return "#fef3c7";
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

class DaiDetailPanel extends HTMLElement {
  connectedCallback() {
    this.renderEmpty();
  }

  renderEmpty() {
    const title = this.getAttribute("title-label") || "DAI details";
    const empty = this.getAttribute("empty-label") || "Click a blue DAI area on the map.";
    this.innerHTML = `
      <div class="rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <div class="font-semibold text-slate-900">${escapeHtml(title)}</div>
        <p class="mt-2">${escapeHtml(empty)}</p>
      </div>
    `;
  }

  renderDisclosure(item) {
    const title = this.getAttribute("title-label") || "DAI details";
    this.innerHTML = `
      <div class="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200">
        <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-blue-700">${escapeHtml(title)}</p>
            <h4 class="mt-1 text-base font-semibold text-slate-950">${escapeHtml(item.label || "")}</h4>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml((item.sourceDais || []).join(", ") || item.sourceDai || "")}</p>
          </div>
          <div class="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-100">${escapeHtml(item.recordCount || 0)} rows</div>
        </div>
        <div class="max-h-[28rem] overflow-auto pr-2">
          ${disclosurePopup(item)}
        </div>
      </div>
    `;
  }

  renderRegionalMetric(item) {
    const title = this.getAttribute("title-label") || "DAI details";
    const rows = (item.metrics || [])
      .map(
        (metric) => `
          <tr class="border-b border-rose-100 last:border-0">
            <td class="py-2 pr-3 font-medium text-slate-950">${escapeHtml(metric.period_label || metric.year || "unknown")}</td>
            <td class="py-2 pr-3">${escapeHtml(metric.source_dai || "")}</td>
            <td class="py-2 pr-3 text-right">${escapeHtml(metric.outage_count ?? "unknown")}</td>
            <td class="py-2 pr-3 text-right">${escapeHtml(metric.average_duration_minutes ?? "unknown")}</td>
            <td class="py-2 pr-3 text-right">${escapeHtml(metric.continuity_index_minutes ?? "unknown")}</td>
            <td class="py-2 text-right">${escapeHtml(metric.long_outage_count ?? "")}</td>
          </tr>
        `,
      )
      .join("");
    const sourceCount = (item.sourceDais || []).length || 1;
    this.innerHTML = `
      <div class="rounded-[1.5rem] bg-rose-50 p-4 ring-1 ring-rose-200">
        <p class="text-xs uppercase tracking-[0.2em] text-rose-700">${escapeHtml(title)}</p>
        <h4 class="mt-1 text-base font-semibold text-slate-950">${escapeHtml(item.label || "")}</h4>
        <p class="mt-1 text-sm text-slate-600">${escapeHtml(sourceCount)} DAI source${sourceCount === 1 ? "" : "s"} · latest shown on map: ${escapeHtml(item.sourceDai)}</p>
        <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div class="rounded-xl bg-white px-3 py-2 ring-1 ring-rose-100"><dt class="text-slate-500">Period</dt><dd class="font-semibold text-slate-950">${escapeHtml(item.periodLabel || item.year || "unknown")}</dd></div>
          <div class="rounded-xl bg-white px-3 py-2 ring-1 ring-rose-100"><dt class="text-slate-500">Outages</dt><dd class="font-semibold text-slate-950">${escapeHtml(item.outageCount ?? "unknown")}</dd></div>
          <div class="rounded-xl bg-white px-3 py-2 ring-1 ring-rose-100"><dt class="text-slate-500">Average duration</dt><dd class="font-semibold text-slate-950">${escapeHtml(item.averageDurationMinutes ?? "unknown")} min</dd></div>
          <div class="rounded-xl bg-white px-3 py-2 ring-1 ring-rose-100"><dt class="text-slate-500">IC brut</dt><dd class="font-semibold text-slate-950">${escapeHtml(item.continuityIndexMinutes ?? "unknown")} min</dd></div>
          <div class="rounded-xl bg-white px-3 py-2 ring-1 ring-rose-100"><dt class="text-slate-500">Outages > 8h</dt><dd class="font-semibold text-slate-950">${escapeHtml(item.longOutageCount ?? "unknown")}</dd></div>
        </dl>
        ${
          rows
            ? `<div class="mt-4 max-h-[28rem] overflow-auto rounded-xl bg-white ring-1 ring-rose-100">
                <table class="w-full min-w-[42rem] text-left text-sm">
                  <thead class="sticky top-0 bg-rose-50 text-xs uppercase tracking-[0.12em] text-rose-700">
                    <tr>
                      <th class="px-3 py-2">Period</th>
                      <th class="px-3 py-2">DAI</th>
                      <th class="px-3 py-2 text-right">Outages</th>
                      <th class="px-3 py-2 text-right">Avg min</th>
                      <th class="px-3 py-2 text-right">IC brut</th>
                      <th class="px-3 py-2 text-right">&gt; 8h</th>
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
}

class OutageMap extends HTMLElement {
  connectedCallback() {
    const raw = this.getAttribute("data-map") || "{}";
    const data = JSON.parse(raw);
    this.innerHTML = '<div class="h-full w-full"></div>';
    const root = this.firstElementChild;
    const detailPanel = this.parentElement?.querySelector("dai-detail-panel");
    const map = L.map(root).setView(data.center || [46.8, -71.2], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    const bounds = [];
    if (data.center) {
      L.marker(data.center)
        .addTo(map)
        .bindPopup(data.addressLabel || "Address");
      bounds.push(data.center);
    }
    const metricMax = Math.max(
      1,
      ...(data.matches || [])
        .filter((item) => item.kind === "regional_metric")
        .map((item) => metricValue(item)),
    );
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
    const orderedMatches = [...(data.matches || [])].sort((left, right) => {
      const rank = { regional_metric: 0, disclosure: 1, planned: 2, outage: 2 };
      const rankDifference = (rank[left.kind] ?? 3) - (rank[right.kind] ?? 3);
      if (rankDifference !== 0) return rankDifference;
      if (left.kind === "disclosure") {
        return geometryWeight(right) - geometryWeight(left);
      }
      return 0;
    });
    for (const item of orderedMatches) {
      const color =
        item.kind === "planned"
          ? "#06b6d4"
          : item.kind === "disclosure"
            ? "#2563eb"
            : item.kind === "regional_metric"
              ? metricColor(metricValue(item), metricMax)
              : "#f59e0b";
      let rendered = false;
      if (item.geometry && item.geometry.type === "Polygon") {
        const isDisclosure = item.kind === "disclosure";
        const isRegionalMetric = item.kind === "regional_metric";
        const layer = L.geoJSON(item.geometry, {
          style: {
            color,
            weight: isRegionalMetric
              ? 1.5
              : isDisclosure
                ? 2.5
                : item.matchType === "direct_match"
                  ? 3
                  : 2,
            dashArray: isDisclosure ? "8 5" : null,
            fillColor: color,
            fillOpacity: isRegionalMetric
              ? 0.28
              : isDisclosure
                ? 0.18
                : item.kind === "planned"
                  ? 0.16
                  : 0.22,
          },
        }).addTo(map);
        if (isDisclosure) {
          layer.on("click", () => showDisclosure(item));
          layer.bindTooltip(item.label || item.sourceDai || "DAI", { sticky: true });
        } else if (isRegionalMetric) {
          layer.on("click", () => showRegionalMetric(item));
          layer.bindTooltip(
            `${item.label || "Region"} · IC ${item.continuityIndexMinutes ?? "?"}`,
            {
              sticky: true,
            },
          );
        } else {
          layer.bindPopup(itemPopup(item));
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
        const layer = L.geoJSON(item.geometry, {
          style: {
            color,
            weight: isRegionalMetric ? 1.5 : 2.5,
            dashArray: isDisclosure ? "8 5" : null,
            fillColor: color,
            fillOpacity: isRegionalMetric ? 0.28 : isDisclosure ? 0.18 : 0.22,
          },
        }).addTo(map);
        if (isDisclosure) {
          layer.on("click", () => showDisclosure(item));
          layer.bindTooltip(item.label || item.sourceDai || "DAI", { sticky: true });
        } else if (isRegionalMetric) {
          layer.on("click", () => showRegionalMetric(item));
          layer.bindTooltip(
            `${item.label || "Region"} · IC ${item.continuityIndexMinutes ?? "?"}`,
            {
              sticky: true,
            },
          );
        } else {
          layer.bindPopup(itemPopup(item));
        }
        const layerBounds = layer.getBounds();
        if (!isDisclosure && !isRegionalMetric && layerBounds.isValid()) {
          bounds.push(layerBounds.getSouthWest());
          bounds.push(layerBounds.getNorthEast());
        }
        rendered = true;
      }
      if (!rendered && item.lat != null && item.lon != null) {
        const isDisclosure = item.kind === "disclosure";
        const isRegionalMetric = item.kind === "regional_metric";
        const marker = L.circleMarker([item.lat, item.lon], {
          radius: isRegionalMetric
            ? 14
            : isDisclosure
              ? 12
              : item.matchType === "direct_match"
                ? 8
                : 6,
          color,
          weight: isRegionalMetric ? 2 : isDisclosure ? 3 : 2,
          fillColor: color,
          fillOpacity: isRegionalMetric ? 0.48 : isDisclosure ? 0.82 : 0.65,
        }).addTo(map);
        if (isDisclosure) {
          marker.on("click", () => showDisclosure(item));
          marker.bindTooltip(item.label || item.sourceDai || "DAI", { sticky: true });
        } else if (isRegionalMetric) {
          marker.on("click", () => showRegionalMetric(item));
          marker.bindTooltip(
            `${item.label || "Region"} · IC ${item.continuityIndexMinutes ?? "?"}`,
            {
              sticky: true,
            },
          );
        } else {
          marker.bindPopup(itemPopup(item));
        }
        if (!isDisclosure && !isRegionalMetric) marker.bringToFront();
        if (!isDisclosure && !isRegionalMetric) bounds.push([item.lat, item.lon]);
      }
    }
    if ((data.matches || []).some((item) => item.kind === "regional_metric")) {
      const legend = L.control({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create(
          "div",
          "rounded-xl bg-white/90 px-3 py-2 text-xs text-slate-700 shadow",
        );
        div.innerHTML = "Region color: IC brut (minutes)";
        return div;
      };
      legend.addTo(map);
    }
    const refresh = () => {
      map.invalidateSize();
      if (data.center && Number.isFinite(data.radiusM)) {
        const searchBounds = L.circle(data.center, {
          radius: Math.max(data.radiusM, 250),
        }).getBounds();
        map.fitBounds(searchBounds, { padding: [24, 24], maxZoom: 16 });
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
      } else if (data.center) {
        map.setView(data.center, 14);
      }
    };
    requestAnimationFrame(() => setTimeout(refresh, 0));
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => refresh());
      observer.observe(this);
    }
  }
}

customElements.define("cache-freshness-badge", CacheFreshnessBadge);
customElements.define("outage-timeline", OutageTimeline);
customElements.define("dai-detail-panel", DaiDetailPanel);
customElements.define("outage-map", OutageMap);

document.addEventListener("DOMContentLoaded", () => {
  syncLanguageForm();
  attachAddressAutocomplete();
  document.body.addEventListener("input", syncLanguageForm);
  document.body.addEventListener("change", syncLanguageForm);
});

document.body.addEventListener("htmx:afterSwap", () => {
  syncLanguageForm();
  attachAddressAutocomplete();
});
