const { getPath } = require("../lib/integration-http");
const { render } = require("../lib/form-engine");
const { createSemaphore } = require("../lib/semaphore");
const { readAnalyticsLimits } = require("../config/analytics-limits");

const {
  fieldsOf,
  fieldTypesOf,
  recommendedPath,
  resolveRecords,
} = require("./analytics-records");
const { normalizeDefinitionBody } = require("./analytics-definition");
const {
  resolveRuntime,
  sourceContextFor,
  parseTime,
} = require("./analytics-runtime");
const {
  buildTimeSeries,
  prepareTimeline,
  measureSeries,
  failedSeries,
  sharedSummary,
  validateTimeSeries,
  configuredMaxPoints,
} = require("./analytics-timeseries");
const { callSource, connectionFailure } = require("./analytics-source");
const { planSourceCalls } = require("./analytics-source-plan");

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
/** Viewer toolbar filters processed by the BIB engine (values already validated). */
function applyRuntimeFilters(rows, filterValues) {
  const local = filterValues.filter(({ filter }) => filter.applyIn === "bib");
  if (!local.length) return rows;
  return rows.filter((row) =>
    local.every(({ filter, value }) =>
      compare(getPath(row, filter.field), filter.operator, value),
    ),
  );
}
/** Distinct values for "options from data" dropdowns, before viewer filters apply. */
function filterOptionsOf(rows, definition) {
  const { maxFilterOptions } = readAnalyticsLimits();
  const options = {};
  if (!definition.toolbar?.enabled) return options;
  for (const filter of definition.toolbar.filters || []) {
    if (filter.control !== "select") continue;
    if (!filter.optionsFromData || filter.applyIn !== "bib") {
      options[filter.id] = filter.options;
      continue;
    }
    const values = new Set();
    for (const row of rows) {
      const value = getPath(row, filter.field);
      if (value == null || value === "" || typeof value === "object") continue;
      values.add(String(value));
      if (values.size >= maxFilterOptions) break;
    }
    options[filter.id] = [...values].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }
  return options;
}
/** Aggregate mode: an enabled time range filters on the configured Time field. */
function applyAggregateTimeRange(rows, definition, range) {
  const field = definition.timeRange?.field;
  if (!range || range.from == null || !field) return rows;
  return rows.filter((row) => {
    const t = parseTime(getPath(row, field));
    return t != null && t >= range.from && t <= range.to;
  });
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
/**
 * One source call with its record pipeline: render templates for the call's
 * range → request → Records Path → configured filters → viewer filters.
 */
async function fetchRecords(definition, context, runtime, range) {
  const templateContext = {
    ...context,
    // Viewer controls override caller parameters of the same name.
    ...sourceContextFor(definition, range, runtime.filterValues),
  };
  const action = render(definition.dataSource.action || {}, templateContext);
  if (!action.url)
    throw Object.assign(new Error("Data source URL is required."), {
      status: 400,
    });
  const executed = await callSource(
    action,
    definition.organizationId || context.organizationId,
    { fresh: runtime.fresh },
  );
  const response = executed.response;
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
  const configured =
    definition.filterMode === "bib"
      ? filterRows(raw, definition.filters, templateContext)
      : raw;
  return {
    executed,
    resolved,
    raw,
    configured,
    viewed: applyRuntimeFilters(configured, runtime.filterValues),
  };
}

/** Runs the planned calls with bounded concurrency; failures are kept per call. */
async function fetchPlanned(plan, definition, context, runtime, concurrency) {
  const semaphore = createSemaphore(concurrency);
  return Promise.all(
    plan.calls.map(async (call) => {
      const release = await semaphore.acquire();
      try {
        return {
          call,
          ok: true,
          data: await fetchRecords(definition, context, runtime, call.range),
        };
      } catch (error) {
        return { call, ok: false, error };
      } finally {
        release();
      }
    }),
  );
}

/** Error shown on one measure's chart; anonymous viewers never see source details. */
function seriesError(error, detailedErrors) {
  const status = error?.status || 500;
  return {
    code: error?.code || (status >= 500 ? "SOURCE_ERROR" : "BAD_REQUEST"),
    message: detailedErrors
      ? error.message
      : status >= 500
        ? error?.publicMessage || "This measure could not be loaded."
        : error.message,
  };
}

function tooManyCallsError(maxCalls) {
  return {
    code: "TOO_MANY_SOURCE_CALLS",
    message: `This view uses more than ${maxCalls} different time ranges. Reset this chart to the shared time range.`,
  };
}

/**
 * Partial runs: the viewer asks for only the measures whose own toolbar
 * changed, so other charts are neither recomputed nor re-fetched. Unknown ids
 * are dropped; an empty or fully unknown list means a normal full run.
 * @returns {Set<string>|null}
 */
function onlyMeasures(definition, requested) {
  if (definition.mode !== "timeseries" || !Array.isArray(requested))
    return null;
  const known = new Set(
    (definition.timeSeries?.measures || []).map((m) => m.id),
  );
  const ids = new Set(requested.map(String).filter((id) => known.has(id)));
  return ids.size ? ids : null;
}
function withMeasures(definition, ids) {
  return {
    ...definition,
    timeSeries: {
      ...definition.timeSeries,
      measures: definition.timeSeries.measures.filter((m) => ids.has(m.id)),
    },
  };
}

/**
 * Executes an analytics definition.
 * @param {object} input definition (stored or unsaved builder state)
 * @param {object} context template values ({{parameter}}) from the caller
 * @param {object} runtimeInput viewer controls:
 *   { preset, from, to, bucket, filters, measures: {<id>: {preset, from, to, bucket}},
 *     fresh, only: [measureId] } (only = partial run for those measures)
 * @param {{ detailedErrors?: boolean }} options detailedErrors shows source
 *   error messages on failed measures (builder only; never for anonymous views)
 */
async function run(input, context = {}, runtimeInput = {}, options = {}) {
  const normalized = { ...input, ...normalizeDefinitionBody(input) };
  const only = onlyMeasures(normalized, runtimeInput?.only);
  const definition = only ? withMeasures(normalized, only) : normalized;
  if (definition?.dataSource?.type !== "rest")
    throw Object.assign(
      new Error("Only REST data sources are supported in Analytics V1."),
      { status: 400 },
    );
  const limits = readAnalyticsLimits();
  const runtime = resolveRuntime(definition, runtimeInput);
  const plan = planSourceCalls(
    definition,
    runtime,
    limits.maxSourceCallsPerRun,
  );

  const startedAt = Date.now();
  const outcomes = await fetchPlanned(
    plan,
    definition,
    context,
    runtime,
    limits.sourceConcurrency,
  );
  const fetchMs = Date.now() - startedAt;
  // Metadata (fields, Records Path, filter options) comes from the first
  // successful call, which is the shared range whenever it was fetched.
  const primary = outcomes.find((o) => o.ok);
  if (!primary) throw outcomes[0].error;
  for (const failed of outcomes.filter((o) => !o.ok))
    console.warn(
      `Analytics source call for ${failed.call.measureIds.length} measure(s) failed: ${failed.error?.message}`,
    );

  const { executed, resolved, raw, configured } = primary.data;
  const fields = fieldsOf(raw);
  const common = {
    mode: definition.mode,
    rawCount: raw.length,
    fields,
    fieldTypes: fieldTypesOf(raw, fields),
    recordsPath: resolved.path,
    recordsPathCandidates: resolved.candidates,
    recommendedRecordsPath: recommendedPath(resolved.candidates),
    filterOptions: filterOptionsOf(configured, definition),
    timeRange: runtime.range,
    bucket: runtime.bucket,
    ...(only ? { partial: [...only] } : {}),
    source: {
      durationMs: fetchMs,
      timeoutMs: executed.timeoutMs,
      calls: outcomes.filter((o) => !o.data?.executed.cached).length,
      cacheHits: outcomes.filter((o) => o.data?.executed.cached).length,
    },
  };

  if (definition.mode === "timeseries") {
    // Single call: unchanged engine path (also used by older callers).
    if (outcomes.length === 1 && !plan.overflow.length) {
      const ts = buildTimeSeries(primary.data.viewed, definition, runtime);
      return {
        ...common,
        rows: [],
        filteredCount: ts.timedCount,
        series: ts.series,
        extent: ts.extent,
        unparsedTimeCount: ts.unparsedTime,
      };
    }
    return {
      ...common,
      ...assembleSeries(
        definition,
        runtime,
        plan,
        outcomes,
        primary,
        options,
        limits,
      ),
    };
  }

  const filtered = applyAggregateTimeRange(
    primary.data.viewed,
    definition,
    runtime.range,
  );
  const chartRows = aggregate(
    filtered,
    definition.dimension || "",
    definition.measure || "",
    definition.aggregation || "count",
  );
  return {
    ...common,
    rows:
      definition.visualization?.type === "table"
        ? filtered.slice(0, MAX_TABLE_ROWS)
        : chartRows,
    filteredCount: filtered.length,
  };
}

/** Time-series result when measures came from several source calls. */
function assembleSeries(
  definition,
  runtime,
  plan,
  outcomes,
  primary,
  options,
  limits,
) {
  const ts = definition.timeSeries || {};
  validateTimeSeries(ts);
  const maxPoints = configuredMaxPoints(ts);
  const timelines = new Map();
  const byMeasure = new Map();
  for (const outcome of outcomes) {
    if (outcome.ok)
      timelines.set(
        outcome.call.key,
        prepareTimeline(outcome.data.viewed, ts.timeField),
      );
    for (const id of outcome.call.measureIds) byMeasure.set(id, outcome);
  }
  const overflow = new Set(plan.overflow);
  const shared = { range: runtime.range, bucket: runtime.bucket };
  const series = ts.measures.map((measure) => {
    const view = runtime.measures?.[measure.id] || shared;
    if (overflow.has(measure.id))
      return failedSeries(
        measure,
        view,
        tooManyCallsError(limits.maxSourceCallsPerRun),
      );
    const outcome = byMeasure.get(measure.id);
    if (!outcome?.ok)
      return failedSeries(
        measure,
        view,
        seriesError(outcome?.error, !!options.detailedErrors),
      );
    return measureSeries(
      measure,
      timelines.get(outcome.call.key),
      view,
      ts,
      maxPoints,
    );
  });
  const primaryTimeline = timelines.get(primary.call.key);
  const summary = sharedSummary(primaryTimeline, primary.call.range);
  return {
    rows: [],
    filteredCount: summary.timedCount,
    series,
    extent: summary.extent,
    unparsedTimeCount: primaryTimeline.unparsedTime,
  };
}

module.exports = { run, connectionFailure };
