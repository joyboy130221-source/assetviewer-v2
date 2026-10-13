/** Safe object-path resolver with explicit numeric array index support. */
const MAX_PATH_SEGMENTS = Math.max(
  8,
  Math.min(256, Number(process.env.TEMPLATE_MAX_PATH_SEGMENTS) || 64),
);
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
function tokenizePath(path) {
  const input = String(path || "").trim();
  if (!input) return [];
  const tokens = [];
  const re = /(?:^|\.)([^.[\]]+)|\[(\d+)\]/g;
  let match,
    consumed = 0;
  while ((match = re.exec(input)) !== null) {
    if (match.index !== consumed) return [];
    const token = match[1] != null ? match[1] : Number(match[2]);
    if (typeof token === "string" && BLOCKED_KEYS.has(token)) return [];
    tokens.push(token);
    if (tokens.length > MAX_PATH_SEGMENTS) return [];
    consumed = re.lastIndex;
  }
  return consumed === input.length ? tokens : [];
}
function getPath(value, path) {
  const input = String(path || "").trim();
  const tokens = tokenizePath(input);
  if (!tokens.length) return input ? undefined : value;
  return tokens.reduce((current, token) => {
    if (current == null) return undefined;
    if (typeof token === "number")
      return Array.isArray(current) ? current[token] : undefined;
    return current[token];
  }, value);
}
module.exports = { getPath, tokenizePath, MAX_PATH_SEGMENTS };
