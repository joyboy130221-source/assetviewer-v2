/**
 * Source API calls for Analytics: timeout, readable network errors and an
 * optional short-lived response cache.
 *
 * The cache is off unless ANALYTICS_SOURCE_CACHE_TTL_SECONDS > 0. Its key is
 * a hash of the organization and the fully rendered request (method, URL,
 * headers, query parameters, body, Authentication Profile), so two tenants
 * or two different requests can never share an entry. Only successful
 * responses are cached.
 */
const crypto = require("node:crypto");
const { executeAuthenticated } = require("../lib/authenticated-http");
const { query } = require("../lib/db");
const { TtlCache } = require("../lib/ttl-cache");
const {
  readAnalyticsLimits,
  sourceTimeoutMs,
} = require("../config/analytics-limits");

/**
 * Network-level failures before any HTTP response (fetch reports them as
 * "fetch failed" with the reason in error.cause.code).
 */
const CONNECTION_FAILURES = Object.freeze({
  UND_ERR_CONNECT_TIMEOUT:
    "the connection could not be opened in time (host unreachable from the Integration Hub server: check VPN, firewall or proxy)",
  ECONNREFUSED: "the host refused the connection",
  ECONNRESET: "the connection was reset",
  ENOTFOUND: "the host name could not be resolved (DNS)",
  EAI_AGAIN: "the host name could not be resolved (temporary DNS failure)",
  EHOSTUNREACH: "the host is unreachable",
  ENETUNREACH: "the network is unreachable",
  UND_ERR_SOCKET: "the connection closed unexpectedly",
});

function connectionFailure(error) {
  const code = error?.cause?.code || error?.code;
  return code && CONNECTION_FAILURES[code] ? code : null;
}

function isTimeoutError(error) {
  return (
    error?.name === "TimeoutError" || error?.cause?.name === "TimeoutError"
  );
}

/** Turns transport failures into errors with a status, code and safe public message. */
function sourceError(error, timeoutMs) {
  const failure = connectionFailure(error);
  if (failure)
    return Object.assign(
      new Error(
        `Could not connect to the source API: ${CONNECTION_FAILURES[failure]}.`,
      ),
      {
        status: 502,
        code: "SOURCE_UNREACHABLE",
        details: { reason: failure },
        publicMessage:
          "The data source could not be reached. Please try again later.",
      },
    );
  if (isTimeoutError(error)) {
    const seconds = Math.round(timeoutMs / 100) / 10;
    return Object.assign(
      new Error(
        `Source API did not respond within ${seconds} s. Increase the timeout under REST Data Source, or narrow the time range or query.`,
      ),
      {
        status: 504,
        code: "SOURCE_TIMEOUT",
        details: { timeoutMs },
        publicMessage:
          "The data source took too long to respond. Please try again later.",
      },
    );
  }
  return error;
}

// ---- Cache -----------------------------------------------------------------

let cache = null;
let cacheSettings = "";

/** The process-wide cache for the current settings, or null when disabled. */
function sourceCache(limits) {
  if (!limits.sourceCacheTtlSeconds) return null;
  const settings = `${limits.sourceCacheTtlSeconds}:${limits.sourceCacheMaxEntries}`;
  if (!cache || settings !== cacheSettings) {
    cache = new TtlCache({
      ttlMs: limits.sourceCacheTtlSeconds * 1000,
      maxEntries: limits.sourceCacheMaxEntries,
    });
    cacheSettings = settings;
  }
  return cache;
}

/** JSON with sorted object keys, so equal requests always hash the same. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

function cacheKey(action, organizationId) {
  const identity = {
    organizationId: organizationId || "",
    method: action.method || "GET",
    url: action.url || "",
    headers: action.headers || {},
    params: action.params || [],
    body: action.body ?? null,
    authProfileId: action.authProfileId || "",
  };
  return crypto.createHash("sha256").update(stableJson(identity)).digest("hex");
}

function cacheable(response, limits) {
  if (!response?.ok) return false;
  try {
    return (
      Buffer.byteLength(JSON.stringify(response.data ?? null)) <=
      limits.sourceCacheMaxEntryBytes
    );
  } catch {
    return false;
  }
}

/** Test hook: drops every cached response. */
function clearSourceCache() {
  cache?.clear();
}

// ---- Call ------------------------------------------------------------------

/**
 * Calls the source API within the definition's timeout.
 * @param {object} action rendered request
 * @param {string} organizationId tenant whose Authentication Profiles apply
 * @param {{ fresh?: boolean }} options fresh skips cache reads (still writes)
 * @returns {Promise<{ action: object, response: object, timeoutMs: number,
 *   durationMs: number, cached: boolean }>}
 */
async function callSource(action, organizationId, { fresh = false } = {}) {
  const limits = readAnalyticsLimits();
  const timeoutMs = sourceTimeoutMs(action.timeoutMs, limits);
  const store = sourceCache(limits);
  const key = store ? cacheKey(action, organizationId) : "";
  if (store && !fresh) {
    const hit = store.get(key);
    if (hit)
      return { action, response: hit, timeoutMs, durationMs: 0, cached: true };
  }
  const startedAt = Date.now();
  try {
    const executed = await executeAuthenticated(
      { ...action, timeoutMs },
      query,
      { organizationId },
    );
    if (store && cacheable(executed.response, limits))
      store.set(key, executed.response);
    return {
      ...executed,
      timeoutMs,
      durationMs: Date.now() - startedAt,
      cached: false,
    };
  } catch (error) {
    throw sourceError(error, timeoutMs);
  }
}

module.exports = {
  callSource,
  connectionFailure,
  sourceError,
  clearSourceCache,
  cacheKey,
};
