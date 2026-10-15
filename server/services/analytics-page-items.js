/**
 * Dropdown items of an Analytics Page: static items from the definition, or
 * items read from an API response. The API is called server-side with the
 * page's Authentication Profile, timeout and outbound network policy (the
 * same source call analytics use), so credentials never reach the browser.
 *
 * API item lists are cached for ANALYTICS_PAGE_ITEMS_CACHE_TTL_SECONDS,
 * keyed by organization and the fully rendered request, so tenants and
 * different parameter values never share an entry.
 */
const { render } = require("../lib/form-engine");
const { getPath } = require("../lib/integration-http");
const { TtlCache } = require("../lib/ttl-cache");
const { readAnalyticsLimits } = require("../config/analytics-limits");
const { resolveRecords } = require("./analytics-records");
const { callSource, cacheKey } = require("./analytics-source");

let cache = null;
let cacheSettings = "";
function itemsCache(limits) {
  if (!limits.pageItemsCacheTtlSeconds) return null;
  const settings = `${limits.pageItemsCacheTtlSeconds}:${limits.pageItemsCacheMaxEntries}`;
  if (!cache || settings !== cacheSettings) {
    cache = new TtlCache({
      ttlMs: limits.pageItemsCacheTtlSeconds * 1000,
      maxEntries: limits.pageItemsCacheMaxEntries,
    });
    cacheSettings = settings;
  }
  return cache;
}
/** Test hook. */
function clearItemsCache() {
  cache?.clear();
}

const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

/** Unique, non-empty values, capped at the configured maximum. */
function finalize(items, limits) {
  const seen = new Set();
  const unique = items.filter(
    (item) => item.value && !seen.has(item.value) && seen.add(item.value),
  );
  return {
    items: unique.slice(0, limits.pageMaxItems),
    truncated: unique.length > limits.pageMaxItems,
  };
}

async function apiItems(page, organizationId, context, { fresh }, limits) {
  const { dataSource, labelField, valueField } = page.selector.api;
  if (!valueField) throw badRequest("The item API needs a Value field.");
  const action = render(dataSource.action || {}, context);
  if (!action.url) throw badRequest("The item API needs a URL.");

  const store = itemsCache(limits);
  const key = store
    ? `${cacheKey(action, organizationId)}:${dataSource.arrayPath}:${labelField}:${valueField}`
    : "";
  if (store && !fresh) {
    const hit = store.get(key);
    if (hit) return { ...hit, cached: true, durationMs: 0 };
  }
  const executed = await callSource(action, organizationId, { fresh });
  const response = executed.response;
  if (!response.ok)
    throw Object.assign(
      new Error(`Item API returned HTTP ${response.status}.`),
      {
        status: 502,
        code: "ITEMS_SOURCE_ERROR",
        publicMessage: "The list of items could not be loaded.",
      },
    );
  const resolved = resolveRecords(response.data, dataSource.arrayPath || "");
  const list = finalize(
    resolved.rows.map((row) => {
      const value = String(getPath(row, valueField) ?? "").trim();
      const label = labelField
        ? String(getPath(row, labelField) ?? "").trim()
        : "";
      return { value, label: label || value };
    }),
    limits,
  );
  const result = {
    ...list,
    recordsPath: resolved.path,
    fields: resolved.rows[0] ? Object.keys(resolved.rows[0]) : [],
  };
  if (store) store.set(key, result);
  return { ...result, cached: false, durationMs: executed.durationMs };
}

/**
 * @param {object} page normalized page definition (+ organizationId)
 * @param {Record<string,string>} context {{parameter}} values for the item API
 * @param {{ fresh?: boolean }} options fresh skips the cache read
 * @returns {Promise<{ items: {label: string, value: string}[], truncated: boolean,
 *   cached: boolean, durationMs: number, recordsPath?: string, fields?: string[] }>}
 */
async function resolveItems(page, context = {}, options = {}) {
  const limits = readAnalyticsLimits();
  if (page.selector.source === "api")
    return apiItems(page, page.organizationId, context, options, limits);
  return {
    ...finalize(page.selector.staticItems, limits),
    cached: false,
    durationMs: 0,
  };
}

module.exports = { resolveItems, clearItemsCache };
