/**
 * Analytics Pages: definition contract, routing rules, dropdown items
 * (static / API with cache), selection validation, tenant isolation,
 * parameter precedence and the public handler. DB, repositories and the HTTP
 * layer are stubbed.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

process.env.ANALYTICS_PAGE_MAX_ITEMS = "3";
process.env.ANALYTICS_PAGE_ITEMS_CACHE_TTL_SECONDS = "60";

const root = path.resolve(__dirname, "..");
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const AZURE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOUR_D = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Analytics rows by id (organization, status). */
const analyticRow = (id, organization_id, status = "published") => ({
  id,
  organization_id,
  name: id,
  status,
  definition: {
    mode: "aggregate",
    dataSource: {
      type: "rest",
      action: {
        method: "POST",
        url: "https://becs.test/ExecuteProject",
        body: {
          projectVariables: [
            { name: "CODE", value: "{{CODE}}" },
            { name: "TabName", value: "{{TabName}}" },
          ],
        },
      },
      arrayPath: "rows",
    },
    queryParams: ["CODE", "TabName"],
  },
});
const ANALYTICS = {
  [AZURE]: analyticRow(AZURE, ORG),
  [FOUR_D]: analyticRow(FOUR_D, ORG),
  [FOREIGN]: analyticRow(FOREIGN, OTHER_ORG),
  [DRAFT]: analyticRow(DRAFT, ORG, "draft"),
};
let pageRows = {};

const TABS = {
  DATA: {
    Tab: [
      { Name: "MS Azure IoT" },
      { Name: "4D IoT data - Energy" },
      { Name: "4D IoT data - CO2" },
      { Name: "4D IoT data - Humidity" },
    ],
  },
};
let calls = [];
let itemsResponse = () => ({ ok: true, status: 200, data: TABS });

const stubs = {
  [path.join(root, "lib/db.js")]: {
    query: async () => ({ rows: [] }),
    decryptSecret: (x) => x,
  },
  [path.join(root, "lib/token-manager.js")]: {},
  [path.join(root, "repositories/analytics-repository.js")]: {
    find: async (id) => ({ rows: ANALYTICS[id] ? [ANALYTICS[id]] : [] }),
  },
  [path.join(root, "repositories/analytics-page-repository.js")]: {
    find: async (id) => ({ rows: pageRows[id] ? [pageRows[id]] : [] }),
  },
  [path.join(root, "lib/authenticated-http.js")]: {
    executeAuthenticated: async (action, _q, { organizationId } = {}) => {
      calls.push({ action, organizationId });
      if (action.url.includes("/tabs"))
        return { action, response: itemsResponse(action) };
      // Chart source: echo the rendered body variables as one record.
      const vars = Object.fromEntries(
        (action.body?.projectVariables || []).map((v) => [v.name, v.value]),
      );
      return {
        action,
        response: { ok: true, status: 200, data: { rows: [vars] } },
      };
    },
  },
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  return stubs[resolved] ?? load.apply(this, arguments);
};

const { normalizePageBody } = require("../services/analytics-page-definition");
const { matchesRule, routeItem } = require("../services/analytics-page-rules");
const { clearItemsCache } = require("../services/analytics-page-items");
const {
  pageContext,
  listItems,
  resolveTarget,
  executeTarget,
} = require("../services/analytics-page-service");
const publicHandler = require("../api/public-analytics-pages");

/** The BECS example: dropdown from the tab API, two rules. */
function page(overrides = {}) {
  const body = normalizePageBody({
    parameters: ["CODE", "organizationID"],
    defaultChart: {
      analyticsId: AZURE,
      parameters: [{ name: "TabName", source: "fixed", value: "MS Azure IoT" }],
    },
    selector: {
      enabled: true,
      source: "api",
      api: {
        dataSource: {
          action: {
            method: "POST",
            url: "https://becs.test/tabs?code={{CODE}}",
            body: { projectName: "PS_D_DISPATCHER" },
          },
          arrayPath: "DATA.Tab",
        },
        labelField: "Name",
        valueField: "Name",
      },
      defaultValue: "MS Azure IoT",
    },
    rules: [
      {
        id: "azure",
        match: { field: "label", operator: "equals", text: "MS Azure IoT" },
        analyticsId: AZURE,
        parameters: [{ name: "TabName", source: "itemValue" }],
      },
      {
        id: "fourd",
        match: { field: "label", operator: "startsWith", text: "4d iot data" },
        analyticsId: FOUR_D,
        parameters: [{ name: "TabName", source: "itemValue" }],
      },
    ],
    ...overrides,
  });
  return { ...body, organizationId: ORG };
}

test.beforeEach(() => {
  calls = [];
  itemsResponse = () => ({ ok: true, status: 200, data: TABS });
  clearItemsCache();
  pageRows = {};
});

// ---- Contract --------------------------------------------------------------------

test("definition: a page without selector settings has the dropdown off", () => {
  const p = normalizePageBody({});
  assert.equal(p.selector.enabled, false);
  assert.equal(p.selector.source, "static");
  assert.equal(p.theme, "auto");
  assert.deepEqual(p.rules, []);
});

test("definition: invalid ids, names and duplicate items are dropped", () => {
  const p = normalizePageBody({
    parameters: ["CODE", "CODE", "bad name", "{{x}}"],
    defaultChart: {
      analyticsId: "not-a-uuid",
      parameters: [{ name: "TabName", source: "itemValue", value: "x" }],
    },
    selector: {
      staticItems: [
        { value: "a", label: "A" },
        { value: "a", label: "dup" },
        { value: " " },
        { value: "b" },
      ],
    },
    rules: [{ id: "r1", analyticsId: AZURE, parameters: [{ name: "?" }] }],
  });
  assert.deepEqual(p.parameters, ["CODE"]);
  assert.equal(p.defaultChart.analyticsId, "");
  // The default chart only takes fixed values.
  assert.equal(p.defaultChart.parameters[0].source, "fixed");
  assert.deepEqual(p.selector.staticItems, [
    { value: "a", label: "A" },
    { value: "b", label: "b" },
  ]);
  assert.deepEqual(p.rules[0].parameters, []);
});

// ---- Rules -----------------------------------------------------------------------

test("rules: equals / startsWith / contains, case handling, first match wins", () => {
  const p = page();
  assert.equal(
    routeItem(p, { label: "MS Azure IoT", value: "x" }).ruleId,
    "azure",
  );
  assert.equal(
    routeItem(p, { label: "4D IoT data - CO2", value: "x" }).ruleId,
    "fourd",
  );
  assert.equal(routeItem(p, { label: "Something else", value: "x" }), null);
  const rule = (operator, text, ignoreCase = true) => ({
    analyticsId: AZURE,
    match: { field: "value", operator, text, ignoreCase },
  });
  const item = { label: "", value: "4D IoT data - Energy" };
  assert.ok(matchesRule(item, rule("contains", "energy")));
  assert.ok(!matchesRule(item, rule("contains", "energy", false)));
  assert.ok(!matchesRule(item, { ...rule("equals", "x"), analyticsId: "" }));
});

test("rules: unmatched items can fall back to the default chart", () => {
  const p = page({ selector: { ...page().selector, unmatched: "default" } });
  const route = routeItem(p, { label: "New kind", value: "New kind" });
  assert.equal(route.analyticsId, AZURE);
  assert.deepEqual(route.parameters, { TabName: "MS Azure IoT" });
});

// ---- Items -----------------------------------------------------------------------

test("items: API response mapped by label/value fields and capped", async () => {
  const list = await listItems(page(), { CODE: "V-1101" });
  assert.equal(list.items.length, 3); // ANALYTICS_PAGE_MAX_ITEMS=3
  assert.equal(list.truncated, true);
  assert.deepEqual(
    list.items.map(({ label, value }) => ({ label, value }))[0],
    { label: "MS Azure IoT", value: "MS Azure IoT" },
  );
  assert.equal(list.recordsPath, "DATA.Tab");
  assert.ok(calls[0].action.url.endsWith("code=V-1101"));
  assert.equal(calls[0].organizationId, ORG);
});

test("items: cached per request; fresh bypasses; other parameters miss", async () => {
  await listItems(page(), { CODE: "V-1101" });
  const second = await listItems(page(), { CODE: "V-1101" });
  assert.equal(calls.length, 1);
  assert.equal(second.cached, true);
  await listItems(page(), { CODE: "V-1101" }, { fresh: true });
  assert.equal(calls.length, 2);
  await listItems(page(), { CODE: "V-2202" });
  assert.equal(calls.length, 3);
});

test("items: cache entries are isolated per organization", async () => {
  await listItems(page(), { CODE: "V-1101" });
  await listItems({ ...page(), organizationId: OTHER_ORG }, { CODE: "V-1101" });
  assert.equal(calls.length, 2);
});

test("items: a failing item API raises a safe ITEMS_SOURCE_ERROR", async () => {
  itemsResponse = () => ({ ok: false, status: 503, data: { secret: "x" } });
  await assert.rejects(listItems(page(), {}), (e) => {
    assert.equal(e.code, "ITEMS_SOURCE_ERROR");
    assert.doesNotMatch(e.publicMessage, /becs|503/);
    return true;
  });
});

test("items: static items need no API call; unmatched can be hidden", async () => {
  const p = page({
    selector: {
      enabled: true,
      source: "static",
      staticItems: [
        { label: "Azure", value: "MS Azure IoT" },
        { label: "Other", value: "Unknown" },
      ],
      unmatched: "hide",
    },
    rules: [
      {
        id: "azure",
        match: { field: "value", operator: "equals", text: "MS Azure IoT" },
        analyticsId: AZURE,
      },
    ],
  });
  const list = await listItems(p, {});
  assert.equal(calls.length, 0);
  assert.deepEqual(
    list.items.map((i) => i.label),
    ["Azure"],
  );
});

// ---- Selection -------------------------------------------------------------------

test("resolve: dropdown off shows the default chart with fixed parameters", async () => {
  const p = page({ selector: { enabled: false } });
  const target = await resolveTarget(p, {}, "4D IoT data - CO2");
  assert.equal(target.route.analyticsId, AZURE);
  assert.deepEqual(target.route.parameters, { TabName: "MS Azure IoT" });
  assert.equal(calls.length, 0); // item API not called when off
});

test("resolve: default item, then requested item; unknown items are rejected", async () => {
  const p = page();
  assert.equal((await resolveTarget(p, {}, "")).item.value, "MS Azure IoT");
  const co2 = await resolveTarget(p, {}, "4D IoT data - CO2");
  assert.equal(co2.route.analyticsId, FOUR_D);
  await assert.rejects(
    resolveTarget(p, {}, "Injected value"),
    (e) => e.status === 400 && e.code === "ITEM_NOT_AVAILABLE",
  );
});

test("resolve: unmatched item gives a message, not an error", async () => {
  const p = page({ rules: [page().rules[0]] });
  const target = await resolveTarget(p, {}, "4D IoT data - CO2");
  assert.equal(target.route, null);
  assert.match(target.message, /No chart is configured/);
});

// ---- Execution -------------------------------------------------------------------

test("execute: the item sets {{TabName}} in the body; URL values cannot override", async () => {
  const p = page();
  // A viewer tries to pass TabName and an undeclared parameter in the link.
  const context = pageContext(p, {
    CODE: "V-1101",
    TabName: "Injected",
    secret: "x",
  });
  assert.deepEqual(context, { CODE: "V-1101" });
  const result = await executeTarget(
    { ...p, parameters: [...p.parameters, "TabName"] }, // even if declared…
    { ...context, TabName: "Injected" },
    "4D IoT data - CO2",
    {},
    { requirePublished: true },
  );
  const chartCall = calls.find((c) => c.action.url.includes("ExecuteProject"));
  const vars = Object.fromEntries(
    chartCall.action.body.projectVariables.map((v) => [v.name, v.value]),
  );
  assert.equal(vars.TabName, "4D IoT data - CO2"); // …the item still wins
  assert.equal(vars.CODE, "V-1101");
  assert.equal(result.rawCount, 1);
});

test("execute: analytics of another organization are never opened", async () => {
  const p = page({
    selector: { enabled: false },
    defaultChart: { analyticsId: FOREIGN },
  });
  await assert.rejects(
    executeTarget(p, {}, "", {}, { requirePublished: false }),
    (e) => e.status === 404 && e.code === "CHART_NOT_AVAILABLE",
  );
});

test("execute: drafts open in the builder preview only", async () => {
  const p = page({
    selector: { enabled: false },
    defaultChart: { analyticsId: DRAFT },
  });
  await assert.rejects(
    executeTarget(p, {}, "", {}, { requirePublished: true }),
    (e) => e.code === "CHART_NOT_AVAILABLE",
  );
  const preview = await executeTarget(
    p,
    {},
    "",
    {},
    { requirePublished: false },
  );
  assert.equal(preview.rawCount, 1);
});

// ---- Public handler --------------------------------------------------------------

function call(query) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    publicHandler({ method: "GET", query }, res);
  });
}
const PAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const publish = (p, status = "published") => {
  pageRows[PAGE_ID] = {
    id: PAGE_ID,
    organization_id: ORG,
    name: "IoT dashboard",
    status,
    definition: p,
  };
};

test("public: page view exposes items but no request, rules or chart ids", async () => {
  publish(page());
  const { status, body } = await call({ id: PAGE_ID, CODE: "V-1101" });
  assert.equal(status, 200);
  const json = JSON.stringify(body);
  assert.doesNotMatch(json, /becs\.test|PS_D_DISPATCHER|azure"|aaaaaaaa/);
  assert.equal(body.data.selector.items[0].available, true);
});

test("public: a failing item API still returns the page with an error", async () => {
  publish(page());
  itemsResponse = () => ({ ok: false, status: 500, data: {} });
  const { status, body } = await call({ id: PAGE_ID });
  assert.equal(status, 200);
  assert.equal(body.data.selector.error.code, "ITEMS_SOURCE_ERROR");
  assert.deepEqual(body.data.selector.items, []);
});

test("public: resolve returns the chart without its data source", async () => {
  publish(page());
  const { body } = await call({
    id: PAGE_ID,
    resolve: "1",
    _item: "4D IoT data - CO2",
  });
  assert.equal(body.data.item.value, "4D IoT data - CO2");
  assert.equal(body.data.chart.dataSource, undefined);
  assert.equal(body.data.chart.id, FOUR_D);
});

test("public: execute runs the routed chart; unknown items are rejected", async () => {
  publish(page());
  const ok = await call({
    id: PAGE_ID,
    execute: "1",
    _item: "MS Azure IoT",
    CODE: "V-1101",
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.rawCount, 1);
  const bad = await call({ id: PAGE_ID, execute: "1", _item: "nope" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "ITEM_NOT_AVAILABLE");
});

test("public: unpublished pages are not found", async () => {
  publish(page(), "draft");
  const { status } = await call({ id: PAGE_ID });
  assert.equal(status, 404);
});
