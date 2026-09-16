/**
 * Single Vercel Serverless Function entry point.
 *
 * All public /api/* requests are rewritten here by vercel.json and then
 * dispatched to the existing route handlers. Keeping route implementations
 * outside /api prevents Vercel from creating one function per endpoint.
 */
const routes = Object.freeze({
  asset: require("../server/api/asset"),
  "work-order": require("../server/api/work-order"),
  "work-order-detail": require("../server/api/work-order-detail"),
  "work-order-update": require("../server/api/work-order-update"),
  worklogs: require("../server/api/worklogs"),
  "auth/login": require("../server/api/auth/login"),
  "auth/logout": require("../server/api/auth/logout"),
  "auth/me": require("../server/api/auth/me"),
  "admin/dashboard": require("../server/api/admin/dashboard"),
  "admin/environments": require("../server/api/admin/environments"),
  "admin/external-views": require("../server/api/admin/external-views"),
  "admin/roles": require("../server/api/admin/roles"),
  "admin/users": require("../server/api/admin/users"),
  "admin/api-logs": require("../server/api/admin/api-logs"),
});

function normalizeRoute(value) {
  const raw = Array.isArray(value) ? value.join("/") : String(value || "");
  return raw.replace(/^\/+|\/+$/g, "");
}

module.exports = async function handler(req, res) {
  const route = normalizeRoute(req.query && req.query.route);
  const routeHandler = routes[route];

  if (!routeHandler) {
    return res.status(404).json({
      error: "API endpoint not found.",
      route: route || "/",
    });
  }

  // The route parameter is internal routing metadata and should not leak into
  // endpoint logic. Preserve all original query-string parameters.
  delete req.query.route;
  return routeHandler(req, res);
};
