/**
 * Source API timeout for Analytics definitions. Uses the real HTTP layer
 * against a local server; only the database is stubbed.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");

process.env.WORKFLOW_PRIVATE_HOST_ALLOWLIST = "127.0.0.1";
process.env.ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS = "3000";
process.env.ANALYTICS_MAX_SOURCE_TIMEOUT_MS = "5000";

const root = path.resolve(__dirname, "..");
const stubs = {
  [path.join(root, "lib/db.js")]: {
    query: async () => ({ rows: [] }),
    decryptSecret: (x) => x,
  },
  [path.join(root, "lib/token-manager.js")]: {},
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  return stubs[resolved] ?? load.apply(this, arguments);
};

const { run, connectionFailure } = require("../services/analytics-service");
const {
  readAnalyticsLimits,
  sourceTimeoutMs,
  publicBuilderLimits,
} = require("../config/analytics-limits");
const { normalizeDefinitionBody } = require("../services/analytics-definition");

let server;
let baseUrl;
test.before(async () => {
  server = http.createServer((req, res) => {
    const delay = Number(
      new URL(req.url, "http://x").searchParams.get("delay"),
    );
    setTimeout(() => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ items: [{ v: 1 }, { v: 2 }] }));
    }, delay || 0);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/data`;
});
test.after(() => {
  server.closeAllConnections?.();
  server.close();
});

const definition = (delay, timeoutMs) => ({
  dataSource: {
    type: "rest",
    action: {
      method: "GET",
      url: `${baseUrl}?delay=${delay}`,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    },
    arrayPath: "items",
  },
});

test("limits: env default and ceiling are read and exposed to the builder", () => {
  const limits = readAnalyticsLimits();
  assert.equal(limits.defaultSourceTimeoutMs, 3000);
  assert.equal(limits.maxSourceTimeoutMs, 5000);
  assert.deepEqual(publicBuilderLimits(limits).sourceTimeoutMs, {
    default: 3000,
    min: 1000,
    max: 5000,
  });
});

test("limits: effective timeout falls back to default and is clamped", () => {
  assert.equal(sourceTimeoutMs(undefined), 3000);
  assert.equal(sourceTimeoutMs(""), 3000);
  assert.equal(sourceTimeoutMs(200), 1000);
  assert.equal(sourceTimeoutMs(4000), 4000);
  assert.equal(sourceTimeoutMs(60000), 5000);
});

test("definition: blank timeout is not stored, values are clamped", () => {
  const timeoutOf = (value) =>
    normalizeDefinitionBody(definition(0, value)).dataSource.action.timeoutMs;
  assert.equal(timeoutOf(undefined), undefined);
  assert.equal(timeoutOf(""), undefined);
  assert.equal(timeoutOf("abc"), undefined);
  assert.equal(timeoutOf("4500"), 4500);
  assert.equal(timeoutOf(99999), 5000);
});

test("run: fast source succeeds and reports duration and timeout", async () => {
  const result = await run(definition(0, 2000));
  assert.equal(result.rawCount, 2);
  assert.equal(result.source.timeoutMs, 2000);
  assert.ok(result.source.durationMs >= 0);
});

test("run: definition without timeout uses the server default", async () => {
  const result = await run(definition(0));
  assert.equal(result.source.timeoutMs, 3000);
});

test("run: slow source fails with HTTP 504 SOURCE_TIMEOUT", async () => {
  await assert.rejects(run(definition(1500, 1000)), (error) => {
    assert.equal(error.status, 504);
    assert.equal(error.code, "SOURCE_TIMEOUT");
    assert.equal(error.details.timeoutMs, 1000);
    assert.match(error.message, /did not respond within 1 s/);
    assert.ok(error.publicMessage);
    assert.doesNotMatch(error.publicMessage, /127\.0\.0\.1/);
    return true;
  });
});

test("run: a larger configured timeout lets the same slow source succeed", async () => {
  const result = await run(definition(1500, 2500));
  assert.equal(result.rawCount, 2);
});

test("run: refused connection fails with HTTP 502 SOURCE_UNREACHABLE", async () => {
  const closed = http.createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const def = definition(0, 2000);
  def.dataSource.action.url = `http://127.0.0.1:${port}/data`;
  await assert.rejects(run(def), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.code, "SOURCE_UNREACHABLE");
    assert.equal(error.details.reason, "ECONNREFUSED");
    assert.doesNotMatch(error.publicMessage, /127\.0\.0\.1/);
    return true;
  });
});

test("connect timeout from undici is classified as unreachable", () => {
  const error = Object.assign(new TypeError("fetch failed"), {
    cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
  });
  assert.equal(connectionFailure(error), "UND_ERR_CONNECT_TIMEOUT");
  assert.equal(connectionFailure(new Error("other")), null);
});
