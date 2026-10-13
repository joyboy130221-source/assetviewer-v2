const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const {
  generateAccessKey,
  environmentsOf,
  invalidateAccessKeyCache,
} = require("../../security/external-access");

/** Appends the access key to the configured External View URL. */
function linkWithKey(url, key) {
  const value = String(url || "");
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}evk=${encodeURIComponent(key)}`;
}

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "externalViews");
  if (!user) return;
  try {
    const body = req.body || {};
    if (req.method === "GET") {
      const activeOnly = String(req.query.active || "") === "true";
      const result = await query(
        `SELECT ev.id,ev.name,ev.description,ev.url,ev.active,ev.organization_id,
                o.name AS organization_name,o.code AS organization_code,ev.created_at,ev.updated_at,
                (ev.access_key_hash IS NOT NULL) AS access_key_configured,
                ev.access_key_prefix,ev.access_key_created_at
           FROM external_views ev
           LEFT JOIN organizations o ON o.id=ev.organization_id AND o.deleted_at IS NULL
          ${activeOnly ? "WHERE ev.active=TRUE AND ev.deleted_at IS NULL" : "WHERE ev.deleted_at IS NULL"}
          ORDER BY ev.name`,
      );
      return res.json({
        data: result.rows.map((row) => ({
          ...row,
          access_key_environments: environmentsOf(row.url),
        })),
      });
    }
    const action = String(req.query?.action || "");
    if (req.method === "POST" && action === "generate-key") {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        return res.status(400).json({ error: "External view id is required." });
      const generated = generateAccessKey(id);
      const updated = await query(
        `UPDATE external_views SET access_key_hash=$2,access_key_prefix=$3,access_key_created_at=NOW(),
                access_key_created_by=$4,updated_at=NOW()
          WHERE id=$1 AND deleted_at IS NULL RETURNING url`,
        [id, generated.hash, generated.prefix, user.id],
      );
      if (!updated.rowCount)
        return res.status(404).json({ error: "External view not found." });
      invalidateAccessKeyCache();
      // The raw key is returned once and never stored.
      return res.json({
        message:
          "Access key generated. Copy the link now — it cannot be shown again. Any previous key is revoked.",
        accessKey: generated.key,
        link: linkWithKey(updated.rows[0].url, generated.key),
      });
    }
    if (req.method === "POST" && action === "revoke-key") {
      const updated = await query(
        `UPDATE external_views SET access_key_hash=NULL,access_key_prefix=NULL,access_key_created_at=NULL,
                access_key_created_by=NULL,updated_at=NOW()
          WHERE id=$1 AND deleted_at IS NULL`,
        [body.id],
      );
      if (!updated.rowCount)
        return res.status(404).json({ error: "External view not found." });
      invalidateAccessKeyCache();
      return res.json({ message: "Access key revoked." });
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
        `UPDATE external_views SET name=$1,description=$2,url=$3,active=$4,organization_id=$5::uuid,updated_at=NOW() WHERE id=$6 AND deleted_at IS NULL`,
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
      await query(
        "UPDATE external_views SET deleted_at=NOW(),deleted_by=$2,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
        [body.id, user.id],
      );
      return res.json({ message: "External view deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("External views API error:", error);
    return res
      .status(500)
      .json({ error: "Unable to process the external view request." });
  }
};
