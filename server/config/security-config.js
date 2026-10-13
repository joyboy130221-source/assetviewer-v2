/**
 * Central security & runtime configuration (Phase 1 hardening).
 *
 * Every setting is read from environment variables, has a safe default and is
 * bounded, so the application behaves identically on any host (on-premises
 * Node, containers, Vercel, ...). Defaults are chosen to be backward
 * compatible; stricter values are opt-in and reported by the security posture
 * check (server/security/posture.js) until they are configured.
 *
 * Values are cached after the first read. Call resetSecurityConfig() in tests
 * after changing process.env.
 */

const int = (name, fallback, min, max) => {
  const raw = process.env[name];
  const n = raw == null || String(raw).trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
};
const str = (name, fallback = "") => {
  const raw = process.env[name];
  return raw == null || String(raw).trim() === ""
    ? fallback
    : String(raw).trim();
};
const oneOf = (name, allowed, fallback) => {
  const value = str(name, fallback).toLowerCase();
  return allowed.includes(value) ? value : fallback;
};
const list = (name) =>
  str(name)
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** "count/seconds" -> { limit, windowSeconds }; "0" or "off" disables. */
function rateRule(name, fallback) {
  const raw = str(name, fallback).toLowerCase();
  if (raw === "0" || raw === "off") return null;
  const match = raw.match(/^(\d{1,6})\s*\/\s*(\d{1,6})$/);
  const source = match ? match : fallback.match(/^(\d+)\/(\d+)$/);
  const limit = Math.max(1, Number(source[1]));
  const windowSeconds = Math.max(1, Number(source[2]));
  return { limit, windowSeconds };
}

const ORIGIN_PATTERN = /^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Reduces an allowed-parent entry to its origin (scheme + host + port).
 * Browsers match frame-ancestors on the origin only, so a full page address
 * such as https://bic.example.com/<tenant-id>/home is accepted and treated as
 * https://bic.example.com (every path under it). Returns null when invalid.
 */
function normalizeOrigin(entry) {
  const value = String(entry || "").trim();
  if (value === "'self'") return value;
  const match = value.match(/^(https?:\/\/)(\*\.)?([^/?#]+)/i);
  if (!match) return null;
  const origin = `${match[1].toLowerCase()}${match[2] || ""}${match[3].toLowerCase()}`;
  return ORIGIN_PATTERN.test(origin) ? origin : null;
}

function readSecurityConfig() {
  const invalidOrigins = [];
  const embedOrigins = [
    ...new Set(
      list("EMBED_ALLOWED_ORIGINS")
        .map((entry) => {
          const origin = normalizeOrigin(entry);
          if (!origin) invalidOrigins.push(entry);
          return origin;
        })
        .filter(Boolean),
    ),
  ];
  return Object.freeze({
    headers: Object.freeze({
      /** Allowed parents for embeddable pages; empty = legacy "*" (warned). */
      embedOrigins: Object.freeze(embedOrigins),
      invalidEmbedOrigins: Object.freeze(invalidOrigins),
      /** Path prefixes of pages that may be embedded (External Views). */
      embeddablePaths: Object.freeze(
        list("EMBEDDABLE_PATHS").length
          ? list("EMBEDDABLE_PATHS")
          : [
              "/",
              "/index.html",
              "/work-order",
              "/work-order.html",
              "/work-order-update",
              "/work-order-update.html",
              "/forms/",
              "/analytics/",
            ],
      ),
      /**
       * When true, the Maximo External View pages can only be opened inside
       * a frame (i.e. embedded by an allowed parent) or by a signed-in
       * administrator. Opening the link directly in a browser is refused.
       */
      embedOnly: ["1", "true", "on", "yes"].includes(
        str("EXTERNAL_PAGES_EMBED_ONLY", "false").toLowerCase(),
      ),
      /** Pages covered by embedOnly (public forms/analytics stay directly openable). */
      embedOnlyPaths: Object.freeze(
        list("EXTERNAL_EMBED_ONLY_PATHS").length
          ? list("EXTERNAL_EMBED_ONLY_PATHS")
          : [
              "/",
              "/index.html",
              "/work-order",
              "/work-order.html",
              "/work-order-update",
              "/work-order-update.html",
            ],
      ),
      /** off | report-only | enforce — baseline CSP beyond frame-ancestors. */
      cspMode: oneOf(
        "SECURITY_CSP_MODE",
        ["off", "report-only", "enforce"],
        "off",
      ),
      hstsMaxAgeSeconds: int("SECURITY_HSTS_MAX_AGE", 15552000, 0, 63072000),
    }),
    externalApi: Object.freeze({
      /** off | warn | enforce — auth for Maximo External View APIs. */
      mode: oneOf("EXTERNAL_API_AUTH_MODE", ["off", "warn", "enforce"], "warn"),
      keyCacheSeconds: int("EXTERNAL_KEY_CACHE_SECONDS", 60, 0, 3600),
      keyCacheMaxEntries: int(
        "EXTERNAL_KEY_CACHE_MAX_ENTRIES",
        1000,
        10,
        100000,
      ),
      warnLogIntervalSeconds: int(
        "EXTERNAL_API_WARN_LOG_INTERVAL_SECONDS",
        300,
        0,
        86400,
      ),
    }),
    rateLimit: Object.freeze({
      store: oneOf("RATE_LIMIT_STORE", ["memory", "postgres"], "memory"),
      memoryMaxKeys: int("RATE_LIMIT_MEMORY_MAX_KEYS", 50000, 1000, 5000000),
      rules: Object.freeze({
        auth: rateRule("RATE_LIMIT_AUTH", "20/60"),
        public: rateRule("RATE_LIMIT_PUBLIC", "120/60"),
        external: rateRule("RATE_LIMIT_EXTERNAL", "600/60"),
        admin: rateRule("RATE_LIMIT_ADMIN", "1200/60"),
      }),
    }),
    auth: Object.freeze({
      sessionHours: int("SESSION_MAX_AGE_HOURS", 8, 1, 168),
      lockoutThreshold: int("AUTH_LOCKOUT_THRESHOLD", 5, 0, 100),
      lockoutMinutes: int("AUTH_LOCKOUT_MINUTES", 15, 1, 1440),
      initialAdminPassword: str("INITIAL_ADMIN_PASSWORD"),
      initialAdminUsername: str("INITIAL_ADMIN_USERNAME", "admin"),
      initialAdminEmail: str("INITIAL_ADMIN_EMAIL", "admin@local.invalid"),
    }),
    passwordPolicy: Object.freeze({
      minLength: int("PASSWORD_MIN_LENGTH", 12, 8, 128),
      /** How many of: lowercase, uppercase, digit, symbol. */
      minCharacterClasses: int("PASSWORD_MIN_CHARACTER_CLASSES", 3, 1, 4),
    }),
    network: Object.freeze({
      /** Hostnames (or *.suffix) that may resolve to private addresses. */
      privateHostAllowlist: Object.freeze(
        list("WORKFLOW_PRIVATE_HOST_ALLOWLIST"),
      ),
      dnsCacheSeconds: int("NETWORK_DNS_CACHE_SECONDS", 60, 0, 3600),
      dnsCacheMaxEntries: int(
        "NETWORK_DNS_CACHE_MAX_ENTRIES",
        5000,
        10,
        1000000,
      ),
      /** public-only | unrestricted — Browser RPA destinations. */
      rpaPolicy: oneOf(
        "WORKFLOW_RPA_NETWORK_POLICY",
        ["public-only", "unrestricted"],
        "public-only",
      ),
      /** Directory Browser RPA uploads must come from (unset = legacy, warned). */
      rpaUploadRoot: str("WORKFLOW_RPA_UPLOAD_ROOT"),
    }),
    proxy: Object.freeze({
      /** Number of trusted reverse proxies in front of the app. */
      trustedHops: int("TRUST_PROXY_HOPS", 1, 0, 10),
    }),
    app: Object.freeze({
      port: int("PORT", 3001, 1, 65535),
      distDir: str("APP_DIST_DIR", "dist"),
      shellFile: str("APP_SHELL_FILE", "app.html"),
      shellCacheSeconds: int("APP_SHELL_CACHE_SECONDS", 300, 0, 86400),
      schedulerEnabled:
        str("API_WATCHER_SCHEDULER", "on").toLowerCase() !== "off",
      schedulerIntervalSeconds: int(
        "API_WATCHER_SCHEDULER_INTERVAL_SECONDS",
        60,
        10,
        3600,
      ),
      schedulerBatchSize: int("API_WATCHER_SCHEDULER_BATCH_SIZE", 20, 1, 500),
    }),
  });
}

let cached = null;
function getSecurityConfig() {
  if (!cached) cached = readSecurityConfig();
  return cached;
}
function resetSecurityConfig() {
  cached = null;
}

module.exports = { getSecurityConfig, resetSecurityConfig };
