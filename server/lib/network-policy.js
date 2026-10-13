/**
 * Outbound network policy shared by every integration channel
 * (REST executor, Browser RPA).
 *
 * Blocks loopback, private, link-local, carrier-grade NAT, benchmark,
 * multicast/reserved, unspecified and IPv4-mapped/NAT64 forms of those
 * addresses, unless the hostname is explicitly allow-listed in
 * WORKFLOW_PRIVATE_HOST_ALLOWLIST (e.g. an intranet Maximo).
 *
 * DNS answers are cached (NETWORK_DNS_CACHE_SECONDS) so repeated checks —
 * e.g. every sub-request of a Browser RPA page — stay cheap.
 */
const dns = require("dns").promises;
const net = require("net");
const { getSecurityConfig } = require("../config/security-config");

function ipv4ToInt(ip) {
  return (
    ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
  );
}
function inV4Range(ip, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const V4_BLOCKED = [
  ["0.0.0.0", 8], // "this" network / unspecified
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/** Extracts an embedded IPv4 address from IPv4-mapped / NAT64 IPv6. */
function embeddedIpv4(ip) {
  const lower = ip.toLowerCase();
  const mapped = lower.match(
    /^(?:::ffff:|::ffff:0:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/,
  );
  if (mapped) return mapped[1];
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16),
      lo = parseInt(hexMapped[2], 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return null;
}

/** True when the IP address is not publicly routable. */
function isPrivateAddress(ip) {
  const address = String(ip || "")
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  if (net.isIPv4(address))
    return V4_BLOCKED.some(([b, bits]) => inV4Range(address, b, bits));
  if (!net.isIPv6(address)) return true; // unknown format: fail closed
  const v4 = embeddedIpv4(address);
  if (v4) return isPrivateAddress(v4);
  const lower = address.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    /^f[cd][0-9a-f]{0,2}:/.test(lower) || // fc00::/7 unique local
    /^fe[89ab][0-9a-f]?:/.test(lower) || // fe80::/10 link-local
    /^ff[0-9a-f]{0,2}:/.test(lower) || // multicast
    lower.startsWith("2001:db8:") // documentation
  );
}

function hostAllowListed(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/\.$/, "");
  return getSecurityConfig().network.privateHostAllowlist.some((entry) => {
    const rule = entry.toLowerCase();
    return rule.startsWith("*.") ? host.endsWith(rule.slice(1)) : host === rule;
  });
}

// ---- DNS cache --------------------------------------------------------------
const dnsCache = new Map();
async function resolveAll(hostname) {
  const { dnsCacheSeconds, dnsCacheMaxEntries } = getSecurityConfig().network;
  const now = Date.now();
  const hit = dnsCache.get(hostname);
  if (hit && hit.expiresAt > now) return hit.addresses;
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = answers.map((a) => a.address);
  if (dnsCacheSeconds) {
    if (dnsCache.size >= dnsCacheMaxEntries)
      dnsCache.delete(dnsCache.keys().next().value);
    dnsCache.set(hostname, {
      addresses,
      expiresAt: now + dnsCacheSeconds * 1000,
    });
  }
  return addresses;
}

class NetworkPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkPolicyError";
    this.status = 400;
  }
}

/**
 * Validates an outbound URL. Throws NetworkPolicyError when blocked.
 * @param {string|URL} raw
 * @param {{ allowPrivate?: boolean }} [options] allowPrivate skips the
 *   private-address check (WORKFLOW_RPA_NETWORK_POLICY=unrestricted).
 * @returns {Promise<URL>}
 */
async function assertUrlAllowed(raw, options = {}) {
  let url;
  try {
    url = raw instanceof URL ? raw : new URL(String(raw));
  } catch {
    throw new NetworkPolicyError("Invalid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new NetworkPolicyError("Only HTTP/HTTPS URLs are allowed.");
  if (options.allowPrivate || hostAllowListed(url.hostname)) return url;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    ["localhost", "localhost.localdomain"].includes(hostname.toLowerCase()) ||
    hostname.endsWith(".localhost")
  )
    throw new NetworkPolicyError("Private/local URLs are not allowed.");
  const addresses = net.isIP(hostname)
    ? [hostname]
    : await resolveAll(hostname);
  if (!addresses.length || addresses.some(isPrivateAddress))
    throw new NetworkPolicyError(
      "Private/local URLs are not allowed. Add the host to WORKFLOW_PRIVATE_HOST_ALLOWLIST if it is a trusted internal system.",
    );
  return url;
}

function clearDnsCache() {
  dnsCache.clear();
}

module.exports = {
  assertUrlAllowed,
  isPrivateAddress,
  hostAllowListed,
  NetworkPolicyError,
  clearDnsCache,
};
