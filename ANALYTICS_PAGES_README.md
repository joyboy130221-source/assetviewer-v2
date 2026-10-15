# Analytics Pages (v1)

An **Analytics Page** shows one of several published analytics behind one link. An optional **dropdown** lets viewers choose which one. Charts themselves are unchanged: a page only decides which analytic to open and which `{{parameters}}` it receives.

Find it under **Integration → Analytics Pages**. It uses the Analytics Builder permission, so no role changes are needed.

## Dropdown on or off

| Setting | Viewers see | Item API called |
|---|---|---|
| **Off** (default for new pages) | The **default chart** with its fixed parameters | No |
| **On** | Dropdown plus the chart of the selected item | Only when items come from an API |

Turning the dropdown off keeps all of its settings (items, API, rules), and they come back when you turn it on again. A host can embed the page link from day one; enabling the dropdown later needs no change in BIC/BECS.

## Dropdown items

- **A fixed list:** label/value pairs entered in the builder.
- **An API response:** a REST request with the same options as an analytic's data source:
  - GET or POST with a JSON body, headers and query parameters
  - Authentication Profile, timeout and Records Path
  - **Label field** (shown in the dropdown) and **Value field** (passed to charts)

  The request can use page parameters (`{{CODE}}`, …). It runs server-side only, so credentials and the raw response never reach the browser.

BECS example:
- **Records Path:** `DATA.Tab`
- **Label and Value field:** `Name`

## Rules (which chart an item opens)

- **Order:** rules are checked top to bottom, and the first match wins.
- **Matching:** each rule matches the item's **label** or **value** with *equals*, *starts with* or *contains*, ignoring case by default.
- **Result:** each rule opens one analytic and maps chart parameters from the **selected item value**, the **selected item label**, or a **fixed value**.

| Rule | Chart | Parameters |
|---|---|---|
| Label equals `MS Azure IoT` | Panel telemetry | `TabName ← Selected item value` |
| Label starts with `4D IoT data` | 4D IoT chart | `TabName ← Selected item value` |

A new API item such as "4D IoT data – Pressure" matches rule 2 automatically.

**Items without a rule** can show a "not configured" message (the default), be hidden, or open the default chart.

**Test items** in the builder lists every item and the rule and chart it opens. Each rule shows which tested items it matches.

## Parameters and security

- **Page parameters:** list them under Page parameters (e.g. `CODE, EventType, organizationID, iModelID`). These are the only values taken from the host link; any other link parameter is ignored.
- **Mapped values win:** values a rule maps from the selected item always override link values. For example, `TabName` in the BECS body is set by the server from the selection and can't be replaced via `?TabName=…`.
- **Selection is validated:** the selected item must exist in the item list the server resolved itself. Anything else returns `400 ITEM_NOT_AVAILABLE`.
- **Same organization only:** a page only opens analytics of its own organization. Published pages only open **published** analytics; drafts work in the builder preview only.
- **Nothing leaked to viewers:** published pages never receive the item API request, rules, chart ids or parameter values. Errors shown to anonymous viewers carry no URLs or source details.

## Link, theme and embedding

- **Link:** `/analytics-page/<id>?CODE=V-1101&EventType=IoT&organizationID=…&iModelID=…`
- **Selection in the link:** with **Remember the selection in the link** on, the URL gets `_item=<value>` so shared links open the same chart. Changing the item clears the previous chart's controls from the URL.
- **Theme:** Automatic, Light or Dark per page. It applies to every chart on the page, including the dropdown and messages. `?darkTheme=true|false` or `?theme=dark|light` overrides it, the same convention as single analytics.
- **Embedding:** `/analytics-page/` is in the default embeddable paths (`EMBEDDABLE_PATHS`).
- **Chart features:** everything works inside a page: toolbars, per-measure toolbars, time range, partial reloads and Refresh.

## Performance

- **One chart at a time:** only the selected item's chart is loaded.
- **Item list cache:** API item lists are cached for `ANALYTICS_PAGE_ITEMS_CACHE_TTL_SECONDS` (default 60), keyed by organization plus the full rendered request. Different tenants and parameter values never share an entry.
  - Retry in the viewer and Test items in the builder bypass the cache.
  - Fixed lists need no call at all.
- **Item API failures:** they don't break the page. The dropdown shows a safe message with **Retry**.
- **Source call settings:** the item API uses the existing source timeout and connection-error handling.

| Variable | Default | Purpose |
|---|---|---|
| `ANALYTICS_PAGE_MAX_ITEMS` | 500 | Items per dropdown; more are cut off and the viewer is told |
| `ANALYTICS_PAGE_MAX_RULES` | 50 | Rules per page |
| `ANALYTICS_PAGE_MAX_PARAMETERS` | 20 | Page parameters, and mapped parameters per rule |
| `ANALYTICS_PAGE_ITEMS_CACHE_TTL_SECONDS` | 60 | Item list cache; 0 = off |
| `ANALYTICS_PAGE_ITEMS_CACHE_MAX_ENTRIES` | 200 | Cached item lists per server process |

## API

- `GET/POST/PUT/DELETE /api/admin/analytics-pages`: CRUD, with soft delete as for analytics.
- `POST /api/admin/analytics-pages-execute`: builder preview of an unsaved page. Actions are `items`, `resolve` and `execute`.
- `GET /api/public-analytics-pages?id=…`: page view, with `&resolve=1&_item=…` (chart definition) or `&execute=1&_item=…` (run the chart).

## Backward compatibility

- **Database:** a new table, `analytics_pages`, created by the additive startup migration. Existing tables are untouched.
- **Existing analytics:** links and behaviour are unchanged.
- **Small refactors:** `normalizeRestSource` and `publicView` are now shared exports of `analytics-definition.js`. The `/api/public-analytics` response is the same.

## Code

- **Backend:**
  - `services/analytics-page-definition.js`: the contract and normalization.
  - `analytics-page-rules.js`: pure routing.
  - `analytics-page-items.js`: static and API items, cache.
  - `analytics-page-service.js`: selection validation, tenant checks, execution.
  - Handlers in `api/admin/analytics-pages*.js` and `api/public-analytics-pages.js`.
- **Frontend:** `src/features/analytics-pages/`.
  - `model/`: types and catalog.
  - `services/`: API client and validation.
  - `components/`: `AnalyticsPageViewer`, `ItemSelect` and editors (`RestSourceEditor`, `RulesEditor`, `ItemSelectorEditor`, `ParameterMappingsEditor`, `StaticItemsEditor`, `KeyValueRows`).
  - Pages: `AnalyticsPagesListPage`, `AnalyticsPageBuilderPage`, `PublicAnalyticsPageView`.
- **Tests:** `server/tests/analytics-pages.test.js` (20 tests).

## Possible next steps

- Cascading dropdowns (e.g. Site → Panel).
- Several charts per page (a dashboard grid).
- A "From link" mode: no dropdown, with the host passing `_item`.
