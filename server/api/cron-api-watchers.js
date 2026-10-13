const { runDue } = require("../services/api-watcher-service");
module.exports = async (req, res) => {
  const configured = process.env.CRON_SECRET;
  if (!configured)
    return res.status(503).json({ error: "CRON_SECRET is not configured." });
  const auth = String(req.headers.authorization || "");
  if (auth !== `Bearer ${configured}`)
    return res.status(401).json({ error: "Unauthorized." });
  try {
    return res.json({ data: await runDue(20) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
