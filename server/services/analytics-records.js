const { flatten, getPath } = require("../lib/integration-http");

const MAX_DISCOVERY_DEPTH = 6;
const MAX_DISCOVERY_CANDIDATES = 50;
const MAX_FIELDS = 500;

function fieldsOf(rows) {
  const samples = Array.isArray(rows) ? rows.slice(0, 25) : [rows];
  const fields = new Set();
  for (const sample of samples) {
    for (const field of flatten(sample)) {
      fields.add(field);
      if (fields.size >= MAX_FIELDS) return [...fields];
    }
  }
  return [...fields];
}

function discoverRecordArrays(value, path = "", depth = 0, out = []) {
  if (depth > MAX_DISCOVERY_DEPTH || out.length >= MAX_DISCOVERY_CANDIDATES)
    return out;
  if (Array.isArray(value)) {
    out.push({
      path,
      count: value.length,
      fields: fieldsOf(value).slice(0, 100),
    });
    // An array is a dataset boundary. Nested arrays inside its records are child collections,
    // not alternative top-level datasets, so they are intentionally not suggested here.
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      discoverRecordArrays(
        child,
        path ? `${path}.${key}` : key,
        depth + 1,
        out,
      );
    }
  }
  return out;
}

function uniqueCandidates(candidates) {
  const byPath = new Map();
  for (const candidate of candidates) {
    const existing = byPath.get(candidate.path);
    if (!existing || candidate.count > existing.count)
      byPath.set(candidate.path, candidate);
  }
  return [...byPath.values()].sort((a, b) => {
    const depthA = a.path ? a.path.split(".").length : 0;
    const depthB = b.path ? b.path.split(".").length : 0;
    return depthA - depthB || b.count - a.count || a.path.localeCompare(b.path);
  });
}

function resolveRecords(data, configuredPath = "") {
  const candidates = uniqueCandidates(discoverRecordArrays(data));
  if (configuredPath) {
    const value = getPath(data, configuredPath);
    if (!Array.isArray(value)) {
      throw Object.assign(
        new Error(
          `Records Path '${configuredPath}' does not point to a JSON array.`,
        ),
        {
          status: 400,
          details: { recordsPathCandidates: candidates },
        },
      );
    }
    return { rows: value, path: configuredPath, candidates };
  }
  if (Array.isArray(data)) return { rows: data, path: "", candidates };
  const candidate = candidates[0];
  if (candidate)
    return {
      rows: getPath(data, candidate.path),
      path: candidate.path,
      candidates,
    };
  if (data && typeof data === "object")
    return { rows: [data], path: "", candidates };
  return { rows: [], path: "", candidates };
}

module.exports = { fieldsOf, discoverRecordArrays, resolveRecords };
