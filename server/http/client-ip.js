const { getSecurityConfig } = require("../config/security-config");

/**
 * Client IP that honours exactly TRUST_PROXY_HOPS reverse proxies.
 * X-Forwarded-For entries added by the client itself are ignored, so the
 * value cannot be spoofed when the hop count matches the deployment
 * (Vercel / a single reverse proxy = 1, direct exposure = 0).
 */
function clientIp(req) {
  const hops = getSecurityConfig().proxy.trustedHops;
  const socketIp =
    req.socket?.remoteAddress || req.connection?.remoteAddress || "";
  if (hops > 0) {
    const forwarded = String(req.headers?.["x-forwarded-for"] || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const chain = [...forwarded, socketIp].filter(Boolean);
    const index = chain.length - 1 - hops;
    if (index >= 0) return normalize(chain[index]);
    if (forwarded.length) return normalize(forwarded[0]);
  }
  return normalize(socketIp);
}

function normalize(ip) {
  return String(ip || "").replace(/^::ffff:/i, "") || "unknown";
}

module.exports = { clientIp };
