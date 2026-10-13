const { requireAuth } = require("../../lib/auth");
const { query } = require("../../lib/db");
const { flatten } = require("../../lib/integration-http");
const { executeAuthenticated } = require("../../lib/authenticated-http");
const { render } = require("../../lib/form-engine");
const redact = (headers) =>
  Object.fromEntries(
    Object.entries(headers || {}).map(
      ([k, v]) =>
        [
          /authorization|api[-_]?key|token|secret|password/i.test(k)
            ? [k, "********"]
            : [k, v],
        ][0],
    ),
  );
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "formBuilder");
  if (!user) return;
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const context = req.body?.context || {};
    let action = render(req.body?.action || {}, context);
    if (!action.url)
      return res.status(400).json({ error: "Endpoint URL is required." });
    const started = Date.now();
    const executed = await executeAuthenticated(action, query, {
      organizationId: req.body?.organizationId || context.organizationId,
    });
    action = executed.action;
    const result = executed.response;
    const durationMs = Date.now() - started;
    const debug = {
      method: (action.method || "GET").toUpperCase(),
      url: action.url,
      headers: redact(action.headers),
      params: action.params || {},
      body: action.body || {},
      context,
      durationMs,
      status: result.status,
    };
    if (!result.ok)
      return res.status(400).json({
        error: `API returned HTTP ${result.status}`,
        response: result.data,
        debug,
      });
    return res.json({
      response: result.data,
      fields: [...new Set(flatten(result.data))].slice(0, 500),
      debug,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
