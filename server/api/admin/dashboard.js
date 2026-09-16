const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const [views, environments] = await Promise.all([
      query(
        "SELECT id,name,description,url,active FROM external_views WHERE active=TRUE ORDER BY name",
      ),
      query(
        "SELECT id,env_name,description,active FROM maximo_environments WHERE active=TRUE ORDER BY env_name",
      ),
    ]);
    return res.json({ views: views.rows, environments: environments.rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
