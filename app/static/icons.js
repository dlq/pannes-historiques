import { escapeHtml } from "./ui-format.js?v=20260706a";

export const ICON_SPRITE_URL = "/static/icons.svg?v=20260615info";
const DETAIL_EXTRACTED_ROW_LIMIT = 80;

export function phIcon(name, className = "") {
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

export function phIconMarkup(name, className = "ph-pill-icon") {
  const classes = ["ph-icon", ...String(className).split(/\s+/).filter(Boolean)]
    .map((item) => escapeHtml(item))
    .join(" ");
  return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="${escapeHtml(ICON_SPRITE_URL)}#ph-icon-${escapeHtml(name)}"></use></svg>`;
}
export function replaceWithIconText(element, iconName, text, iconClass = "ph-pill-icon") {
  element.replaceChildren(phIcon(iconName, iconClass), document.createTextNode(text || ""));
}

export function countPillText(value) {
  const span = document.createElement("span");
  span.className = "ph-count-value";
  span.textContent = value ?? 0;
  return span;
}

export function iconNameForStatus(status, statusLabel = "") {
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
