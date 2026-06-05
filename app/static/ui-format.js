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
  return `<dl class="mt-3 grid gap-x-5 gap-y-2 border-y border-[#d7dde6]/70 py-3 text-sm sm:grid-cols-2">
    ${visibleFacts
      .map(
        ([factLabel, value]) => `
          <div class="flex min-w-0 items-baseline justify-between gap-3 sm:block">
            <dt class="text-[#6b778a]">${escapeHtml(factLabel)}</dt>
            <dd class="min-w-0 truncate font-medium text-[#223654] sm:mt-0.5">${escapeHtml(value)}</dd>
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

export function formatShortDateTime(value, labels = {}) {
  if (!value) return label(labels, "unknown", "unknown");
  const [date, rawTime = ""] = String(value).replace("T", " ").split(" ");
  const time = rawTime ? rawTime.slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

export function shortDateTimeParts(value, labels = {}) {
  if (!value) return { date: label(labels, "unknown", "unknown"), time: "" };
  const [date, rawTime = ""] = String(value).replace("T", " ").split(" ");
  return { date, time: rawTime ? rawTime.slice(0, 5) : "" };
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const parsed = new Date(String(value).trim().replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compactDuration(ms, lang = "en") {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (minutes < 60) return lang === "fr" ? `${minutes} min` : `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    if (lang === "fr") return `${hours} h`;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round(hours / 24);
  if (lang === "fr") return `${days} j`;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function compactScheduleDuration(ms, lang = "en") {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (!remainingHours) return lang === "fr" ? `${days} j` : `${days} d`;
  return lang === "fr" ? `${days} j ${remainingHours} h` : `${days} d ${remainingHours} h`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function monthDay(date, lang) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-US", {
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(".", "");
}

function timeLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function archiveDateLabel(date, lang) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(".", "")
    .replace(",", "");
}

export function formatRelativeTime(value, labels = {}, now = new Date()) {
  const date = parseLocalDateTime(value);
  if (!date) return formatShortDateTime(value, labels);
  const lang = document.documentElement.lang || "en";
  const delta = date.getTime() - now.getTime();
  if (Math.abs(delta) < 60000) return lang === "fr" ? "maintenant" : "now";
  const duration = compactDuration(delta, lang);
  if (delta < 0) return lang === "fr" ? `il y a ${duration}` : `${duration} ago`;
  return lang === "fr" ? `dans ${duration}` : `in ${duration}`;
}

export function formatPlannedScheduleParts(startValue, endValue, labels = {}) {
  const start = parseLocalDateTime(startValue);
  const end = parseLocalDateTime(endValue);
  if (!start) {
    const fallback = formatShortDateTime(startValue, labels);
    return { schedule: fallback, date: fallback, window: "", duration: "" };
  }
  const lang = document.documentElement.lang || "en";
  const duration =
    end && end > start ? compactScheduleDuration(end.getTime() - start.getTime(), lang) : "";
  if (end && dateKey(start) !== dateKey(end)) {
    const schedule = `${monthDay(start, lang)} ${timeLabel(start)} → ${monthDay(end, lang)} ${timeLabel(end)}`;
    return {
      schedule,
      date: schedule,
      window: "",
      duration,
    };
  }
  const schedule = end
    ? `${monthDay(start, lang)} ${timeLabel(start)}-${timeLabel(end)}`
    : `${monthDay(start, lang)} ${timeLabel(start)}`;
  return {
    schedule,
    date: schedule,
    window: "",
    duration,
  };
}

export function formatPreviousTimeParts(value, labels = {}) {
  const date = parseLocalDateTime(value);
  if (!date) {
    const parts = shortDateTimeParts(value, labels);
    return { date: parts.date, time: parts.time };
  }
  const lang = document.documentElement.lang || "en";
  return {
    date: archiveDateLabel(date, lang),
    time: timeLabel(date),
  };
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
