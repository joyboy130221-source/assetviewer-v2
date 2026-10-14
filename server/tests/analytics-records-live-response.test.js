const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveRecords,
  discoverRecordArrays,
} = require("../services/analytics-records");
const payload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "analytics-live-response.json"),
    "utf8",
  ),
);
const recordsPath = "DATA.Tab[0].Attributes.Attribute";
test("actual REST response resolves all telemetry records", () => {
  const result = resolveRecords(payload, recordsPath);
  assert.equal(result.rows.length, 200);
  assert.equal(result.rows[0].Y.telemetry.Temperature, "71.3441948102272");
});
test("actual REST response nested array appears in discovery", () => {
  const paths = discoverRecordArrays(payload).map((item) => item.path);
  assert.ok(paths.includes(recordsPath), JSON.stringify(paths));
});
test("missing Attributes reports precise failing segment", () => {
  const broken = { DATA: { Tab: [{ Name: "MS Azure IoT" }] } };
  assert.throws(
    () => resolveRecords(broken, recordsPath),
    /Failed at: DATA.Tab\[0\].Attributes/,
  );
});
