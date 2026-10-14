# Analytics Builder v2 — Time Series & Viewer Toolbar

## Scope
- **Time Series mode** next to the existing Aggregate mode. It plots one or more measures over a real time axis, with stacked "separate" charts or one "combined" chart.
- **Time range**: viewers pick a preset or a custom from/to range. The range can be passed to the source API and is always applied to the returned records.
- **Viewer toolbar** on published charts. It can offer time range, interval, chart type, layout, show/hide measures and filters. The author decides what is exposed.
- **Theme**: Automatic, Light or Dark. It can be overridden with `?darkTheme=true|false` or `?theme=dark|light` for BECS/BIC embedding.
- **POST data sources** with a JSON request body. String values in the body may contain `{{parameter}}` templates, for query-style APIs such as BECS `ExecuteProject`.
- **Test values** for runtime parameters in the builder, so Test & Preview calls the real API with a real asset code.
- **Records Path discovery** now finds records inside small wrapper arrays, for example `DATA.Tab[0].Attributes.Attribute`.

Out of scope (next phase): Analytics Dashboards that combine several definitions on one page.

## Backward compatibility
- Every new property is optional. A definition without `mode` is an Aggregate definition and runs exactly as before.
- No database migration is needed. The new settings live in the existing `analytics_definitions.definition` JSON.
- Runtime auto-detection of a blank Records Path is unchanged; it still picks the shallowest array. Only the builder's Test & Preview uses the new recommendation, which is the largest record collection.
- Existing published links keep working. Toolbar and time range are off until enabled.

## Configuration
### Data Shape → Time Series
- **Time field**: ISO 8601 strings and epoch numbers (seconds or milliseconds) are accepted.
- **Measures**: each measure has a field path, label, unit, chart type override (for example Step for status values), decimals and color. Empty color uses the palette.
  - After Test & Preview, **Add N numeric fields under …** adds all numeric siblings in one click.
- **Layout**: separate (one chart per measure; crosshair and zoom are synchronised) or combined.
- **Chart type**: Line, Step, Area, Bar, Points or Table. Table shows time × measures, newest first.
- **Interval**: Raw, 1m, 5m, 15m, 30m, 1h, 6h or 1d, with Average/Min/Max/Sum/Last/Count per interval.
- **Max points per series**: larger series are reduced with LTTB downsampling, which keeps peaks and troughs.
- Show points, smooth lines, zoom & pan.

### Time Range
- **Default range**, the **presets** offered, and whether a **custom from/to** is allowed.
- **Send start/end as parameter** (optional): parameter names plus format (ISO UTC, epoch ms, epoch s). Use them in the endpoint or query parameters as `{{startTime}}`.
  - Integration Hub always filters the returned records to the range as well.
- Aggregate mode: choose the **Time field** the range filters on.

### Viewer Toolbar
- Chart types viewers can switch to (pick two or more). The configured type remains the default.
- Time Series only: separate/combined switch, show/hide measures, interval selector.
- **Viewer filters** come in two kinds:
  - **Integration Hub**: field + operator, shown as a dropdown (options from the data or a fixed list), text or number.
  - **Source API**: the value is sent as a named `{{parameter}}`.

Toolbar choices are view-only. They are never saved to the definition, and they are kept in the page URL so a view can be shared: `_preset`, `_from`, `_to`, `_bucket`, `_chart`, `_layout`, `_hide`, `_f_<filterId>`.

## Security
- The server accepts only the controls the author exposed. Values for other filters, disallowed presets and unknown intervals are ignored.
- Every value is validated: type, length, fixed options, range order and maximum span. Invalid values return HTTP 400.
- Viewer-owned query keys never reach `{{parameter}}` templates.
- **The published (anonymous) definition no longer includes the data source.** URL, headers and query parameters stay server-side, as do static filter values. This closes an exposure in V1, where headers could contain credentials.
- Public errors no longer echo source response bodies.

## Source API timeout (v2.1)
- **REST Data Source → Timeout (seconds)** sets how long Integration Hub waits for the source API. It is stored as `dataSource.action.timeoutMs`.
- **Blank** (the default, and every definition saved before v2.1) uses `ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS`. That is 15 s, which was the fixed timeout before this change, so existing charts behave exactly as before.
- Values are clamped to 1 s – `ANALYTICS_MAX_SOURCE_TIMEOUT_MS`. They are clamped on save and again at run time, so lowering the ceiling also caps definitions that are already saved.
- The builder reads the default and ceiling from `GET /api/admin/analytics?limits=1`. It warns when a value is out of range.
- After Test & Preview, the builder shows how long the source took. It warns when that is above 80 % of the timeout.
- A timeout returns **HTTP 504** with `code: "SOURCE_TIMEOUT"`:
  - Builder: a message that tells the author to raise the timeout or narrow the query.
  - Published pages: a generic "took too long" message, with no URL or source details.
  - The log gets a one-line warning, not a stack trace.
- Connection failures come back as **HTTP 502** with `code: "SOURCE_UNREACHABLE"` and a readable reason. These are failures before any HTTP response: undici's 10 s connect timeout (`UND_ERR_CONNECT_TIMEOUT`), refused connections, DNS failures. Published pages get a generic message. These failures are independent of the configured timeout, because the TCP connection never opened.
- With a managed bearer token, a 401 refresh retry gets its own full timeout. The token request itself uses the Authentication Profile's *Token Request Timeout*.
- Keep the hosting platform's request/function timeout above the ceiling. Otherwise the platform cuts the request before Integration Hub can return the 504.

## Per-measure toolbars (v2.2)
In **Measures**, set a measure's **Toolbar** to **Own** to give its chart a toolbar of its own. The author picks the controls: **Interval**, **Time range** and/or **Chart types** (two or more for a switch). Everything not enabled there follows the shared toolbar.

**Rules**
- Own toolbars appear only in **Separate** layout. In Combined layout, or for hidden measures, per-measure choices are not applied and nothing is sent for them.
- Time range per measure needs **Time Range** enabled and uses its presets and Custom setting.
- A measure's own choice is kept when the viewer changes the shared toolbar. Each chart's ↺ button returns it to the shared settings, and the main reset clears everything.
- The aggregation per interval (Average, Max, …) remains the definition's setting.
- Layout, show/hide measures and viewer filters stay shared. They decide which charts exist or change the single source request.

**Synchronised zoom.** Charts share zoom and crosshair while every chart shows the same time range. As soon as one differs, every chart is unlinked: each gets its own zoom slider and range label, and a "Zoom not linked" note appears. The charts re-link when the ranges match again. Different chart types or intervals keep the link, because the time axis is the same.

**URL state:** `_m.<measureId>.preset|from|to|bucket|chart`. Old links keep working.

**Source calls and performance**
- **Range not sent to the source** (default): still one call. Each measure's range is cut from the same response by binary search over a timeline that is sorted once, so per-measure ranges add no source load.
- **Range sent as `{{startTime}}`/`{{endTime}}`:**
  - Measures with the same range share one call, and the shared range is fetched first.
  - At most `ANALYTICS_MAX_SOURCE_CALLS_PER_RUN` calls run per view, `ANALYTICS_SOURCE_CONCURRENCY` at a time, each within the source timeout.
  - Measures beyond the cap show "uses more than N different time ranges" on their own chart. A failed call only fails its measures; the run fails as a whole only when every call fails.
- **Optional cache** (`ANALYTICS_SOURCE_CACHE_TTL_SECONDS`, off by default):
  - It reuses identical successful responses per server process.
  - The key is a SHA-256 of the organization plus the full rendered request (method, URL, headers, parameters, body, Authentication Profile), so tenants and different requests never share an entry.
  - Failed and oversized responses are not cached.
  - The toolbar's Refresh sends `fresh` (`_fresh=1` on published pages) and bypasses the read.
- Test & Preview reports the number of source calls and cache hits.

**Partial reloads (v2.2.1).** A change on a measure's own toolbar reloads only that measure.
- The viewer sends `only` (`_only=<id,…>` on published pages), and the server computes and fetches only those measures. With the range sent to the source, that is just the call for that measure's range.
- Only that chart dims and shows a spinner. The other charts keep their data and zoom and stay usable.
- Each chart builds its own chart option, so unchanged charts are never redrawn. When charts unlink or relink, they keep their zoom.
- A changed shared control, Refresh, or a change made while a full load is running still reloads everything.
- Stale responses are ignored: a newer change on the same measure, or a full load, supersedes them.
- A failed partial reload shows its error on that chart only.

**Errors per measure:** published pages show a safe message (no URL or source details); the builder shows the source's own message.

**Backward compatibility:** a missing measure `toolbar` normalizes to `{ enabled: false }`. Definitions without own toolbars produce the same requests and results as before; this is covered by tests. No DB migration is needed.

**Code**
- Backend:
  - `analytics-source.js`: source call, timeout and connection errors, cache.
  - `analytics-source-plan.js`: pure call planner.
  - `analytics-runtime.js`: per-measure validation.
  - `analytics-timeseries.js`: shared timeline and range slicing.
  - `lib/ttl-cache.js`.
- Frontend:
  - `services/analyticsMeasureView.ts`: the rules above, in one place.
  - `components/toolbarControls.tsx`: controls shared by both toolbars.
  - `MeasureToolbar.tsx` and `editors/MeasureToolbarEditor.tsx`.
- Tests: `server/tests/analytics-measure-toolbar.test.js`.

## Environment variables (optional)
| Variable | Default | Purpose |
| --- | --- | --- |
| `ANALYTICS_MAX_POINTS_PER_SERIES` | 5000 | Ceiling for points per series |
| `ANALYTICS_DEFAULT_POINTS_PER_SERIES` | 2000 | Default when a definition sets none |
| `ANALYTICS_MAX_MEASURES` | 24 | Measures per definition |
| `ANALYTICS_MAX_RUNTIME_FILTERS` | 10 | Toolbar filters per definition |
| `ANALYTICS_MAX_FILTER_OPTIONS` | 100 | Dropdown options per filter |
| `ANALYTICS_MAX_RUNTIME_VALUE_LENGTH` | 200 | Length of a viewer value |
| `ANALYTICS_MAX_RANGE_DAYS` | 366 | Widest custom range |
| `ANALYTICS_MAX_REQUEST_BODY_BYTES` | 65536 | Largest POST body a definition may define |
| `ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS` | 15000 | Source API timeout when a definition leaves it blank |
| `ANALYTICS_MAX_SOURCE_TIMEOUT_MS` | 60000 | Ceiling for any definition's timeout (hard limit 120000) |
| `ANALYTICS_MAX_SOURCE_CALLS_PER_RUN` | 3 | Source calls one view may make (1–10) |
| `ANALYTICS_SOURCE_CONCURRENCY` | 2 | Source calls of one view running at once (1–10) |
| `ANALYTICS_SOURCE_CACHE_TTL_SECONDS` | 0 | Reuse identical source responses; 0 = off (0–3600) |
| `ANALYTICS_SOURCE_CACHE_MAX_ENTRIES` | 100 | Cached responses per server process |
| `ANALYTICS_SOURCE_CACHE_MAX_ENTRY_BYTES` | 2000000 | Larger responses are not cached |

## Example: BECS IoT telemetry (ExecuteProject, POST)
1. **General**:
   - Name it "MS Azure IoT – Panel telemetry".
   - Set Runtime query parameters to `CODE, organizationID, iModelID`.
   - Fill in the **Test values** (e.g. `V-1101`, the organization ID, the iModel ID).
2. **REST Data Source**:
   - Method **POST**, endpoint `https://uks-dev-becs.bentley.com/BECS.Execution.Services/api/ExecuteProject`, plus the Authentication Profile for BECS.
   - Request body:
     ```json
     {
       "returnAsXML": false,
       "projectName": "PS_D_DISPATCHER",
       "projectVariables": [
         { "name": "CODE", "value": "{{CODE}}" },
         { "name": "EventType", "value": "IoT" },
         { "name": "TabName", "value": "MS Azure IoT" },
         { "name": "organizationID", "value": "{{organizationID}}" },
         { "name": "iModelID", "value": "{{iModelID}}" }
       ]
     }
     ```
   - Leave Records Path blank and run **Test & Preview**. The builder sets `DATA.Tab[0].Attributes.Attribute`; run Test & Preview again.
3. **Data Shape → Time Series**:
   - Time field `X`.
   - Click **Add 6 numeric fields under Y.telemetry**.
   - Set units, and set PanelStatus Chart = **Step**, Decimals = 0.
   - Layout: Separate.
   - Ignore the response's `UoM_X`/`UoM_Y`: they are swapped in the source.
4. **Time Range**:
   - Enable it, with default **All data** (the API decides how far back it returns) and presets 1h/4h/24h.
   - Allow custom.
   - ExecuteProject takes no start/end variables, so leave the parameter names empty. Integration Hub filters the readings.
5. **Viewer Toolbar**: enable it, with chart types Line/Step/Area/Table, layout switch, measure toggle and interval selector.
6. **Visualization**: Theme Automatic.
7. **Publish** and embed `/analytics/<id>?CODE=V-1101&organizationID=<org>&iModelID=<model>&darkTheme=true`. This uses the same parameters as the BECS `iotcharts` page.

## Architecture
- Backend: `server/services/analytics-definition.js` (contract, defaults, normalization for every route), `analytics-runtime.js` (viewer input validation, public query split), `analytics-timeseries.js` (time parsing, range, bucketing, LTTB, stats), `analytics-service.js` (`run(definition, context, runtimeInput)`), `server/config/analytics-limits.js`.
- Frontend: `AnalyticsViewer` (toolbar + renderer + loading, shared by the builder preview and the published page), `AnalyticsToolbar`, `TimeSeriesChart`, `useEChart` (the single ECharts lifecycle), editors in `components/editors/`, and view state in `services/analyticsViewState.ts`.
- ECharts stays inside the renderer layer, so definitions remain renderer-neutral for the future Page Builder.

## Tests
`npm test` runs every `server/tests/*.test.js`. `analytics-source-timeout.test.js` checks the timeout end to end against a slow local HTTP server: default, clamping, 504 and public message. `analytics-timeseries.test.js` (node:test, no new dependencies) against the BDPI sample in `server/tests/fixtures/`. It covers discovery, field types, series, bucketing, downsampling, time range including invalid input, toolbar filter validation, source parameters, aggregate backward compatibility and the public query split.

## Verification notes
- The backend tests pass in the delivery environment.
- The frontend was type-checked with dependency stubs because the npm registry was unavailable. Run `npm install && npm run build` and check the screens in a browser before release.
