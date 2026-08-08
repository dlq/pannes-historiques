const BASE_MAP_FONT = "Noto Sans Regular";

export function optimizeBaseMapStyle(style) {
  const sources = { ...(style.sources || {}) };
  delete sources.ne2_shaded;

  const layers = (style.layers || []).flatMap((layer) => {
    if (layer.source === "ne2_shaded") return [];
    if (layer.paint?.["fill-pattern"] != null) return [];
    if (layer.type !== "symbol") return [layer];

    const layout = { ...(layer.layout || {}) };
    const hasText = layout["text-field"] != null;
    if (!hasText) return [];

    delete layout["icon-image"];
    if (layout["text-font"] != null) layout["text-font"] = [BASE_MAP_FONT];
    return [{ ...layer, layout }];
  });

  return { ...style, sources, layers };
}
