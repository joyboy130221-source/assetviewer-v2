# Analytics Visualization Appearance

Analytics definitions support an optional `visualization.appearance` object. Existing analytics without it remain valid and receive server/client defaults.

## Color modes
- `palette`: assigns palette colors in result order.
- `single`: uses one selected color.
- `category`: deterministically assigns a palette color from the category label, keeping a category stable across refreshes.
- `custom`: uses configured per-category colors and deterministic palette fallback for unmapped categories.

## Palettes
`default`, `cool`, `warm`, `vivid`, and `professional` are BIB-owned configuration presets. The rendering adapter is centralized in `src/features/analytics/services/analyticsAppearance.ts`.

Appearance is stored inside the existing analytics definition JSONB, so no database migration is required. The same renderer is used by Live Preview and published analytics.
