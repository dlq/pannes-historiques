import { iconNameForStatus, phIconMarkup } from "./icons.js?v=20260613modules";
import {
  escapeHtml,
  formatDistanceKm,
  formatDuration,
  formatPlannedScheduleParts,
  formatPreviousTimeParts,
  formatRelativeTime,
  hasDistanceValue,
  label,
  localizeCause,
} from "./ui-format.js?v=20260608compact";

const DETAIL_EXTRACTED_ROW_LIMIT = 80;

export function detailPill(iconName, text, className = "", title = "") {
  if (text === null || text === undefined || text === "") return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  const titleAttr = title
    ? ` title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${text}`)}"`
    : "";
  return `<span class="ph-detail-pill${extraClass}"${titleAttr}>${phIconMarkup(iconName)}<span>${escapeHtml(text)}</span></span>`;
}

export function detailPillGrid(pills, className = "") {
  const visible = pills.filter(Boolean).join("");
  if (!visible) return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  return `<div class="ph-detail-pill-grid${extraClass}">${visible}</div>`;
}

export function sourcePdfLink(url) {
  if (!url) return "";
  const text = document.documentElement.lang === "fr" ? "PDF Hydro-Québec" : "Hydro-Québec PDF";
  const title =
    document.documentElement.lang === "fr"
      ? "Ouvrir le PDF source sur le site d'Hydro-Québec"
      : "Open the source PDF on Hydro-Québec";
  return `<a class="ph-detail-source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${phIconMarkup("external-link")}<span>${escapeHtml(text)}</span></a>`;
}

export function detailSection(title, iconName, body, className = "") {
  if (!body) return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  return `
    <section class="ph-detail-section${extraClass}">
      <div class="ph-detail-section-title">${phIconMarkup(iconName, "ph-layer-count-icon")}${escapeHtml(title)}</div>
      ${body}
    </section>
  `;
}

export function detailSourceRow({ main = [], metrics = [], className = "" }) {
  const mainMarkup = main.filter(Boolean).join("");
  const metricMarkup = metrics.filter(Boolean).join("");
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  if (!mainMarkup && !metricMarkup) return "";
  return `
    <article class="ph-detail-source-row${extraClass}">
      ${mainMarkup ? `<div class="ph-detail-source-main">${mainMarkup}</div>` : ""}
      ${metricMarkup ? `<div class="ph-detail-source-metrics">${metricMarkup}</div>` : ""}
    </article>
  `;
}

function normalizedDisclosureText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function sameDisclosureArea(value, item) {
  const normalizedValue = normalizedDisclosureText(value);
  if (!normalizedValue) return false;
  return [item.label, item.municipalityCode, item.precisionLabel]
    .map(normalizedDisclosureText)
    .filter(Boolean)
    .includes(normalizedValue);
}

function disclosureEventWindow(event, labels = {}) {
  const startParts = formatPreviousTimeParts(event.start_time, labels);
  const endParts = formatPreviousTimeParts(event.end_time, labels);
  const startLabel = startParts.time ? `${startParts.date} ${startParts.time}` : startParts.date;
  if (!event.end_time) return startLabel;
  if (startParts.date === endParts.date && startParts.time && endParts.time) {
    return `${startParts.date} ${startParts.time}-${endParts.time}`;
  }
  const endLabel = endParts.time ? `${endParts.date} ${endParts.time}` : endParts.date;
  return `${startLabel} -> ${endLabel}`;
}

function formatDisclosureEventDuration(seconds, labels = {}) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return label(labels, "unknown", "unknown");
  if (value < 3600) return `${Math.max(1, Math.round(value / 60))} min`;
  return formatDuration(value, labels);
}

function disclosureEventRow(event, item, labels = {}) {
  const rowArea =
    event.row_area && !sameDisclosureArea(event.row_area, item)
      ? detailPill("map", event.row_area, "ph-disclosure-event-pill--area")
      : "";
  const customerCount = Number(event.customers_affected);
  const customers =
    Number.isFinite(customerCount) && customerCount > 0
      ? detailPill(
          "users",
          customerCount,
          "ph-detail-pill--count ph-disclosure-event-pill--customers",
        )
      : "";
  const areaClass = rowArea ? " ph-disclosure-event-row--with-area" : "";
  const customersClass = customers ? " ph-disclosure-event-row--with-customers" : "";
  return `
    <article class="ph-disclosure-event-row${areaClass}${customersClass}">
      <div class="ph-disclosure-event-row-line ph-disclosure-event-row-line--time">
        ${detailPill("calendar", disclosureEventWindow(event, labels), "ph-disclosure-event-pill--time")}
        ${detailPill("clock", formatDisclosureEventDuration(event.duration_seconds, labels), "ph-detail-pill--count ph-disclosure-event-pill--duration")}
      </div>
      <div class="ph-disclosure-event-row-line ph-disclosure-event-row-line--details">
        ${detailPill("zap", localizeCause(event.cause) || label(labels, "unknown", "unknown"), "ph-disclosure-event-pill--cause")}
        ${rowArea}
        ${customers}
      </div>
    </article>
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
function disclosurePopup(item, labels = {}) {
  const causes = (item.topCauses || [])
    .map(
      (cause) =>
        `<li>${detailPill("zap", `${localizeCause(cause.cause) || label(labels, "unknown", "unknown")} (${cause.count})`, "ph-detail-pill--soft")}</li>`,
    )
    .join("");
  const allEvents = item.recentEvents || [];
  const visibleEvents = allEvents.slice(0, DETAIL_EXTRACTED_ROW_LIMIT);
  const rowCount = item.recordCount || allEvents.length;
  const rowNote =
    allEvents.length > visibleEvents.length || rowCount > visibleEvents.length
      ? document.documentElement.lang === "fr"
        ? `${visibleEvents.length} sur ${rowCount} lignes affichées`
        : `Showing ${visibleEvents.length} of ${rowCount} rows`
      : "";
  const events = visibleEvents.map((event) => disclosureEventRow(event, item, labels)).join("");
  return `
      ${causes ? detailSection(label(labels, "top_causes", "Top causes"), "zap", `<ul class="ph-detail-cause-list">${causes}</ul>`) : ""}
      ${
        events
          ? detailSection(
              label(labels, "extracted_rows", "Extracted rows"),
              "file-search",
              `${rowNote ? `<p class="ph-detail-row-note">${escapeHtml(rowNote)}</p>` : ""}
              <div class="ph-detail-source-list ph-detail-source-list--fill">${events}</div>`,
              "ph-detail-section--scroll",
            )
          : ""
      }
  `;
}

export function disclosureSummaryPopup(item, labels = {}) {
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
function regionalBurdenText(item, labels = {}) {
  return (
    item.regionalBurdenLabel || label(labels, "regional_colour_legend", "Regional outage burden")
  );
}
export class DaiDetailPanel extends HTMLElement {
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
    this.hidden = false;
    this.innerHTML = detailPanelShell({
      tone: "disclosure",
      eyebrow: title,
      title: item.label || label(labels, "disclosure", "Disclosure"),
      subtitle: sourceLabel,
      sourceAction: sourcePdfLink(item.sourceUrl),
      body: `<div class="ph-detail-scroll">${disclosurePopup(item, labels)}</div>`,
      labels,
    });
  }

  renderRegionalMetric(item) {
    const labels = this.uiLabels();
    const title = this.getAttribute("title-label") || "DAI details";
    const burdenLabel = regionalBurdenText(item, labels);
    const unknownLabel = label(labels, "unknown", "unknown");
    const regionalSourceMetrics = (metric) => [
      detailPill(
        "zap",
        metric.outage_count ?? metric.outageCount ?? unknownLabel,
        "ph-detail-pill--count",
        label(labels, "outages", "Outages"),
      ),
      detailPill(
        "clock",
        metric.average_duration_minutes == null && metric.averageDurationMinutes == null
          ? unknownLabel
          : `${metric.average_duration_minutes ?? metric.averageDurationMinutes} min`,
        "ph-detail-pill--count",
        label(labels, "average_duration", "Average duration"),
      ),
      detailPill(
        "map",
        metric.continuity_index_minutes ?? metric.continuityIndexMinutes ?? unknownLabel,
        "ph-detail-pill--count",
        burdenLabel,
      ),
      detailPill(
        "clock-rewind",
        metric.long_outage_count ?? metric.longOutageCount ?? unknownLabel,
        "ph-detail-pill--count",
        label(labels, "outages_over_8h", "> 8h"),
      ),
    ];
    const sourceMetricRows = (item.metrics || []).filter((metric) => {
      const metricPeriod = metric.period_label || metric.year || "";
      const itemPeriod = item.periodLabel || item.year || "";
      return metric.source_dai !== item.sourceDai || String(metricPeriod) !== String(itemPeriod);
    });
    const rows = sourceMetricRows
      .map((metric) => {
        return detailSourceRow({
          main: [
            detailPill("calendar", metric.period_label || metric.year || unknownLabel),
            detailPill("archive", metric.source_dai || ""),
          ],
          metrics: regionalSourceMetrics(metric),
        });
      })
      .join("");
    const sourceCount = (item.sourceDais || []).length || 1;
    const sourceLabel = label(
      labels,
      sourceCount === 1 ? "dai_source" : "dai_sources",
      sourceCount === 1 ? "DAI source" : "DAI sources",
    );
    const latestRow = detailSourceRow({
      className: "ph-detail-source-row--primary",
      main: [
        detailPill("calendar", item.periodLabel || item.year || unknownLabel),
        detailPill("archive", item.sourceDai || ""),
      ],
      metrics: regionalSourceMetrics(item),
    });
    const body = rows
      ? `${detailSection(
          label(labels, "latest_map_source", "latest shown on map"),
          "map",
          latestRow,
        )}
        ${detailSection(
          document.documentElement.lang === "fr" ? "Autres sources DAI" : "Other DAI sources",
          "layers",
          `<div class="ph-detail-source-list ph-detail-source-list--fill">${rows}</div>`,
          "ph-detail-section--scroll",
        )}`
      : detailSection(label(labels, "latest_map_source", "latest shown on map"), "map", latestRow);
    this.hidden = false;
    this.innerHTML = detailPanelShell({
      tone: "regional",
      eyebrow: title,
      title: item.label || label(labels, "regional_colour_legend", "Regional outage burden"),
      subtitle: `${sourceCount} ${sourceLabel} · ${label(labels, "latest_map_source", "latest shown on map")}: ${item.sourceDai}`,
      sourceAction: sourcePdfLink(item.sourceUrl),
      body,
      labels,
    });
  }

  renderOperational(item) {
    const labels = this.uiLabels();
    const isPreviousOutage = item.kind === "previous_outage";
    const isPlanned = item.kind === "planned";
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
