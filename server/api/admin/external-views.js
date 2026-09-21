const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "externalViews");
  if (!user) return;
  try {
    const body = req.body || {};
    if (req.method === "GET") {
      const activeOnly = String(req.query.active || "") === "true";
      const result = await query(
        `SELECT ev.id,ev.name,ev.description,ev.url,ev.active,ev.organization_id,
                o.name AS organization_name,o.code AS organization_code,ev.created_at,ev.updated_at
           FROM external_views ev
           LEFT JOIN organizations o ON o.id=ev.organization_id
          ${activeOnly ? "WHERE ev.active=TRUE" : ""}
          ORDER BY ev.name`,
      );
      return res.json({ data: result.rows });
    }
    if (req.method === "POST") {
      if (!body.name?.trim() || !body.url?.trim())
        return res.status(400).json({ error: "Name and URL are required." });
      await query(
        `INSERT INTO external_views(name,description,url,active,organization_id) VALUES($1,$2,$3,$4,$5::uuid)`,
        [
          body.name.trim(),
          body.description || "",
          body.url.trim(),
          body.active !== false,
          body.organizationId || null,
        ],
      );
      return res.json({ message: "External view created." });
    }
    if (req.method === "PUT") {
      await query(
        `UPDATE external_views SET name=$1,description=$2,url=$3,active=$4,organization_id=$5::uuid,updated_at=NOW() WHERE id=$6`,
        [
          body.name?.trim(),
          body.description || "",
          body.url?.trim(),
          body.active !== false,
          body.organizationId || null,
          body.id,
        ],
      );
      return res.json({ message: "External view updated." });
    }
    if (req.method === "DELETE") {
      await query("DELETE FROM external_views WHERE id=$1", [body.id]);
      return res.json({ message: "External view deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("External views API error:", error);
    return res.status(500).json({ error: error.message });
  }
};
