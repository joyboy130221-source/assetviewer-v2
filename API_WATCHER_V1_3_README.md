# API Watcher v1.3 (BIB v8.14)

## Changes
- Clear Cache is protected by the same PostgreSQL advisory-lock namespace used by watcher execution. A running watcher returns HTTP 409 and the UI shows a blocking informational prompt asking the user to retry after execution completes.
- Available Fields is now a scalable field browser with a stable 280-320px desktop width, minimum 38px item height, internal vertical scrolling, sticky search/header, full-result search, long-value tooltip, and responsive stacking on narrow screens.
- New enrichment actions use the neutral naming `Step` and default keys `step1`, `step2`, etc. Existing saved `lookup*` step keys/names remain unchanged for backward compatibility.
- Existing performance controls remain configurable: polling interval, max records/run, bounded record concurrency, timeout, retry count, checkpoint overlap, and max enrichment steps. Runtime clamping and advisory locking remain enforced server-side.

## Validation
- Server JavaScript syntax checks passed.
- `npm run build` was executed but could not complete because frontend dependencies were not present in the source package.
- `npm ci --no-audit --no-fund` was attempted to restore dependencies but timed out in the execution environment. No incomplete node_modules are included in this archive.
