const crypto = require("crypto");
const { decryptSecret } = require("./db");
const { getManagedToken, invalidateManagedToken } = require("./token-manager");
const { getPath } = require("./object-path");

function getValue(context, path) {
  return getPath(context, path);
}

function splitArguments(text) {
  const args = [];
  let current = "",
    quote = null,
    depth = 0;
  for (const ch of String(text || "")) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() || args.length) args.push(current.trim());
  return args;
}
function literalOrExpression(value, context) {
  const text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  )
    return text.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return evaluateExpression(text, context);
}
function evaluateExpression(expression, context) {
  const text = String(expression || "").trim();
  const fn = text.match(/^([a-zA-Z][\w]*)\((.*)\)$/s);
  if (!fn) return getValue(context, text) ?? "";
  const name = fn[1].toLowerCase();
  const args = splitArguments(fn[2]);
  if (name === "now") return new Date().toISOString();
  const value = args.length ? literalOrExpression(args[0], context) : "";
  if (name === "uppercase") return String(value ?? "").toUpperCase();
  if (name === "lowercase") return String(value ?? "").toLowerCase();
  if (name === "trim") return String(value ?? "").trim();
  if (name === "truncate") {
    const max = Math.max(
      0,
      Math.floor(Number(literalOrExpression(args[1] || "0", context)) || 0),
    );
    return max ? String(value ?? "").slice(0, max) : "";
  }
  if (name === "default")
    return value === "" || value == null
      ? literalOrExpression(args[1] || "''", context)
      : value;
  if (name === "date") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const yyyy = d.getFullYear(),
      mm = String(d.getMonth() + 1).padStart(2, "0"),
      dd = String(d.getDate()).padStart(2, "0");
    const format = String(
      literalOrExpression(args[1] || "'yyyy-MM-dd'", context),
    );
    return format.replace("yyyy", yyyy).replace("MM", mm).replace("dd", dd);
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

async function loadAuthProfile(profileId, query, options = {}) {
  const r = await query(
    "SELECT * FROM authentication_profiles WHERE id=$1 AND active=TRUE AND deleted_at IS NULL",
    [profileId],
  );
  const profile = r.rows[0];
  if (!profile) throw new Error("Authentication profile is unavailable.");
  if (
    profile.organization_id &&
    options.organizationId &&
    String(profile.organization_id) !== String(options.organizationId)
  ) {
    throw Object.assign(
      new Error(
        "Authentication profile is not available for this organization.",
      ),
      { status: 403 },
    );
  }
  return profile;
}
async function applyAuthProfile(action, query, options = {}) {
  if (!action?.authProfileId)
    return { ...action, headers: { ...(action?.headers || {}) } };
  const p = await loadAuthProfile(action.authProfileId, query, options);
  const headers = { ...(action.headers || {}) };
  const secret = decryptSecret(p.secret_value);
  if (p.auth_type === "apiKey") headers[p.header_name || "apikey"] = secret;
  else if (p.auth_type === "bearer") headers.Authorization = `Bearer ${secret}`;
  else if (p.auth_type === "managedBearer")
    headers.Authorization = `Bearer ${await getManagedToken(p, query, options)}`;
  else if (p.auth_type === "basic")
    headers.Authorization = `Basic ${Buffer.from(`${p.username || ""}:${secret}`).toString("base64")}`;
  else if (p.auth_type === "customHeader")
    headers[p.header_name || "Authorization"] = secret;
  return {
    ...action,
    headers,
    __authProfileType: p.auth_type,
    __authOrganizationId: options.organizationId || p.organization_id || null,
  };
}
async function refreshManagedAuth(action, query, options = {}) {
  if (!action?.authProfileId) return action;
  const p = await loadAuthProfile(action.authProfileId, query, options);
  if (p.auth_type !== "managedBearer") return action;
  const organizationId = options.organizationId || p.organization_id || null;
  await invalidateManagedToken(p.id, query, organizationId);
  const headers = { ...(action.headers || {}) };
  headers.Authorization = `Bearer ${await getManagedToken(p, query, { ...options, organizationId, forceRefresh: true })}`;
  return {
    ...action,
    headers,
    __authProfileType: p.auth_type,
    __authOrganizationId: organizationId,
  };
}

module.exports = {
  render,
  ruleMatches,
  fieldState,
  validateField,
  applyAuthProfile,
  refreshManagedAuth,
  ensureSystemTemplates,
};
