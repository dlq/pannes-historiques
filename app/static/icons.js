import { escapeHtml } from "./ui-format.js?v=20260717b";

const ICON_SPRITE_URL = "/static/icons.svg?v=20260615info";

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

export function countPillText(value) {
  const span = document.createElement("span");
  span.className = "ph-count-value";
  span.textContent = value ?? 0;
  return span;
}
