/**
 * Analytics Time Series & viewer runtime tests (node:test, no extra deps).
 * Runs the real analytics service against the BDPI telemetry sample with the
 * database and outbound HTTP stubbed.   Run: npm test
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sample = require("./fixtures/bdpi-telemetry.json");
let lastAction = null;
const stubs = {
  [path.join(root, "lib/db.js")]: {
    query: async () => ({ rows: [] }),
    decryptSecret: (x) => x,
  },
  [path.join(root, "lib/authenticated-http.js")]: {
    executeAuthenticated: async (action) => {
      lastAction = action;
      return { action, response: { ok: true, status: 200, data: sample } };
    },
  },
  [path.join(root, "lib/token-manager.js")]: {},
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  return stubs[resolved] ?? load.apply(this, arguments);
};
const { run } = require("../services/analytics-service");
const { splitPublicQuery } = require("../services/analytics-runtime");
const { downsample } = require("../services/analytics-timeseries");

const RECORDS = "DATA.Tab[0].Attributes.Attribute";
const PROPS = [
  "Efficiency",
  "EnergyAmountkWh",
  "NominalVoltage",
  "PanelStatus",
  "PowerAmountKW",
  "Temperature",
];
const measures = PROPS.map((p, i) => ({
  id: `m${i}`,
  field: `Y.telemetry.${p}`,
  chartType: p === "PanelStatus" ? "step" : "",
}));
const source = (arrayPath = RECORDS) => ({
  organizationId: "org",
  dataSource: {
    type: "rest",
    action: {
      url: "https://example.com/telemetry?code={{CODE}}&from={{start}}",
      params: [],
    },
    arrayPath,
  },
});
const ts = (extra = {}) => ({
  ...source(),
  mode: "timeseries",
  timeSeries: { timeField: "X", measures, ...extra },
});
const range = {
  enabled: true,
  defaultPreset: "all",
  presets: ["1h", "all"],
  allowCustom: true,
  fromParam: "start",
  toParam: "end",
  paramFormat: "iso",
};
const hour = { from: "2026-10-13T07:00:00Z", to: "2026-10-13T08:00:00Z" };

test("records discovery: runtime auto-detect unchanged, builder recommendation added", async () => {
  const r = await run({ ...source(""), aggregation: "count" });
  assert.equal(r.recordsPath, "DATA.Tab");
  assert.equal(r.recommendedRecordsPath, RECORDS);
  assert.ok(
    r.recordsPathCandidates.some((c) => c.path === RECORDS && c.count === 200),
  );
});

test("field types are inferred from the records", async () => {
  const r = await run(ts());
  assert.equal(r.fieldTypes.X, "date");
  for (const p of PROPS)
    assert.equal(r.fieldTypes[`Y.telemetry.${p}`], "number");
});

test("one numeric, time-ordered series per measure", async () => {
  const r = await run(ts());
  assert.equal(r.mode, "timeseries");
  assert.equal(r.series.length, 6);
  const s = r.series[0];
  assert.equal(s.label, "Efficiency");
  assert.equal(s.points.length, 200);
  assert.equal(typeof s.points[0][1], "number");
  for (let i = 1; i < s.points.length; i += 1)
    assert.ok(s.points[i][0] > s.points[i - 1][0]);
  assert.equal(r.series[3].chartType, "step");
  assert.equal(
    new Date(r.extent.from).toISOString(),
    "2026-10-13T06:43:45.892Z",
  );
});

test("validation: time field and measures are required", async () => {
  await assert.rejects(run(ts({ measures: [] })), { status: 400 });
  await assert.rejects(run(ts({ timeField: "" })), { status: 400 });
});

test("bucketing and downsampling", async () => {
  const bucketed = await run(ts({ bucket: "15m", bucketAggregation: "avg" }));
  assert.ok(
    bucketed.series[0].points.length >= 16 &&
      bucketed.series[0].points.length <= 18,
  );
  const sampled = await run(ts({ maxPoints: 100 }));
  assert.equal(sampled.series[0].points.length, 100);
  assert.ok(sampled.series[0].downsampled);
  // Downsampling keeps the first and last point.
  const pts = Array.from({ length: 1000 }, (_, i) => [i, Math.sin(i)]);
  const out = downsample(pts, 50);
  assert.deepEqual(out[0], pts[0]);
  assert.deepEqual(out.at(-1), pts.at(-1));
});

test("time range: passed to the source and applied to records", async () => {
  const r = await run({ ...ts(), timeRange: range }, { CODE: "V-1101" }, hour);
  assert.ok(lastAction.url.includes("code=V-1101"));
  assert.ok(lastAction.url.includes("from=2026-10-13T07:00:00.000Z"));
  assert.ok(r.series[0].points.length > 40 && r.series[0].points.length < 52);
  assert.equal(r.timeRange.preset, "custom");
});

test("time range: invalid input rejected, disallowed input ignored", async () => {
  await assert.rejects(
    run({ ...ts(), timeRange: range }, {}, { from: hour.to, to: hour.from }),
    { status: 400 },
  );
  await assert.rejects(
    run({ ...ts(), timeRange: range }, {}, { from: hour.from }),
    { status: 400 },
  );
  const disabled = await run(ts(), {}, hour);
  assert.equal(disabled.series[0].points.length, 200);
  const preset = await run(
    { ...ts(), timeRange: range },
    {},
    { preset: "30d" },
  );
  assert.equal(preset.timeRange.preset, "all");
});

test("toolbar filters: exposed only, validated, options from data", async () => {
  const toolbar = {
    enabled: true,
    allowBucket: true,
    filters: [
      {
        id: "status",
        field: "Y.telemetry.PanelStatus",
        label: "Panel status",
        control: "select",
        operator: "equals",
        applyIn: "bib",
      },
    ],
  };
  const r = await run(
    { ...ts(), toolbar },
    {},
    { filters: { status: "3" }, bucket: "1h" },
  );
  assert.deepEqual(r.filterOptions.status, ["1", "2", "3"]);
  assert.equal(r.filteredCount, 68);
  assert.equal(r.bucket, "1h");
  const ignored = await run(
    { ...ts(), toolbar },
    {},
    { filters: { other: "x" }, bucket: "bogus" },
  );
  assert.equal(ignored.filteredCount, 200);
  assert.equal(ignored.bucket, "raw");
  const numeric = {
    ...toolbar,
    filters: [{ ...toolbar.filters[0], control: "number" }],
  };
  await assert.rejects(
    run({ ...ts(), toolbar: numeric }, {}, { filters: { status: "abc" } }),
    {
      status: 400,
    },
  );
  const fixed = {
    ...toolbar,
    filters: [
      { ...toolbar.filters[0], optionsFromData: false, options: ["1", "2"] },
    ],
  };
  await assert.rejects(
    run({ ...ts(), toolbar: fixed }, {}, { filters: { status: "3" } }),
    {
      status: 400,
    },
  );
  const disabled = await run(
    { ...ts(), toolbar: { ...toolbar, enabled: false } },
    {},
    {
      filters: { status: "3" },
    },
  );
  assert.equal(disabled.filteredCount, 200);
});

test("source filters are sent as template parameters", async () => {
  const toolbar = {
    enabled: true,
    filters: [
      { id: "code", control: "text", applyIn: "source", param: "CODE" },
    ],
  };
  await run(
    { ...ts(), toolbar },
    { CODE: "V-1101" },
    { filters: { code: "V-2202" } },
  );
  assert.ok(lastAction.url.includes("code=V-2202"));
});

test("POST data source: JSON body rendered with runtime parameters", async () => {
  const body = {
    returnAsXML: false,
    projectName: "PS_D_DISPATCHER",
    projectVariables: [
      { name: "CODE", value: "{{CODE}}" },
      { name: "EventType", value: "IoT" },
      { name: "TabName", value: "{{TabName}}" },
    ],
  };
  const def = {
    ...ts(),
    dataSource: {
      ...source().dataSource,
      action: {
        method: "post",
        url: "https://example.com/api/ExecuteProject",
        params: [],
        body,
      },
    },
  };
  const r = await run(def, { CODE: "V-1101", TabName: "MS Azure IoT" });
  assert.equal(lastAction.method, "POST");
  assert.equal(lastAction.bodyFormat, "json");
  assert.equal(lastAction.body.returnAsXML, false);
  assert.deepEqual(lastAction.body.projectVariables[0], {
    name: "CODE",
    value: "V-1101",
  });
  assert.equal(lastAction.body.projectVariables[2].value, "MS Azure IoT");
  assert.equal(r.series[0].points.length, 200);
  // A body given as JSON text is accepted; invalid JSON is rejected.
  const asText = {
    ...def,
    dataSource: {
      ...def.dataSource,
      action: { ...def.dataSource.action, body: JSON.stringify(body) },
    },
  };
  await run(asText, { CODE: "V-2202" });
  assert.equal(lastAction.body.projectVariables[0].value, "V-2202");
  const broken = {
    ...def,
    dataSource: {
      ...def.dataSource,
      action: { ...def.dataSource.action, body: "{oops" },
    },
  };
  await assert.rejects(run(broken), { status: 400 });
  // GET sources never send a body.
  const get = {
    ...def,
    dataSource: {
      ...def.dataSource,
      action: { ...def.dataSource.action, method: "GET" },
    },
  };
  await run(get, { CODE: "V-1101" });
  assert.equal(lastAction.body, undefined);
});

test("aggregate mode is unchanged (backward compatibility)", async () => {
  const r = await run({
    ...source(),
    dimension: "Y.telemetry.PanelStatus",
    aggregation: "count",
  });
  assert.equal(r.mode, "aggregate");
  assert.equal(r.series, undefined);
  assert.equal(
    r.rows.reduce((a, b) => a + b.value, 0),
    200,
  );
  const ranged = await run(
    {
      ...source(),
      dimension: "Y.telemetry.PanelStatus",
      aggregation: "count",
      timeRange: { ...range, field: "X" },
    },
    {},
    hour,
  );
  assert.ok(ranged.filteredCount < 60);
});

test("public query: viewer keys never reach templates", () => {
  const { context, input } = splitPublicQuery({
    CODE: "V-1101",
    darkTheme: "true",
    _preset: "1h",
    _from: "a",
    _bucket: "5m",
    _chart: "bar",
    _hide: "m1",
    _f_status: "2",
  });
  assert.deepEqual(context, { CODE: "V-1101", darkTheme: "true" });
  assert.deepEqual(input, {
    preset: "1h",
    from: "a",
    bucket: "5m",
    filters: { status: "2" },
  });
});
