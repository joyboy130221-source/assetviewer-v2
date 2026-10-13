/**
 * Vercel adapter (optional).
 *
 * vercel.json rewrites /api/* to `/api?route=<path>` and client-side pages to
 * `/api?route=__spa&spaPath=<path>`. This file only translates that into the
 * host-neutral pipeline used by every deployment; it contains no routing or
 * security logic of its own. Remove it (and vercel.json) when not hosting on
 * Vercel — nothing else depends on it.
 */
const { handleApiRequest } = require("../server/http/pipeline");
const { normalizeRoute } = require("../server/http/route-table");
const { serveSpaShell } = require("../server/http/spa-shell");

const SPA_ROUTE = "__spa";

module.exports = async function handler(req, res) {
  const route = normalizeRoute(req.query && req.query.route);
  // Internal routing metadata must not leak into endpoint logic.
  if (req.query) delete req.query.route;

  if (route === SPA_ROUTE) {
    const pagePath = req.query?.spaPath || "";
    if (req.query) delete req.query.spaPath;
    return serveSpaShell(String(pagePath), req, res);
  }
  return handleApiRequest(route, req, res);
};
