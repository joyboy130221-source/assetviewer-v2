const crypto = require("crypto");
const { decryptSecret } = require("./db");

function getValue(context, path) {
  return String(path || "")
    .split(".")
    .reduce((value, key) => value?.[key], context);
}

function evaluateExpression(expression, context) {
  const text = String(expression || "").trim();
  const fn = text.match(/^(uppercase|lowercase|default|date|now)\((.*)\)$/i);
  if (!fn) return getValue(context, text) ?? "";
  const name = fn[1].toLowerCase();
  const args = fn[2]
    .split(",")
    .map((x) => x.trim().replace(/^['"]|['"]$/g, ""));
  if (name === "now") return new Date().toISOString();
  const value = getValue(context, args[0]) ?? args[0] ?? "";
  if (name === "uppercase") return String(value).toUpperCase();
  if (name === "lowercase") return String(value).toLowerCase();
  if (name === "default")
    return value === "" || value == null ? args[1] || "" : value;
  if (name === "date") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const yyyy = d.getFullYear(),
      mm = String(d.getMonth() + 1).padStart(2, "0"),
      dd = String(d.getDate()).padStart(2, "0");
    return (args[1] || "yyyy-MM-dd")
      .replace("yyyy", yyyy)
      .replace("MM", mm)
      .replace("dd", dd);
  }
  return value;
}

function ensureSystemTemplates(context) {
  const target = context && typeof context === "object" ? context : {};
  if (!Object.prototype.hasOwnProperty.call(target, "uuid")) {
    target.uuid = crypto.randomUUID();
  }
  return target;
}

function render(value, context) {
  context = ensureSystemTemplates(context);
  if (typeof value === "string")
    return value.replace(/{{\s*([^{}]+?)\s*}}/g, (_, expr) =>
      String(evaluateExpression(expr, context)),
    );
  if (Array.isArray(value)) return value.map((x) => render(x, context));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, render(v, context)]),
    );
  return value;
}

function conditionMatches(condition, values) {
  const actual = values[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case "notEquals":
      return String(actual ?? "") !== String(expected ?? "");
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "empty":
      return actual == null || actual === "";
    case "notEmpty":
      return actual != null && actual !== "";
    case "greaterThan":
      return Number(actual) > Number(expected);
    case "lessThan":
      return Number(actual) < Number(expected);
    default:
      return String(actual ?? "") === String(expected ?? "");
  }
}

function ruleMatches(rule, values) {
  const results = (rule.conditions || []).map((c) =>
    conditionMatches(c, values),
  );
  return rule.conditionMode === "OR"
    ? results.some(Boolean)
    : results.every(Boolean);
}

function fieldState(field, rules, values) {
  const state = {
    hidden: false,
    disabled: false,
    required: Boolean(field.required),
  };
  for (const rule of rules || [])
    if (ruleMatches(rule, values))
      for (const action of rule.actions || [])
        if (action.field === field.name) {
          if (action.type === "show") state.hidden = false;
          if (action.type === "hide") state.hidden = true;
          if (action.type === "enable") state.disabled = false;
          if (action.type === "disable") state.disabled = true;
          if (action.type === "required") state.required = true;
        }
  return state;
}

function validateField(field, value, requiredOverride) {
  const empty = value == null || value === "";
  if (requiredOverride && empty) return `${field.label} is required.`;
  if (empty) return null;
  const v = field.validation || {};
  const text = String(value);
  if (v.minLength != null && text.length < Number(v.minLength))
    return (
      v.message || `${field.label} must be at least ${v.minLength} characters.`
    );
  if (v.maxLength != null && text.length > Number(v.maxLength))
    return (
      v.message || `${field.label} must be at most ${v.maxLength} characters.`
    );
  if (v.min != null && Number(value) < Number(v.min))
    return v.message || `${field.label} must be at least ${v.min}.`;
  if (v.max != null && Number(value) > Number(v.max))
    return v.message || `${field.label} must be at most ${v.max}.`;
  if (v.pattern)
    try {
      if (!new RegExp(v.pattern).test(text))
        return v.message || `${field.label} has an invalid format.`;
    } catch {}
  return null;
}

async function applyAuthProfile(action, query) {
  if (!action?.authProfileId)
    return { ...action, headers: { ...(action?.headers || {}) } };
  const r = await query(
    "SELECT * FROM authentication_profiles WHERE id=$1 AND active=TRUE AND deleted_at IS NULL",
    [action.authProfileId],
  );
  const p = r.rows[0];
  if (!p) throw new Error("Authentication profile is unavailable.");
  const headers = { ...(action.headers || {}) };
  const secret = decryptSecret(p.secret_value);
  if (p.auth_type === "apiKey") headers[p.header_name || "apikey"] = secret;
  else if (p.auth_type === "bearer") headers.Authorization = `Bearer ${secret}`;
  else if (p.auth_type === "basic")
    headers.Authorization = `Basic ${Buffer.from(`${p.username || ""}:${secret}`).toString("base64")}`;
  else if (p.auth_type === "customHeader")
    headers[p.header_name || "Authorization"] = secret;
  return { ...action, headers };
}

module.exports = {
  render,
  ruleMatches,
  fieldState,
  validateField,
  applyAuthProfile,
  ensureSystemTemplates,
};
