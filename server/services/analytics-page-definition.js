/**
 * Analytics Page definition: the contract stored in analytics_pages.definition.
 *
 * A page shows one analytic. With the item selector off it always shows the
 * default chart; with it on, a dropdown lists items (static or from an API)
 * and routing rules decide which analytic each item opens and which
 * {{parameters}} it receives. Everything here is normalized server-side, so a
 * stored page is always valid whatever the client sent.
 */
const { readAnalyticsLimits } = require("../config/analytics-limits");
const { normalizeRestSource } = require("./analytics-definition");

const THEMES = Object.freeze(["auto", "light", "dark"]);
const ITEM_SOURCES = Object.freeze(["static", "api"]);
const RULE_FIELDS = Object.freeze(["label", "value"]);
const RULE_OPERATORS = Object.freeze(["equals", "startsWith", "contains"]);
const PARAM_SOURCES = Object.freeze(["itemValue", "itemLabel", "fixed"]);
/** What happens to an item no rule matches. */
const UNMATCHED = Object.freeze(["message", "hide", "default"]);
/** {{parameter}} names: same rule as template placeholders. */
const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value, max = 500) => String(value ?? "").slice(0, max);
const pick = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;
const bool = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;
const intIn = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const uuidOrEmpty = (value) =>
  UUID.test(String(value ?? "")) ? String(value) : "";

function defaults() {
  return {
    theme: "auto",
    title: "",
    parameters: [],
    defaultChart: { analyticsId: "", parameters: [] },
    selector: {
      enabled: false,
      label: "Select",
      source: "static",
      staticItems: [],
      api: {
        dataSource: normalizeRestSource({}),
        labelField: "",
        valueField: "",
      },
      defaultValue: "",
      rememberInLink: true,
      unmatched: "message",
      searchThreshold: 10,
    },
    rules: [],
  };
}

/** Host-link parameter names the page accepts and passes to its charts. */
function normalizeParameterNames(value, limits) {
  return (Array.isArray(value) ? value : [])
    .map((p) => String(p).trim())
    .filter((p, i, all) => PARAM_NAME.test(p) && all.indexOf(p) === i)
    .slice(0, limits.pageMaxParameters);
}

/** One {{parameter}} a chart receives: from the selected item or fixed. */
function normalizeMapping(value, allowedSources) {
  const v = value || {};
  const name = text(v.name, 64).trim();
  if (!PARAM_NAME.test(name)) return null;
  return {
    name,
    source: pick(v.source, allowedSources, allowedSources[0]),
    value: text(v.value, 2000),
  };
}
function normalizeMappings(value, allowedSources, limits) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((m) => normalizeMapping(m, allowedSources))
    .filter((m) => m && !seen.has(m.name) && seen.add(m.name))
    .slice(0, limits.pageMaxParameters);
}

function normalizeStaticItems(value, limits) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const valueText = text(item?.value, 500).trim();
      return {
        value: valueText,
        label: text(item?.label, 200).trim() || valueText,
      };
    })
    .filter(
      (item) => item.value && !seen.has(item.value) && seen.add(item.value),
    )
    .slice(0, limits.pageMaxItems);
}

function normalizeSelector(value, base, limits) {
  const v = value || {};
  const api = v.api || {};
  return {
    enabled: bool(v.enabled, base.enabled),
    label: text(v.label, 80).trim() || base.label,
    source: pick(v.source, ITEM_SOURCES, base.source),
    staticItems: normalizeStaticItems(v.staticItems, limits),
    api: {
      dataSource: normalizeRestSource(api.dataSource),
      labelField: text(api.labelField, 300).trim(),
      valueField: text(api.valueField, 300).trim(),
    },
    defaultValue: text(v.defaultValue, 500),
    rememberInLink: bool(v.rememberInLink, base.rememberInLink),
    unmatched: pick(v.unmatched, UNMATCHED, base.unmatched),
    searchThreshold: intIn(v.searchThreshold, base.searchThreshold, 0, 1000),
  };
}

function normalizeRule(value, index, limits) {
  const v = value || {};
  const match = v.match || {};
  return {
    id: ID.test(String(v.id ?? "")) ? String(v.id) : `rule-${index + 1}`,
    match: {
      field: pick(match.field, RULE_FIELDS, "label"),
      operator: pick(match.operator, RULE_OPERATORS, "equals"),
      text: text(match.text, 500),
      ignoreCase: bool(match.ignoreCase, true),
    },
    analyticsId: uuidOrEmpty(v.analyticsId),
    parameters: normalizeMappings(v.parameters, PARAM_SOURCES, limits),
  };
}

/** @returns the normalized page definition (the JSONB body). */
function normalizePageBody(input) {
  const b = input || {};
  const base = defaults();
  const limits = readAnalyticsLimits();
  const chart = b.defaultChart || {};
  const seenRules = new Set();
  return {
    theme: pick(b.theme, THEMES, base.theme),
    title: text(b.title, 180),
    parameters: normalizeParameterNames(b.parameters, limits),
    defaultChart: {
      analyticsId: uuidOrEmpty(chart.analyticsId),
      // The default chart is not tied to an item, so only fixed values.
      parameters: normalizeMappings(chart.parameters, ["fixed"], limits),
    },
    selector: normalizeSelector(b.selector, base.selector, limits),
    rules: (Array.isArray(b.rules) ? b.rules : [])
      .slice(0, limits.pageMaxRules)
      .map((rule, index) => normalizeRule(rule, index, limits))
      .filter((rule) => !seenRules.has(rule.id) && seenRules.add(rule.id)),
  };
}

function mapPageRow(row, { includeOrganizationName = true } = {}) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...(includeOrganizationName
      ? { organizationName: row.organization_name }
      : {}),
    name: row.name,
    description: row.description || "",
    status: row.status,
    ...normalizePageBody(row.definition || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

/** Every analytic a page can show (default chart and rule targets). */
const referencedAnalytics = (page) => [
  ...new Set(
    [
      page.defaultChart.analyticsId,
      ...page.rules.map((r) => r.analyticsId),
    ].filter(Boolean),
  ),
];

module.exports = {
  normalizePageBody,
  mapPageRow,
  referencedAnalytics,
  PARAM_NAME,
  THEMES,
  RULE_OPERATORS,
};
