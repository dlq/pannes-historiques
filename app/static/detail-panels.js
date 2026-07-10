import { phIconMarkup } from "./icons.js?v=20260710a";
import {
  escapeHtml,
  formatDuration,
  formatPreviousTimeParts,
  label,
  localizeCause,
} from "./ui-format.js?v=20260710a";

const DETAIL_EXTRACTED_ROW_LIMIT = 80;

function factRow(labelText, value) {
  if (value === null || value === undefined || value === "") return "";
  return (
    `<li><span class="ph-detail-fact-label">${escapeHtml(labelText)}</span>` +
    `<span class="ph-detail-fact-value">${escapeHtml(String(value))}</span></li>`
  );
}

function factList(rows) {
  const visible = rows.filter(Boolean).join("");
  if (!visible) return "";
  return `<ul class="ph-detail-facts">${visible}</ul>`;
}

function staticRow({ title, sub = "", metricValue = "", metricLabel = "" }) {
  return `
    <li>
      <div class="ph-row ph-row--static">
        <span class="ph-row-main">
          <span class="ph-row-title">${escapeHtml(title)}</span>
          ${sub ? `<span class="ph-row-sub">${escapeHtml(sub)}</span>` : ""}
        </span>
        ${
          metricValue !== "" && metricValue != null
            ? `<span class="ph-row-metric">
                <span class="ph-row-metric-value">${escapeHtml(String(metricValue))}</span>
                ${metricLabel ? `<span class="ph-row-metric-label">${escapeHtml(metricLabel)}</span>` : ""}
              </span>`
            : ""
        }
      </div>
    </li>
  `;
}

function detailShell({ title, subtitle = "", action = "", body = "", labels = {} }) {
  return `
    <header class="ph-sheet-header">
      <div class="ph-sheet-header-text">
        <h2 class="ph-sheet-title">${escapeHtml(title || label(labels, "unknown", "unknown"))}</h2>
        ${subtitle ? `<p class="ph-sheet-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <button type="button"
              class="ph-round-button"
              data-dai-detail-close
              aria-label="${escapeHtml(label(labels, "close", "Close"))}">${phIconMarkup("x")}</button>
    </header>
    ${action}
    ${body}
  `;
}

function pdfAction(url, labels = {}) {
  if (!url) return "";
  const isFrench = (document.documentElement.lang || "fr") === "fr";
  const text = isFrench ? "Document PDF Hydro-Québec" : "Hydro-Québec source PDF";
  return `
    <a class="ph-action-button ph-action-button--primary ph-detail-action"
       href="${escapeHtml(url)}"
       target="_blank"
       rel="noopener noreferrer">${phIconMarkup("external-link")}<span>${escapeHtml(text)}</span></a>
  `;
}

function eventWindow(event, labels = {}) {
  const startParts = formatPreviousTimeParts(event.start_time, labels);
  const endParts = formatPreviousTimeParts(event.end_time, labels);
  const startLabel = startParts.time ? `${startParts.date} ${startParts.time}` : startParts.date;
  if (!event.end_time) return startLabel;
  if (startParts.date === endParts.date && startParts.time && endParts.time) {
    return `${startParts.date} ${startParts.time}–${endParts.time}`;
  }
  const endLabel = endParts.time ? `${endParts.date} ${endParts.time}` : endParts.date;
  return `${startLabel} → ${endLabel}`;
}

function eventDuration(seconds, labels = {}) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 3600) return `${Math.max(1, Math.round(value / 60))} min`;
  return formatDuration(value, labels);
}

function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

export class DaiDetailPanel extends HTMLElement {
  uiLabels() {
    return this.labels || {};
  }

  connectedCallback() {
    if (this.dataset.closeBound !== "1") {
      this.dataset.closeBound = "1";
      const handleClose = (event) => {
        if (!event.target.closest("[data-dai-detail-close]")) return;
        event.preventDefault();
        this.renderEmpty();
      };
      this.addEventListener("click", handleClose);
      this.addEventListener("pointerup", handleClose);
    }
    this.renderEmpty();
  }

  renderEmpty() {
    this.hidden = true;
    this.innerHTML = "";
  }

  renderDisclosure(item) {
    const labels = this.uiLabels();
    const isFrench = (document.documentElement.lang || "fr") === "fr";
    const sources = (item.sourceDais || []).join(", ") || item.sourceDai || "";
    const period =
      item.startMin && item.startMax
        ? `${String(item.startMin).slice(0, 10)} → ${String(item.startMax).slice(0, 10)}`
        : "";
    const facts = factList([
      factRow(
        label(labels, "published_dai_records", "Published DAI records"),
        item.recordCount ?? "",
      ),
      factRow(label(labels, "period", "Period"), period),
      factRow(
        label(labels, "total_disclosed_duration", "Total disclosed duration"),
        item.durationSecondsTotal ? formatDuration(item.durationSecondsTotal, labels) : "",
      ),
      factRow(label(labels, "dai_sources", "DAI sources"), sources),
    ]);
    const causes = (item.topCauses || [])
      .map((cause) =>
        staticRow({
          title: localizeCause(cause.cause) || label(labels, "unknown", "unknown"),
          metricValue: cause.count,
          metricLabel: label(labels, "rows", "rows"),
        }),
      )
      .join("");
    const allEvents = item.recentEvents || [];
    const visibleEvents = allEvents.slice(0, DETAIL_EXTRACTED_ROW_LIMIT);
    const rowCount = item.recordCount || allEvents.length;
    const rowNote =
      allEvents.length > visibleEvents.length || rowCount > visibleEvents.length
        ? isFrench
          ? `${visibleEvents.length} sur ${rowCount} lignes affichées.`
          : `Showing ${visibleEvents.length} of ${rowCount} rows.`
        : "";
    const events = visibleEvents
      .map((event) => {
        const customers = Number(event.customers_affected);
        return staticRow({
          title: eventWindow(event, labels),
          sub: joinParts([
            localizeCause(event.cause) || "",
            event.row_area || "",
            eventDuration(event.duration_seconds, labels),
          ]),
          metricValue: Number.isFinite(customers) && customers > 0 ? customers : "",
          metricLabel: label(labels, "clients", "customers"),
        });
      })
      .join("");
    this.hidden = false;
    this.innerHTML = detailShell({
      title: item.label || label(labels, "disclosure", "Disclosure"),
      subtitle: joinParts([this.getAttribute("title-label") || "", item.precisionLabel || ""]),
      action: pdfAction(item.sourceUrl, labels),
      body: `
        ${facts}
        ${
          causes
            ? `<p class="ph-group-heading">${escapeHtml(label(labels, "top_causes", "Top causes"))}</p>
               <ul class="ph-row-list">${causes}</ul>`
            : ""
        }
        ${
          events
            ? `<p class="ph-group-heading">${escapeHtml(label(labels, "extracted_rows", "Extracted rows"))}</p>
               ${rowNote ? `<p class="ph-caveat ph-caveat--tight">${escapeHtml(rowNote)}</p>` : ""}
               <ul class="ph-row-list">${events}</ul>`
            : ""
        }
      `,
      labels,
    });
  }

  renderRegionalMetric(item) {
    const labels = this.uiLabels();
    const isFrench = (document.documentElement.lang || "fr") === "fr";
    const unknownLabel = label(labels, "unknown", "unknown");
    const sourceCount = (item.sourceDais || []).length || 1;
    const sourceLabel = label(
      labels,
      sourceCount === 1 ? "dai_source" : "dai_sources",
      sourceCount === 1 ? "DAI source" : "DAI sources",
    );
    const facts = factList([
      factRow(label(labels, "period", "Period"), item.periodLabel || item.year || ""),
      factRow(label(labels, "dai_source", "DAI source"), item.sourceDai || ""),
      factRow(label(labels, "outages", "Outages"), item.outageCount ?? ""),
      factRow(
        label(labels, "average_duration", "Average duration"),
        item.averageDurationMinutes != null ? `${item.averageDurationMinutes} min` : "",
      ),
      factRow(label(labels, "outages_over_8h", "Outages > 8 h"), item.longOutageCount ?? ""),
    ]);
    const otherMetrics = (item.metrics || []).filter((metric) => {
      const metricPeriod = metric.period_label || metric.year || "";
      const itemPeriod = item.periodLabel || item.year || "";
      return metric.source_dai !== item.sourceDai || String(metricPeriod) !== String(itemPeriod);
    });
    const rows = otherMetrics
      .map((metric) => {
        const avg = metric.average_duration_minutes ?? metric.averageDurationMinutes;
        const longCount = metric.long_outage_count ?? metric.longOutageCount;
        const outages = metric.outage_count ?? metric.outageCount;
        return staticRow({
          title: joinParts([
            String(metric.period_label || metric.year || unknownLabel),
            metric.source_dai || "",
          ]),
          sub: joinParts([
            avg != null ? `${avg} min ${isFrench ? "en moyenne" : "average"}` : "",
            longCount != null ? `${longCount} > 8 h` : "",
          ]),
          metricValue: outages ?? "",
          metricLabel: label(labels, "outages", "Outages").toLowerCase(),
        });
      })
      .join("");
    this.hidden = false;
    this.innerHTML = detailShell({
      title: item.label || label(labels, "regional_colour_legend", "Regional outage burden"),
      subtitle: joinParts([
        `${sourceCount} ${sourceLabel}`,
        `${label(labels, "latest_map_source", "latest shown on map")}: ${item.sourceDai || unknownLabel}`,
      ]),
      action: pdfAction(item.sourceUrl, labels),
      body: `
        ${facts}
        ${
          rows
            ? `<p class="ph-group-heading">${escapeHtml(isFrench ? "Autres sources DAI" : "Other DAI sources")}</p>
               <ul class="ph-row-list">${rows}</ul>`
            : ""
        }
      `,
      labels,
    });
  }
}
