const { flatten, getPath } = require("../lib/integration-http");

const MAX_DISCOVERY_DEPTH = 6;
const MAX_DISCOVERY_CANDIDATES = 50;
const MAX_FIELDS = 500;
/**
 * Small arrays of objects are treated as containers (e.g. `DATA.Tab[]` holding
 * one or two tabs), so the record arrays inside them are offered too, with an
 * explicit index path such as `DATA.Tab[0].Attributes.Attribute`.
 */
const MAX_CONTAINER_ITEMS = 5;
const TYPE_SAMPLE_SIZE = 25;

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
    // An array is a dataset boundary: nested arrays inside its records are child
    // collections. The exception is a small container array (a few objects that
    // wrap the real records), whose items are explored with an explicit index.
    // These deeper candidates never change runtime auto-detection, which still
    // prefers the shallowest path (see uniqueCandidates).
    if (
      value.length <= MAX_CONTAINER_ITEMS &&
      value.every(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      )
    )
      value.forEach((item, index) =>
        discoverRecordArrays(item, `${path}[${index}]`, depth + 1, out),
      );
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

/**
 * Best candidate for the builder to suggest: the largest record collection.
 * Builder-only; runtime auto-detection is unchanged for backward compatibility.
 */
function recommendedPath(candidates) {
  let best = null;
  for (const candidate of candidates)
    if (!best || candidate.count > best.count) best = candidate;
  return best ? best.path : "";
}

/** Samples records to label each field as number, date or string for the builder. */
function fieldTypesOf(rows, fields) {
  // Required lazily to keep this module free of load-order coupling.
  const { toNumber } = require("./analytics-timeseries");
  const { parseTime } = require("./analytics-runtime");
  const samples = (Array.isArray(rows) ? rows : []).slice(0, TYPE_SAMPLE_SIZE);
  const types = {};
  for (const field of fields) {
    let seen = 0,
      numeric = 0,
      dates = 0;
    for (const row of samples) {
      const value = getPath(row, field);
      if (value == null || value === "") continue;
      seen += 1;
      if (toNumber(value) != null && typeof value !== "boolean") numeric += 1;
      else if (typeof value === "string" && parseTime(value) != null)
        dates += 1;
    }
    types[field] =
      seen && numeric === seen
        ? "number"
        : seen && dates === seen
          ? "date"
          : "string";
  }
  return types;
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

module.exports = {
  fieldsOf,
  fieldTypesOf,
  discoverRecordArrays,
  recommendedPath,
  resolveRecords,
};
