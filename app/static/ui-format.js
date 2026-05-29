export function label(labels, key, fallback) {
  return labels?.[key] || fallback;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDistanceKm(value, labels = {}) {
  if (value === null || value === undefined || value === "")
    return label(labels, "unknown", "unknown");
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return label(labels, "unknown", "unknown");
  return `${(numberValue / 1000).toFixed(2)} km`;
}

export function hasDistanceValue(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

export function detailFactList(facts) {
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

export function formatDuration(seconds, labels = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0) return label(labels, "unknown", "unknown");
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function formatDateTimeCell(value, labels = {}) {
  if (!value) return label(labels, "unknown", "unknown");
  const [date, rawTime = ""] = String(value).replace("T", " ").split(" ");
  const time = rawTime ? rawTime.slice(0, 5) : "";
  return `<span class="block font-semibold text-[#223654]">${escapeHtml(date)}</span>${time ? `<span class="block text-[#4e5662]">${escapeHtml(time)}</span>` : ""}`;
}

export function localizeCause(cause) {
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

export function fetchJson(url, options = {}) {
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
