const { getPath: resolveObjectPath } = require("./object-path");
const { assertUrlAllowed } = require("./network-policy");
const { appendQueryParameters } = require("./query-params");
/** Outbound URL check shared with Browser RPA (server/lib/network-policy.js). */
async function safeUrl(raw) {
  return assertUrlAllowed(raw);
}
async function execute(action) {
  const u = await safeUrl(action.url);
  appendQueryParameters(u, action.params);
  const headers = { ...(action.headers || {}) };
  const method = (action.method || "GET").toUpperCase();
  let body;
  if (!["GET", "HEAD"].includes(method) && action.body != null) {
    const format =
      action.bodyFormat || (typeof action.body === "string" ? "text" : "json");
    if (typeof action.body === "string") {
      body = action.body;
      if (!headers["Content-Type"])
        headers["Content-Type"] =
          format === "xml"
            ? "application/xml"
            : format === "json"
              ? "application/json"
              : format === "form"
                ? "application/x-www-form-urlencoded"
                : "text/plain";
    } else if (Object.keys(action.body || {}).length) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      body = JSON.stringify(action.body);
    }
  }
  const response = await fetch(u, {
    method,
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(
      Math.max(1000, Math.min(120000, Number(action.timeoutMs) || 15000)),
    ),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { text: text.slice(0, 10000) };
  }
  return { ok: response.ok, status: response.status, data, text, contentType };
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
  const explicit = resolveObjectPath(value, path);
  if (explicit !== undefined) return explicit;
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((v, k) => (Array.isArray(v) ? v[0]?.[k] : v?.[k]), value);
}
module.exports = { execute, flatten, getPath };
