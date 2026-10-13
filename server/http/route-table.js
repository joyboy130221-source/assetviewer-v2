/**
 * Single source of truth for API routes and their security policy.
 *
 * Used by every host adapter (Express in server/app.js, the Vercel function
 * in api/index.js), so routes and protections can never drift apart again.
 *
 * group:
 *   auth     - credential checks: login, change password (rate limit: auth, strict)
 *   admin    - administration API, session-based  (rate limit: admin)
 *   public   - anonymous published forms/analytics (rate limit: public)
 *   external - Maximo External View APIs          (rate limit: external + EXTERNAL_API_AUTH_MODE)
 *   system   - cron / health                       (no rate limit; own secret)
 */

/** @typedef {"auth"|"admin"|"public"|"external"|"system"} RouteGroup */
/** @typedef {{ group: RouteGroup, load: () => Function }} RouteDefinition */

const r = (group, path) => ({ group, load: () => require(path) });

/** @type {Readonly<Record<string, RouteDefinition>>} */
const ROUTES = Object.freeze({
  // External Views (embedded Maximo pages)
  asset: r("external", "../api/asset"),
  "work-order": r("external", "../api/work-order"),
  "work-order-detail": r("external", "../api/work-order-detail"),
  "work-order-update": r("external", "../api/work-order-update"),
  worklogs: r("external", "../api/worklogs"),
  // Authentication
  "auth/login": r("auth", "../api/auth/login"),
  // Session reads happen on every admin page load: normal admin limits.
  "auth/logout": r("admin", "../api/auth/logout"),
  "auth/me": r("admin", "../api/auth/me"),
  "auth/change-password": r("auth", "../api/auth/change-password"),
  // Administration
  "admin/dashboard": r("admin", "../api/admin/dashboard"),
  "admin/environments": r("admin", "../api/admin/environments"),
  "admin/external-views": r("admin", "../api/admin/external-views"),
  "admin/roles": r("admin", "../api/admin/roles"),
  "admin/authentication-profiles": r(
    "admin",
    "../api/admin/authentication-profiles",
  ),
  "admin/users": r("admin", "../api/admin/users"),
  "admin/api-logs": r("admin", "../api/admin/api-logs"),
  "admin/workflow-executions": r("admin", "../api/admin/workflow-executions"),
  "admin/message-bus": r("admin", "../api/admin/message-bus"),
  "admin/message-bus-logs": r("admin", "../api/admin/message-bus-logs"),
  "admin/organizations": r("admin", "../api/admin/organizations"),
  "admin/forms": r("admin", "../api/admin/forms"),
  "admin/analytics": r("admin", "../api/admin/analytics"),
  "admin/analytics-execute": r("admin", "../api/admin/analytics-execute"),
  "admin/api-watchers": r("admin", "../api/admin/api-watchers"),
  "admin/form-packages": r("admin", "../api/admin/form-packages"),
  "admin/form-integration-test": r(
    "admin",
    "../api/admin/form-integration-test",
  ),
  "admin/form-submissions": r("admin", "../api/admin/form-submissions"),
  // Anonymous published content
  "public-forms": r("public", "../api/public-forms"),
  "public-analytics": r("public", "../api/public-analytics"),
  // System
  "cron/api-watchers": r("system", "../api/cron-api-watchers"),
  health: r("system", "../api/system/health"),
  "db-health": r("system", "../api/system/db-health"),
});

const handlers = new Map();

/** Normalizes "/admin/users/" or ["admin","users"] to "admin/users". */
function normalizeRoute(value) {
  const raw = Array.isArray(value) ? value.join("/") : String(value || "");
  return raw.replace(/^\/+|\/+$/g, "");
}

/** @returns {{ name: string, group: RouteGroup, handler: Function } | null} */
function resolveRoute(name) {
  const key = normalizeRoute(name);
  if (!Object.prototype.hasOwnProperty.call(ROUTES, key)) return null;
  if (!handlers.has(key)) handlers.set(key, ROUTES[key].load());
  return { name: key, group: ROUTES[key].group, handler: handlers.get(key) };
}

module.exports = { ROUTES, resolveRoute, normalizeRoute };
