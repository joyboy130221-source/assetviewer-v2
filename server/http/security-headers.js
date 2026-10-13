/**
 * Host-neutral HTTP security headers.
 *
 * Applied by the shared request pipeline (API) and the SPA shell handler
 * (HTML pages), so the same policy is produced on any host. Only the static
 * `/app.html` file needs a fixed host header (see vercel.json) because it
 * is served directly by a CDN.
 */
const { getSecurityConfig } = require("../config/security-config");

let warnedLegacyEmbed = false;

/** True when the page path belongs to an External View (embeddable) page. */
function isEmbeddablePath(pathname) {
  const path = String(pathname || "/").split("?")[0] || "/";
  return getSecurityConfig().headers.embeddablePaths.some((prefix) =>
    prefix.endsWith("/") && prefix !== "/"
      ? path.startsWith(prefix)
      : path === prefix,
  );
}

/** True when the page is a Maximo External View page limited to embedding. */
function isEmbedOnlyPath(pathname) {
  const path = String(pathname || "/").split("?")[0] || "/";
  return getSecurityConfig().headers.embedOnlyPaths.some((prefix) =>
    prefix.endsWith("/") && prefix !== "/"
      ? path.startsWith(prefix)
      : path === prefix,
  );
}

/** frame-ancestors value for a page. */
function frameAncestors(pathname) {
  if (!isEmbeddablePath(pathname)) return "'none'";
  const origins = getSecurityConfig().headers.embedOrigins;
  if (!origins.length) {
    if (!warnedLegacyEmbed) {
      warnedLegacyEmbed = true;
      console.warn(
        "[security] EMBED_ALLOWED_ORIGINS is not set: External View pages can still be embedded by any site (legacy behaviour). Configure the BIC/BECS origins to restrict embedding.",
      );
    }
    return "*";
  }
  return ["'self'", ...origins.filter((o) => o !== "'self'")].join(" ");
}

const BASELINE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/** Headers common to every response (API and pages). */
function baseHeaders(isHttps) {
  const { hstsMaxAgeSeconds } = getSecurityConfig().headers;
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
  if (isHttps && hstsMaxAgeSeconds > 0)
    headers["Strict-Transport-Security"] =
      `max-age=${hstsMaxAgeSeconds}; includeSubDomains`;
  return headers;
}

/** Headers for an HTML page. */
function pageHeaders(pathname, isHttps) {
  const { cspMode } = getSecurityConfig().headers;
  const ancestors = frameAncestors(pathname);
  const headers = {
    ...baseHeaders(isHttps),
    "Content-Security-Policy": `frame-ancestors ${ancestors}`,
    "Cache-Control": "no-store",
  };
  // Older browsers only understand X-Frame-Options; it cannot express an
  // allow-list, so it is only sent for pages that must never be framed.
  if (ancestors === "'none'") headers["X-Frame-Options"] = "DENY";
  if (cspMode !== "off") {
    const policy = [...BASELINE_CSP, `frame-ancestors ${ancestors}`].join("; ");
    if (cspMode === "enforce") headers["Content-Security-Policy"] = policy;
    else headers["Content-Security-Policy-Report-Only"] = policy;
  }
  return headers;
}

/** Headers for an API (JSON) response. */
function apiHeaders(isHttps) {
  return {
    ...baseHeaders(isHttps),
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
  };
}

function isHttpsRequest(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  return proto === "https" || Boolean(req.socket?.encrypted);
}

function applyHeaders(res, headers) {
  for (const [name, value] of Object.entries(headers))
    if (!res.headersSent) res.setHeader(name, value);
}

module.exports = {
  isEmbeddablePath,
  isEmbedOnlyPath,
  frameAncestors,
  pageHeaders,
  apiHeaders,
  isHttpsRequest,
  applyHeaders,
};
