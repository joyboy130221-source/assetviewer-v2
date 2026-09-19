const crypto = require("crypto");
const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "organizations");
  if (!user) return;
  try {
    const b = req.body || {};
    if (req.method === "GET")
      return res.json({
        data: (await query(`SELECT * FROM organizations ORDER BY name`)).rows,
      });
    if (req.method === "POST") {
      if (!b.code?.trim() || !b.name?.trim())
        return res
          .status(400)
          .json({ error: "Organization code and name are required." });
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO organizations(id,code,name,description,active) VALUES($1,$2,$3,$4,$5)`,
        [
          id,
          b.code.trim().toUpperCase(),
          b.name.trim(),
          b.description || "",
          b.active !== false,
        ],
      );
      return res.json({ id, message: "Organization created." });
    }
    if (req.method === "PUT") {
      await query(
        `UPDATE organizations SET code=$1,name=$2,description=$3,active=$4,updated_at=NOW() WHERE id=$5`,
        [
          b.code.trim().toUpperCase(),
          b.name.trim(),
          b.description || "",
          b.active !== false,
          b.id,
        ],
      );
      return res.json({ message: "Organization updated." });
    }
    if (req.method === "DELETE") {
      await query(`DELETE FROM organizations WHERE id=$1`, [b.id]);
      return res.json({ message: "Organization deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res
      .status(
        e.code === "23505" ? 409 : e.code === "23503" ? 409 : e.status || 500,
      )
      .json({
        error:
          e.code === "23505"
            ? "Organization code already exists."
            : e.code === "23503"
              ? "Organization is already used by forms or submissions."
              : e.message,
      });
  }
};
