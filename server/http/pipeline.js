/**
 * Host-neutral API request pipeline.
 *
 *   request id → security headers → rate limit → External View auth gate
 *   → route handler → uniform error handling
 *
 * Adapters (Express, Vercel, ...) only translate the incoming request into
 * (routeName, req, res) and call handleApiRequest().
 */
const crypto = require("crypto");
const { resolveRoute } = require("./route-table");
const { runWithContext } = require("./request-context");
const { clientIp } = require("./client-ip");
const {
  apiHeaders,
  applyHeaders,
  isHttpsRequest,
} = require("./security-headers");
const { consume } = require("./rate-limiter");
const { getSecurityConfig } = require("../config/security-config");
const { authorizeExternalRequest } = require("../security/external-access");
const { reportSecurityPostureOnce } = require("../security/posture");

const lastWarn = new Map();
function warnUnauthenticated(route, ip, reason) {
  const interval =
    getSecurityConfig().externalApi.warnLogIntervalSeconds * 1000;
  const key = `${route}|${ip}`;
  const now = Date.now();
  if (interval && now - (lastWarn.get(key) || 0) < interval) return;
  if (lastWarn.size > 10000) lastWarn.clear();
  lastWarn.set(key, now);
  console.warn(
    `[security] EXTERNAL_API_AUTH_MODE=warn: unauthenticated call to /api/${route} from ${ip} would be rejected in enforce mode (${reason}).`,
  );
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/**
 * Shims the minimal Express/Vercel response helpers used by route handlers
 * (res.status().json()) when an adapter does not provide them.
 */
function ensureResponseHelpers(res) {
  if (typeof res.status !== "function")
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
  if (typeof res.json !== "function")
    res.json = (body) => {
      sendJson(res, res.statusCode || 200, body);
      return res;
    };
}

async function handleApiRequest(routeName, req, res) {
  ensureResponseHelpers(res);
  const requestId =
    String(req.headers?.["x-request-id"] || "").slice(0, 100) ||
    crypto.randomUUID();
  const ip = clientIp(req);
  res.setHeader("X-Request-Id", requestId);
  applyHeaders(res, apiHeaders(isHttpsRequest(req)));
  reportSecurityPostureOnce();

  const route = resolveRoute(routeName);
  if (!route)
    return sendJson(res, 404, {
      error: "API endpoint not found.",
      route: routeName || "/",
    });

  return runWithContext(
    { requestId, clientIp: ip, route: route.name },
    async (context) => {
      try {
        // 1. Rate limiting per route group and client IP.
        const ruleName = route.group === "system" ? null : route.group;
        if (ruleName) {
          const decision = await consume(ruleName, ip);
          if (decision) {
            res.setHeader("RateLimit-Limit", String(decision.limit));
            res.setHeader("RateLimit-Remaining", String(decision.remaining));
            if (!decision.allowed) {
              res.setHeader("Retry-After", String(decision.retryAfterSeconds));
              return sendJson(res, 429, {
                error: "Too many requests. Please wait and try again.",
                code: "RATE_LIMITED",
                retryAfterSeconds: decision.retryAfterSeconds,
              });
            }
          }
        }

        // 2. External View APIs: session or access key (rollout via mode).
        if (route.group === "external") {
          const mode = getSecurityConfig().externalApi.mode;
          if (mode !== "off") {
            const decision = await authorizeExternalRequest(req);
            context.principal = decision.principal;
            if (!decision.allowed) {
              if (mode === "enforce")
                return sendJson(res, 401, {
                  error: decision.reason,
                  code: "EXTERNAL_AUTH_REQUIRED",
                });
              warnUnauthenticated(route.name, ip, decision.reason);
            }
          } else context.principal = { method: "none" };
        }

        // 3. Route handler.
        return await route.handler(req, res);
      } catch (error) {
        // Handlers normally answer themselves; this is the last line of defence.
        console.error(
          `[api] ${route.name} failed (request ${requestId}):`,
          error,
        );
        const status = Number(error?.status) || 500;
        return sendJson(res, status, {
          error:
            status >= 500
              ? "An unexpected error occurred. Reference: " + requestId
              : error.message,
          requestId,
        });
      }
    },
  );
}

module.exports = { handleApiRequest, sendJson };
