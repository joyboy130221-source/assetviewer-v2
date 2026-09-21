const { requireAuth } = require("../../lib/auth");
const { run } = require("../../services/analytics-service");
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "analyticsBuilder");
  if (!user) return;
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    return res.json({
      data: await run(req.body?.definition || {}, req.body?.context || {}),
    });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.message, details: e.details });
  }
};
