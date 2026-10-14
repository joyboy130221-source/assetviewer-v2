const { requireAuth } = require("../../lib/auth");
const { run } = require("../../services/analytics-service");
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "analyticsBuilder");
  if (!user) return;
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    return res.json({
      data: await run(
        req.body?.definition || {},
        req.body?.context || {},
        req.body?.runtime || {},
        // Authors see the source's own error message on a failed measure.
        { detailedErrors: true },
      ),
    });
  } catch (e) {
    if (e.code === "SOURCE_TIMEOUT" || e.code === "SOURCE_UNREACHABLE")
      console.warn(`Analytics source error: ${e.message}`);
    else if ((e.status || 500) >= 500)
      console.error("Analytics execute error", e);
    return res.status(e.status || 500).json({
      error: e.message,
      details: e.details,
      ...(e.code ? { code: e.code } : {}),
    });
  }
};
