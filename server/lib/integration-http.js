const dns = require("dns").promises;
const net = require("net");
const privateIp = (ip) =>
  ip === "::1" ||
  ip.startsWith("127.") ||
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  ip.startsWith("169.254.") ||
  ip.startsWith("fc") ||
  ip.startsWith("fd") ||
  ip.startsWith("fe80:");
async function safeUrl(raw) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("Only HTTP/HTTPS URLs are allowed.");
  if (["localhost", "0.0.0.0"].includes(u.hostname))
    throw new Error("Private/local URLs are not allowed.");
  const ips = net.isIP(u.hostname)
    ? [{ address: u.hostname }]
    : await dns.lookup(u.hostname, { all: true });
  if (ips.some((x) => privateIp(x.address)))
    throw new Error("Private/local URLs are not allowed.");
  return u;
}
async function execute(action) {
  const u = await safeUrl(action.url);
  Object.entries(action.params || {}).forEach(([k, v]) =>
    u.searchParams.set(k, String(v)),
  );
  const headers = { ...(action.headers || {}) };
  const method = (action.method || "GET").toUpperCase();
  let body;
  if (
    !["GET", "HEAD"].includes(method) &&
    action.body &&
    Object.keys(action.body).length
  ) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(action.body);
  }
  const response = await fetch(u, {
    method,
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { text: text.slice(0, 10000) };
  }
  return { ok: response.ok, status: response.status, data };
}
function flatten(value, prefix = "", out = []) {
  if (Array.isArray(value)) {
    if (value.length) flatten(value[0], prefix, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value))
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) out.push(prefix);
  return out;
}
function getPath(value, path) {
  return path
    .split(".")
    .reduce((v, k) => (Array.isArray(v) ? v[0]?.[k] : v?.[k]), value);
}
module.exports = { execute, flatten, getPath };
