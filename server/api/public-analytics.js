const repo = require("../repositories/analytics-repository");
const { run } = require("../services/analytics-service");
const {
  mapDefinitionRow,
  publicView,
} = require("../services/analytics-definition");
const { splitPublicQuery } = require("../services/analytics-runtime");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET")
      return res.status(405).json({ error: "Method not allowed" });
    const r = (await repo.find(req.query.id)).rows[0];
    if (!r || r.status !== "published")
      return res.status(404).json({ error: "Published analytics not found." });
    const d = mapDefinitionRow(r, { includeOrganizationName: false });
    if (req.query.execute === "1") {
      const query = { ...req.query };
      delete query.id;
      delete query.execute;
      const { context, input } = splitPublicQuery(query);
      return res.json({ data: await run(d, context, input) });
    }
    return res.json({ data: publicView(d) });
  } catch (e) {
    const status = e.status || 500;
    if (e.code === "SOURCE_TIMEOUT" || e.code === "SOURCE_UNREACHABLE")
      console.warn(`Public analytics source error: ${e.message}`);
    else if (status >= 500) console.error("Public analytics error", e);
    // Source response bodies are not echoed to anonymous viewers; errors that
    // carry a vetted publicMessage (e.g. source timeout) show that instead.
    return res.status(status).json({
      error:
        status >= 500
          ? e.publicMessage || "Analytics could not be loaded."
          : e.message,
      ...(e.code ? { code: e.code } : {}),
    });
  }
};
