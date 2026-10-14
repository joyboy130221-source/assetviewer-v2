const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveRecords } = require("../services/analytics-records");
const path = "DATA.Tab[0].Attributes.Attribute";
const payload = {
  DATA: {
    Tab: [{ Attributes: { Attribute: [{ X: "2026-10-13T00:00:00Z" }] } }],
  },
};
test("resolves nested telemetry array", () => {
  assert.equal(resolveRecords(payload, path).rows.length, 1);
});
test("resolves REST response data envelope", () => {
  const result = resolveRecords({ data: payload }, path);
  assert.equal(result.rows.length, 1);
  assert.equal(result.path, "data." + path);
});
test("provides discovered paths for wrong path", () => {
  assert.throws(
    () => resolveRecords(payload, "DATA.Tab[0].Attributes.Attributes"),
    /DATA.Tab\[0\].Attributes.Attribute/,
  );
});
test("does not guess between ambiguous envelopes", () => {
  assert.throws(
    () => resolveRecords({ data: payload, result: payload }, path),
    /does not point to a JSON array/,
  );
});
