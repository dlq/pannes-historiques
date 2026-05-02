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

class OutageMap extends HTMLElement {
  connectedCallback() {
    const raw = this.getAttribute("data-map") || "{}";
    const data = JSON.parse(raw);
    this.innerHTML = '<div class="h-full w-full"></div>';
    const root = this.firstElementChild;
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
    const orderedMatches = [...(data.matches || [])].sort((left, right) => {
      if (left.kind === "disclosure" && right.kind !== "disclosure") return -1;
      if (left.kind !== "disclosure" && right.kind === "disclosure") return 1;
      return 0;
    });
    for (const item of orderedMatches) {
      const color =
        item.kind === "planned" ? "#0ea5e9" : item.kind === "disclosure" ? "#10b981" : "#f59e0b";
      let rendered = false;
      if (item.geometry && item.geometry.type === "Polygon") {
        const isDisclosure = item.kind === "disclosure";
        const layer = L.geoJSON(item.geometry, {
          style: {
            color,
            weight: isDisclosure ? 2.5 : item.matchType === "direct_match" ? 3 : 2,
            dashArray: isDisclosure ? "8 5" : null,
            fillColor: color,
            fillOpacity: isDisclosure ? 0.18 : item.kind === "planned" ? 0.16 : 0.22,
          },
        }).addTo(map);
        layer.bindPopup(`${item.kind}: ${item.label || ""}`);
        const layerBounds = layer.getBounds();
        if (layerBounds.isValid()) {
          bounds.push(layerBounds.getSouthWest());
          bounds.push(layerBounds.getNorthEast());
        }
        if (!isDisclosure) layer.bringToFront();
        rendered = true;
      }
      if (item.geometry && item.geometry.type === "MultiPolygon") {
        const layer = L.geoJSON(item.geometry, {
          style: {
            color,
            weight: 2.5,
            dashArray: "8 5",
            fillColor: color,
            fillOpacity: 0.18,
          },
        }).addTo(map);
        layer.bindPopup(`${item.kind}: ${item.label || ""}`);
        const layerBounds = layer.getBounds();
        if (layerBounds.isValid()) {
          bounds.push(layerBounds.getSouthWest());
          bounds.push(layerBounds.getNorthEast());
        }
        rendered = true;
      }
      if (!rendered && item.lat != null && item.lon != null) {
        const isDisclosure = item.kind === "disclosure";
        const marker = L.circleMarker([item.lat, item.lon], {
          radius: isDisclosure ? 12 : item.matchType === "direct_match" ? 8 : 6,
          color,
          weight: isDisclosure ? 3 : 2,
          fillColor: color,
          fillOpacity: isDisclosure ? 0.82 : 0.65,
        })
          .addTo(map)
          .bindPopup(`${item.kind}: ${item.label || ""}`);
        if (!isDisclosure) marker.bringToFront();
        bounds.push([item.lat, item.lon]);
      }
    }
    const refresh = () => {
      map.invalidateSize();
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24] });
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
