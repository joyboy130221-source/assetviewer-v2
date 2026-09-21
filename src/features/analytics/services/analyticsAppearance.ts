import type {
  AnalyticsAppearance,
  AnalyticsPalette,
} from "../model/analytics.types";

export const DEFAULT_ANALYTICS_APPEARANCE: AnalyticsAppearance = {
  colorMode: "palette",
  palette: "default",
  singleColor: "#2563eb",
  categoryColors: {},
};

export const ANALYTICS_PALETTES: Record<AnalyticsPalette, readonly string[]> = {
  default: [
    "#2563eb",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
    "#06b6d4",
    "#84cc16",
    "#f97316",
  ],
  cool: [
    "#2563eb",
    "#0891b2",
    "#0d9488",
    "#4f46e5",
    "#7c3aed",
    "#0284c7",
    "#059669",
    "#6366f1",
  ],
  warm: [
    "#dc2626",
    "#ea580c",
    "#d97706",
    "#ca8a04",
    "#db2777",
    "#e11d48",
    "#c2410c",
    "#a16207",
  ],
  vivid: [
    "#7c3aed",
    "#db2777",
    "#2563eb",
    "#16a34a",
    "#ea580c",
    "#0891b2",
    "#dc2626",
    "#65a30d",
  ],
  professional: [
    "#334155",
    "#0369a1",
    "#0f766e",
    "#475569",
    "#4338ca",
    "#047857",
    "#9a3412",
    "#6d28d9",
  ],
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeAppearance(
  value?: Partial<AnalyticsAppearance>,
): AnalyticsAppearance {
  const palette =
    value?.palette && value.palette in ANALYTICS_PALETTES
      ? value.palette
      : DEFAULT_ANALYTICS_APPEARANCE.palette;
  return {
    colorMode: value?.colorMode ?? DEFAULT_ANALYTICS_APPEARANCE.colorMode,
    palette,
    singleColor:
      value?.singleColor && HEX_COLOR.test(value.singleColor)
        ? value.singleColor
        : DEFAULT_ANALYTICS_APPEARANCE.singleColor,
    categoryColors: value?.categoryColors ?? {},
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function colorForCategory(
  category: string,
  index: number,
  appearanceValue?: Partial<AnalyticsAppearance>,
): string {
  const appearance = normalizeAppearance(appearanceValue);
  const palette = ANALYTICS_PALETTES[appearance.palette];
  if (appearance.colorMode === "single") return appearance.singleColor;
  if (appearance.colorMode === "custom" && appearance.categoryColors[category])
    return appearance.categoryColors[category];
  if (appearance.colorMode === "category" || appearance.colorMode === "custom")
    return palette[stableHash(category) % palette.length];
  return palette[index % palette.length];
}
