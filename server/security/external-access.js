/**
 * Access control for External View (embedded) Maximo APIs.
 *
 * A request is authenticated when it carries either
 *   - a valid administration session cookie, or
 *   - a valid External View access key (header `X-Embed-Key`).
 *
 * Access keys are long-lived (they live in BIC/BECS links), revocable by
 * regenerating or deactivating the External View, stored only as SHA-256
 * hashes, scoped to the External View's organization and — when the view URL
 * contains `env=` — to that Maximo environment.
 *
 * EXTERNAL_API_AUTH_MODE controls the rollout: off | warn | enforce.
 */
const crypto = require("crypto");
const { query } = require("../lib/db");
const { currentUser } = require("../lib/auth");
const { getSecurityConfig } = require("../config/security-config");

const KEY_PREFIX = "evk1";
const KEY_HEADER = "x-embed-key";

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

/** Creates a new raw key for a view. Only the hash is persisted. */
function generateAccessKey(viewId) {
  const secret = crypto.randomBytes(32).toString("base64url");
  return {
    key: `${KEY_PREFIX}.${viewId}.${secret}`,
    hash: sha256(secret),
    prefix: secret.slice(0, 6),
  };
}

function parseAccessKey(raw) {
  const parts = String(raw || "")
    .trim()
    .split(".");
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) return null;
  if (!/^\d{1,18}$/.test(parts[1]) || parts[2].length < 20) return null;
  return { viewId: parts[1], secret: parts[2] };
}

/** Environment names a view is scoped to, from its configured URL. */
function environmentsOf(viewUrl) {
  try {
    const url = new URL(String(viewUrl || ""), "http://placeholder.local");
    const env = url.searchParams.get("env");
    return env ? [env] : [];
  } catch {
    return [];
  }
}

// ---- verified-key cache (bounded, short TTL) ------------------------------
const cache = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function cacheSet(key, value) {
  const { keyCacheSeconds, keyCacheMaxEntries } =
    getSecurityConfig().externalApi;
  if (!keyCacheSeconds) return;
  if (cache.size >= keyCacheMaxEntries) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + keyCacheSeconds * 1000 });
}
/** Call after a key is generated or revoked so this instance sees it at once. */
function invalidateAccessKeyCache() {
  cache.clear();
}

/**
 * @returns {Promise<null | {externalViewId: number, organizationId: string|null, environments: string[]}>}
 */
async function verifyAccessKey(rawKey) {
  const parsed = parseAccessKey(rawKey);
  if (!parsed) return null;
  const cacheKey = sha256(rawKey);
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const r = await query(
    `SELECT id,url,organization_id,access_key_hash FROM external_views
      WHERE id=$1 AND active=TRUE AND deleted_at IS NULL AND access_key_hash IS NOT NULL`,
    [parsed.viewId],
  );
  const row = r.rows[0];
  let principal = null;
  if (row) {
    const expected = Buffer.from(row.access_key_hash, "hex");
    const actual = Buffer.from(sha256(parsed.secret), "hex");
    if (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    )
      principal = {
        externalViewId: Number(row.id),
        organizationId: row.organization_id || null,
        environments: environmentsOf(row.url),
      };
  }
  cacheSet(cacheKey, principal);
  return principal;
}

function requestedEnvironment(req) {
  const fromQuery = req.query?.env;
  if (fromQuery) return String(fromQuery);
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return body && typeof body === "object" && body.env ? String(body.env) : "";
}

/**
 * Decides whether an External View API request may proceed.
 * @returns {Promise<{allowed: boolean, principal: object, reason?: string}>}
 */
async function authorizeExternalRequest(req) {
  const user = await currentUser(req).catch(() => null);
  if (user && !user.must_change_password)
    return {
      allowed: true,
      principal: { method: "session", userId: user.id },
    };
  const rawKey = req.headers?.[KEY_HEADER];
  if (rawKey) {
    const keyPrincipal = await verifyAccessKey(rawKey);
    if (!keyPrincipal)
      return {
        allowed: false,
        principal: { method: "none" },
        reason: "Invalid or revoked External View access key.",
      };
    const env = requestedEnvironment(req);
    if (
      keyPrincipal.environments.length &&
      env &&
      !keyPrincipal.environments.includes(env)
    )
      return {
        allowed: false,
        principal: {
          method: "none",
          externalViewId: keyPrincipal.externalViewId,
        },
        reason:
          "This External View access key is not valid for the requested environment.",
      };
    return {
      allowed: true,
      principal: { method: "embed-key", ...keyPrincipal },
    };
  }
  return {
    allowed: false,
    principal: { method: "none" },
    reason:
      "Authentication required. Open this page from a configured External View link or sign in.",
  };
}

module.exports = {
  KEY_HEADER,
  generateAccessKey,
  parseAccessKey,
  verifyAccessKey,
  environmentsOf,
  authorizeExternalRequest,
  invalidateAccessKeyCache,
};
