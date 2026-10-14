/**
 * Per-measure viewer toolbars: definition contract, runtime validation,
 * source call planning, per-measure failure isolation, concurrency and the
 * optional source response cache. Only the HTTP layer and database are stubbed.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

process.env.ANALYTICS_MAX_SOURCE_CALLS_PER_RUN = "3";
process.env.ANALYTICS_SOURCE_CONCURRENCY = "2";

const root = path.resolve(__dirname, "..");
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);

/** One reading per minute for the last 3 days: a = minute index, b = 1. */
const ROWS = Array.from({ length: 3 * 24 * 60 }, (_, i) => ({
  t: new Date(NOW - (3 * 24 * 60 - 1 - i) * 60_000).toISOString(),
  a: i,
  b: 1,
}));

let calls = [];
let inFlight = 0;
let maxInFlight = 0;
/** Optional per-test override: (action) => response | throws */
let respond = null;
const stubs = {
  [path.join(root, "lib/db.js")]: {
    query: async () => ({ rows: [] }),
    decryptSecret: (x) => x,
  },
  [path.join(root, "lib/token-manager.js")]: {},
  [path.join(root, "lib/authenticated-http.js")]: {
    executeAuthenticated: async (action, _query, { organizationId } = {}) => {
      calls.push({ action, organizationId });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((r) => setTimeout(r, 15));
        if (respond) return { action, response: await respond(action) };
        // Honour {{start}}/{{end}} like a real source would.
        const url = new URL(action.url);
        const from =
          Date.parse(url.searchParams.get("start") || "") || -Infinity;
        const to = Date.parse(url.searchParams.get("end") || "") || Infinity;
        const items = ROWS.filter((r) => {
          const t = Date.parse(r.t);
          return t >= from && t <= to;
        });
        return { action, response: { ok: true, status: 200, data: { items } } };
      } finally {
        inFlight -= 1;
      }
    },
  },
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  return stubs[resolved] ?? load.apply(this, arguments);
};

const { run } = require("../services/analytics-service");
const { normalizeDefinitionBody } = require("../services/analytics-definition");
const {
  resolveRuntime,
  splitPublicQuery,
  RESERVED_KEY,
} = require("../services/analytics-runtime");
const { planSourceCalls } = require("../services/analytics-source-plan");
const { clearSourceCache, cacheKey } = require("../services/analytics-source");
const { TtlCache } = require("../lib/ttl-cache");

const measure = (id, field, toolbar) => ({
  id,
  field,
  label: id.toUpperCase(),
  ...(toolbar ? { toolbar } : {}),
});
const OWN_ALL = {
  enabled: true,
  chartTypes: ["line", "bar"],
  allowBucket: true,
  allowTimeRange: true,
};

function definition({ sendRange = false, measures, toolbar } = {}) {
  return {
    mode: "timeseries",
    organizationId: "org-1",
    dataSource: {
      type: "rest",
      action: {
        method: "GET",
        url: sendRange
          ? "https://source.test/data?start={{start}}&end={{end}}"
          : "https://source.test/data",
      },
      arrayPath: "items",
    },
    timeSeries: {
      timeField: "t",
      layout: "separate",
      bucket: "raw",
      bucketAggregation: "sum",
      maxPoints: 50000,
      measures: measures ?? [
        measure("a", "a", OWN_ALL),
        measure("b", "b", OWN_ALL),
        measure("c", "b"),
      ],
    },
    timeRange: {
      enabled: true,
      defaultPreset: "24h",
      presets: ["1h", "4h", "24h", "7d"],
      allowCustom: true,
      ...(sendRange ? { fromParam: "start", toParam: "end" } : {}),
    },
    toolbar: toolbar ?? { enabled: true, allowBucket: true },
  };
}

test.beforeEach(() => {
  calls = [];
  inFlight = 0;
  maxInFlight = 0;
  respond = null;
  delete process.env.ANALYTICS_SOURCE_CACHE_TTL_SECONDS;
  clearSourceCache();
});

// ---- Contract ----------------------------------------------------------------

test("definition: measures saved before this feature get a disabled toolbar", () => {
  const d = normalizeDefinitionBody(definition());
  assert.deepEqual(d.timeSeries.measures[2].toolbar, {
    enabled: false,
    chartTypes: [],
    allowBucket: false,
    allowTimeRange: false,
  });
});

test("definition: measure toolbar chart types are validated and de-duplicated", () => {
  const d = normalizeDefinitionBody(
    definition({
      measures: [
        measure("a", "a", {
          enabled: true,
          chartTypes: ["bar", "pie", "bar", "line"],
          allowBucket: "yes",
        }),
      ],
    }),
  );
  assert.deepEqual(d.timeSeries.measures[0].toolbar, {
    enabled: true,
    chartTypes: ["bar", "line"],
    allowBucket: false,
    allowTimeRange: false,
  });
});

// ---- Runtime validation --------------------------------------------------------

const resolve = (def, input) =>
  resolveRuntime({ ...def, ...normalizeDefinitionBody(def) }, input, NOW);

test("runtime: per-measure range and bucket apply only where enabled", () => {
  const r = resolve(definition(), {
    measures: {
      a: { preset: "1h", bucket: "1h" },
      c: { preset: "1h", bucket: "1h" }, // no own toolbar → ignored
      zzz: { preset: "1h" }, // unknown measure → ignored
    },
  });
  assert.deepEqual(r.measures.a.range, {
    from: NOW - HOUR,
    to: NOW,
    preset: "1h",
  });
  assert.equal(r.measures.a.bucket, "1h");
  assert.equal(r.measures.a.ownRange, true);
  assert.equal(r.measures.a.ownBucket, true);
  assert.deepEqual(r.measures.c.range, r.range);
  assert.equal(r.measures.c.bucket, "raw");
  assert.equal(r.measures.c.ownRange, false);
  assert.equal(r.measures.zzz, undefined);
});

test("runtime: a control the author did not enable is ignored", () => {
  const def = definition({
    measures: [
      measure("a", "a", {
        enabled: true,
        allowBucket: true,
        allowTimeRange: false,
      }),
    ],
  });
  const r = resolve(def, { measures: { a: { preset: "1h", bucket: "5m" } } });
  assert.deepEqual(r.measures.a.range, r.range);
  assert.equal(r.measures.a.bucket, "5m");
});

test("runtime: invalid per-measure custom range is rejected with the measure name", () => {
  assert.throws(
    () =>
      resolve(definition(), {
        measures: {
          a: { from: "2026-10-14T10:00:00Z", to: "2026-10-13T10:00:00Z" },
        },
      }),
    (e) => e.status === 400 && /^A: .*before its end/.test(e.message),
  );
});

test("runtime: a measure range equal to the shared range is not 'own'", () => {
  const r = resolve(definition(), { measures: { a: { preset: "24h" } } });
  assert.equal(r.measures.a.ownRange, false);
});

test("public query: _m.<id>.* keys become measure input and never reach templates", () => {
  const { context, input } = splitPublicQuery({
    CODE: "V-1101",
    "_m.a.preset": "1h",
    "_m.a.bucket": "5m",
    "_m.a.chart": "bar",
    "_m.b-2.from": "2026-10-13T00:00:00Z",
    _fresh: "1",
  });
  assert.deepEqual(context, { CODE: "V-1101" });
  assert.deepEqual(input.measures, {
    a: { preset: "1h", bucket: "5m" },
    "b-2": { from: "2026-10-13T00:00:00Z" },
  });
  assert.equal(input.fresh, true);
  assert.ok(RESERVED_KEY.test("_m.a.chart"));
  assert.ok(!RESERVED_KEY.test("_m.a.secret"));
});

// ---- Planning -------------------------------------------------------------------

test("plan: range not sent to the source means one call for every measure", () => {
  const def = { ...definition(), ...normalizeDefinitionBody(definition()) };
  const runtime = resolveRuntime(
    def,
    { measures: { a: { preset: "1h" } } },
    NOW,
  );
  const plan = planSourceCalls(def, runtime, 3);
  assert.equal(plan.calls.length, 1);
  assert.deepEqual(plan.calls[0].measureIds, ["a", "b", "c"]);
});

test("plan: measures with the same range share a call; shared range first", () => {
  const d = definition({ sendRange: true });
  const def = { ...d, ...normalizeDefinitionBody(d) };
  const runtime = resolveRuntime(
    def,
    { measures: { a: { preset: "1h" }, b: { preset: "1h" } } },
    NOW,
  );
  const plan = planSourceCalls(def, runtime, 3);
  assert.equal(plan.calls.length, 2);
  assert.equal(plan.calls[0].shared, true);
  assert.deepEqual(plan.calls[0].measureIds, ["c"]);
  assert.deepEqual(plan.calls[1].measureIds, ["a", "b"]);
});

test("plan: groups beyond the cap overflow", () => {
  const d = definition({ sendRange: true });
  const def = { ...d, ...normalizeDefinitionBody(d) };
  const runtime = resolveRuntime(
    def,
    { measures: { a: { preset: "1h" }, b: { preset: "4h" } } },
    NOW,
  );
  const plan = planSourceCalls(def, runtime, 2);
  assert.equal(plan.calls.length, 2);
  assert.deepEqual(plan.overflow, ["b"]);
});

// ---- Runs -----------------------------------------------------------------------

/** run() with a fixed clock for presets. */
async function runAt(def, input, options) {
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    return await run(def, {}, input, options);
  } finally {
    Date.now = realNow;
  }
}
const byId = (result) =>
  Object.fromEntries(result.series.map((s) => [s.id, s]));

test("run: single fetch slices each measure's own range and bucket", async () => {
  const result = await runAt(definition(), {
    measures: { a: { preset: "1h", bucket: "1h" }, b: { preset: "4h" } },
  });
  assert.equal(calls.length, 1);
  const s = byId(result);
  assert.equal(s.c.sourcePoints, 24 * 60 + 1); // shared 24h, inclusive bounds
  assert.equal(s.b.sourcePoints, 4 * 60 + 1); // 4h, inclusive bounds
  assert.equal(s.a.bucket, "1h");
  assert.ok(s.a.points.length <= 2); // one hour in 1h buckets
  assert.equal(s.a.timeRange.preset, "1h");
  assert.equal(result.source.calls, 1);
});

test("run: definitions without measure toolbars behave as before", async () => {
  const result = await runAt(
    definition({ measures: [measure("a", "a"), measure("b", "b")] }),
    { preset: "4h", measures: { a: { preset: "1h" } } },
  );
  assert.equal(calls.length, 1);
  for (const s of result.series) {
    assert.equal(s.sourcePoints, 4 * 60 + 1);
    assert.equal(s.timeRange.preset, "4h");
    assert.equal(s.error, undefined);
  }
});

test("run: range sent to source makes one call per distinct range", async () => {
  const result = await runAt(definition({ sendRange: true }), {
    measures: { a: { preset: "1h" }, b: { preset: "1h" } },
  });
  assert.equal(calls.length, 2);
  const s = byId(result);
  assert.equal(s.a.sourcePoints, 61);
  assert.equal(s.b.sourcePoints, 61);
  assert.equal(s.c.sourcePoints, 24 * 60 + 1);
  assert.equal(result.source.calls, 2);
});

test("run: ranges beyond the cap fail only those measures", async () => {
  const d = definition({
    sendRange: true,
    measures: [
      measure("a", "a", OWN_ALL),
      measure("b", "b", OWN_ALL),
      measure("c", "b", OWN_ALL),
      measure("d", "a"),
    ],
  });
  const result = await runAt(d, {
    measures: { a: { preset: "1h" }, b: { preset: "4h" }, c: { preset: "7d" } },
  });
  assert.equal(calls.length, 3); // shared (d) + 1h + 4h; 7d is over the cap
  const s = byId(result);
  assert.equal(s.c.error.code, "TOO_MANY_SOURCE_CALLS");
  assert.match(s.c.error.message, /more than 3 different time ranges/);
  assert.equal(s.c.points.length, 0);
  assert.ok(
    s.a.points.length > 0 && s.b.points.length > 0 && s.d.points.length > 0,
  );
});

test("run: one failing source call isolates its measures; message depends on audience", async () => {
  respond = (action) => {
    if (action.url.includes("start=") && !action.url.includes("2026-10-13T12"))
      throw Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      });
    return { ok: true, status: 200, data: { items: ROWS.slice(-60) } };
  };
  const d = definition({ sendRange: true });
  const input = { measures: { a: { preset: "1h" } } };
  const publicResult = await runAt(d, input);
  const failed = byId(publicResult).a;
  assert.equal(failed.error.code, "SOURCE_UNREACHABLE");
  assert.match(failed.error.message, /could not be reached/);
  assert.ok(byId(publicResult).c.points.length > 0);

  const builder = await runAt(d, input, { detailedErrors: true });
  assert.match(byId(builder).a.error.message, /refused the connection/);
});

test("run: when every source call fails the run fails as before", async () => {
  respond = () => {
    throw Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
  };
  await assert.rejects(
    runAt(definition({ sendRange: true }), {
      measures: { a: { preset: "1h" } },
    }),
    (e) => e.status === 502 && e.code === "SOURCE_UNREACHABLE",
  );
});

test("run: source calls respect ANALYTICS_SOURCE_CONCURRENCY", async () => {
  const d = definition({
    sendRange: true,
    measures: [
      measure("a", "a", OWN_ALL),
      measure("b", "b", OWN_ALL),
      measure("c", "b"),
    ],
  });
  await runAt(d, { measures: { a: { preset: "1h" }, b: { preset: "4h" } } });
  assert.equal(calls.length, 3);
  assert.ok(maxInFlight <= 2, `max in flight was ${maxInFlight}`);
});

// ---- Cache ----------------------------------------------------------------------

test("cache: off by default", async () => {
  await runAt(definition(), {});
  await runAt(definition(), {});
  assert.equal(calls.length, 2);
});

test("cache: TTL reuses identical requests; fresh bypasses the read", async () => {
  process.env.ANALYTICS_SOURCE_CACHE_TTL_SECONDS = "30";
  const first = await runAt(definition(), {});
  const second = await runAt(definition(), {});
  assert.equal(calls.length, 1);
  assert.equal(first.source.cacheHits, 0);
  assert.equal(second.source.cacheHits, 1);
  assert.equal(second.source.calls, 0);
  await runAt(definition(), { fresh: true });
  assert.equal(calls.length, 2);
});

test("cache: entries are isolated per organization", async () => {
  process.env.ANALYTICS_SOURCE_CACHE_TTL_SECONDS = "30";
  await runAt(definition(), {});
  await runAt({ ...definition(), organizationId: "org-2" }, {});
  assert.equal(calls.length, 2);
  const action = { method: "GET", url: "https://x" };
  assert.notEqual(cacheKey(action, "org-1"), cacheKey(action, "org-2"));
  assert.equal(
    cacheKey({ url: "https://x", method: "GET", headers: { b: 1, a: 2 } }, "o"),
    cacheKey({ headers: { a: 2, b: 1 }, method: "GET", url: "https://x" }, "o"),
  );
});

test("cache: failed responses are never cached", async () => {
  process.env.ANALYTICS_SOURCE_CACHE_TTL_SECONDS = "30";
  respond = () => ({ ok: false, status: 503, data: {} });
  await assert.rejects(runAt(definition(), {}));
  await assert.rejects(runAt(definition(), {}));
  assert.equal(calls.length, 2);
});

test("ttl cache: expiry and least-recently-used eviction", () => {
  let now = 0;
  const cache = new TtlCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a"); // a is now most recent
  cache.set("c", 3); // evicts b
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  now = 150;
  assert.equal(cache.get("a"), undefined);
  assert.equal(new TtlCache({ ttlMs: 0, maxEntries: 5 }).size, 0);
});

// ---- Partial runs ---------------------------------------------------------------

test("partial run: only the requested measures are computed and fetched", async () => {
  const result = await runAt(definition({ sendRange: true }), {
    measures: { a: { preset: "1h" } },
    only: ["a", "unknown"],
  });
  assert.deepEqual(result.partial, ["a"]);
  assert.deepEqual(
    result.series.map((s) => s.id),
    ["a"],
  );
  assert.equal(calls.length, 1); // only a's range, not the shared one
  assert.ok(calls[0].action.url.includes("start="));
});

test("partial run: unknown-only or empty list falls back to a full run", async () => {
  const result = await runAt(definition(), { only: ["nope"] });
  assert.equal(result.partial, undefined);
  assert.equal(result.series.length, 3);
});

test("public query: _only becomes a measure list", () => {
  const { context, input } = splitPublicQuery({ _only: "a, b", CODE: "1" });
  assert.deepEqual(input.only, ["a", "b"]);
  assert.deepEqual(context, { CODE: "1" });
});
