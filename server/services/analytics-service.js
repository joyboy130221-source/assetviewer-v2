const { execute, getPath } = require("../lib/integration-http");
const { render, applyAuthProfile } = require("../lib/form-engine");
const { query } = require("../lib/db");

const { fieldsOf, resolveRecords } = require("./analytics-records");
const MAX_TABLE_ROWS = 500;

function compare(actual, op, expected) {
  const a = actual ?? "",
    e = expected ?? "";
  const an = Number(a),
    en = Number(e),
    numeric = !Number.isNaN(an) && !Number.isNaN(en) && String(e).trim() !== "";
  const left = numeric ? an : String(a).toLowerCase(),
    right = numeric ? en : String(e).toLowerCase();
  if (op === "notEquals") return left !== right;
  if (op === "contains") return String(left).includes(String(right));
  if (op === "gt") return left > right;
  if (op === "gte") return left >= right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  return left === right;
}
function filterRows(rows, filters, context) {
  return rows.filter((row) =>
    (filters || []).every((f) => {
      if (!f.field) return true;
      const expected = render(f.value || "", context);
      return compare(getPath(row, f.field), f.operator, expected);
    }),
  );
}
function aggregate(rows, dimension, measure, aggregation) {
  if (aggregation === "count" && !dimension)
    return [{ label: "Total", value: rows.length }];
  const groups = new Map();
  for (const row of rows) {
    const key = dimension
      ? String(getPath(row, dimension) ?? "(blank)")
      : "Total";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([label, items]) => {
    const vals = items
      .map((x) => Number(measure ? getPath(x, measure) : 0))
      .filter(Number.isFinite);
    let value = items.length;
    if (aggregation === "sum") value = vals.reduce((a, b) => a + b, 0);
    if (aggregation === "avg")
      value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    if (aggregation === "min") value = vals.length ? Math.min(...vals) : 0;
    if (aggregation === "max") value = vals.length ? Math.max(...vals) : 0;
    return { label, value };
  });
}
async function run(definition, context = {}) {
  if (definition?.dataSource?.type !== "rest")
    throw Object.assign(
      new Error("Only REST data sources are supported in Analytics V1."),
      { status: 400 },
    );
  let action = render(definition.dataSource.action || {}, context);
  if (!action.url)
    throw Object.assign(new Error("Data source URL is required."), {
      status: 400,
    });
  action = await applyAuthProfile(action, query);
  const response = await execute(action);
  if (!response.ok)
    throw Object.assign(
      new Error(`Source API returned HTTP ${response.status}.`),
      { status: 400, details: response.data },
    );
  const resolved = resolveRecords(
    response.data,
    definition.dataSource.arrayPath || "",
  );
  const raw = resolved.rows;
  const filtered =
    definition.filterMode === "bib"
      ? filterRows(raw, definition.filters, context)
      : raw;
  const chartRows = aggregate(
    filtered,
    definition.dimension || "",
    definition.measure || "",
    definition.aggregation || "count",
  );
  return {
    rows:
      definition.visualization?.type === "table"
        ? filtered.slice(0, MAX_TABLE_ROWS)
        : chartRows,
    rawCount: raw.length,
    filteredCount: filtered.length,
    fields: fieldsOf(raw),
    recordsPath: resolved.path,
    recordsPathCandidates: resolved.candidates,
  };
}
module.exports = { run };
