# API Watcher Event Action UI Fix — v8.22

## Scope
This release fixes the API Watcher Event Action designer so both **6A · Event Action — New Record** and **6B · Event Action — Modified Record** expose an explicit Step Type selector.

Supported Step Types:
- API
- Browser RPA
- Service Bus

## UI architecture
A reusable `WatcherStepTypeSelector` component is used by the shared EventEditor. The selector is rendered independently of the selected action editor, so it remains visible for both 6A and 6B. Legacy definitions without `type` continue to default to `api`.

The selected type conditionally renders the existing API, Browser RPA, or Service Bus editor. No duplicate runtime execution engine was introduced.

## Templates / Available Fields
Event actions receive the API Watcher `stepTemplates` context, including source/system templates and enrichment-step outputs. Browser RPA uses the existing template insertion event mechanism. Service Bus uses its existing active-field insertion mechanism.

## Runtime / monitoring
The existing runtime dispatch remains provider-neutral and supports `EVENT_API`, `EVENT_BROWSER`, and `EVENT_MESSAGE` monitoring entries. Runtime context includes source, enrichment step outputs, source/target record IDs, event type, watcher ID, checkpoint, UUID, and timestamp.

## Performance
Existing configurable API Watcher performance controls are retained. Labels now explicitly clarify that Browser RPA and Service Bus timeout settings apply to both enrichment steps and event actions. Record concurrency, retries, API timeout, max records/run, overlap, and max enrichment steps remain configurable.

## Validation performed
- Confirmed router imports `src/pages/integration/ApiWatcherDesignerPage.tsx`.
- Confirmed both 6A and 6B instantiate the same EventEditor.
- Confirmed EventEditor renders `WatcherStepTypeSelector` with API / Browser RPA / Service Bus options.
- Confirmed there are no `.js` / `.jsx` files under `src` that can shadow TypeScript sources.
- Modified TS/TSX files passed TypeScript parser/transpile validation.
- Modified backend JavaScript syntax checks passed.
- `npm run build` was executed. It did not complete because dependency installation is incomplete in the execution environment; TypeScript reports missing installed type-definition packages such as React, Node, Express, Babel, and related transitive definitions. `npm ci --no-audit --no-fund` was attempted first but timed out. A successful production build is therefore **not claimed**.
