# BIB Analytics Builder V1

## Scope
Analytics Builder adds reusable, tenant-aware operational analytics to BIB. Definitions are independent objects so a future Page Builder can embed them by ID.

### V1 capabilities
- Multi-tenant analytics definitions with draft/published lifecycle.
- REST GET data sources using the existing BIB template engine (`{{parameter}}`, `{{uuid}}`).
- Existing encrypted Authentication Profiles can be attached to a data source; secrets remain server-side.
- Header/query parameter templates.
- Configurable JSON Records Path.
- Source API filtering (via templated query parameters) and BIB Engine filtering fallback.
- Aggregations: count, sum, average, min, max; optional dimension/grouping.
- Visualizations: KPI, bar, line, pie/donut, and table.
- Apache ECharts is isolated in `AnalyticsRenderer`; KPI/table remain normal React components.
- Test & Preview before publish.
- Published route `/analytics/:analyticsId` with runtime query parameters.
- `analyticsBuilder` role permission.

## Architecture
- `src/features/analytics/model`: stable BIB-owned analytics contracts (not ECharts option objects).
- `src/features/analytics/services`: API client.
- `src/features/analytics/components`: reusable renderer / ECharts adapter boundary.
- `server/repositories/analytics-repository.js`: persistence only.
- `server/services/analytics-service.js`: retrieval, filtering and aggregation engine.
- `server/api/admin/*`: authenticated CRUD/execution routes.
- `server/api/public-analytics.js`: published analytics execution.

## Database
Startup schema migration creates `analytics_definitions` and an organization index. Existing tables are not changed destructively.

## Filtering
- `Source API`: use `{{dateFrom}}`, `{{dateTo}}`, etc. in REST query parameters so the provider filters the records.
- `BIB Engine`: fetch source records then apply configured filters in BIB. Intended as a fallback for smaller result sets.

## Dependency
Apache ECharts is declared as `echarts ^6.0.0` in `package.json`. Run `npm install` once to refresh/install dependencies and update the lockfile in an environment with npm registry access.

## Build verification in this delivery environment
Backend JavaScript files passed `node --check`. New TypeScript/TSX files passed TypeScript syntax transpilation. A full `npm run build` was attempted, but this sandbox did not have the project's node_modules and npm registry access timed out; TypeScript therefore reported missing existing packages such as React/Vite. Run `npm install && npm run build` in the normal development/deployment environment.

## V1.1 robustness update
- Fixed Analytics execute response unwrapping so record counts are no longer shown as `undefined`.
- Renamed the UI concept from Response Array Path to **Records Path** while retaining the existing `arrayPath` storage property for backward compatibility.
- Added provider-neutral Records Path auto-detection for arbitrary JSON response envelopes. No provider-specific names such as `member`, `data`, or `results` are hardcoded.
- Test & Preview now returns discovered source fields and record-collection candidates; discovered fields are offered to Dimension (Group By) and Measure inputs.
- Explicit invalid Records Paths return a clear validation error instead of silently producing an empty dataset.
- Record discovery treats an array as a dataset boundary so child collections inside records are not incorrectly suggested as peer datasets.
