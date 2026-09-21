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
        `SELECT ev.id,ev.name,ev.description,ev.url,ev.active,ev.organization_id,
                o.name AS organization_name,o.code AS organization_code
           FROM external_views ev LEFT JOIN organizations o ON o.id=ev.organization_id
          WHERE ev.active=TRUE AND ev.deleted_at IS NULL AND (o.id IS NULL OR o.deleted_at IS NULL) ORDER BY ev.name`,
      ),
      query(
        "SELECT id,env_name,description,active FROM maximo_environments WHERE active=TRUE AND deleted_at IS NULL ORDER BY env_name",
      ),
    ]);
    return res.json({ views: views.rows, environments: environments.rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
