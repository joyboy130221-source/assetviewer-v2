const { query, encryptSecret } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "authenticationProfiles");
  if (!user) return;
  try {
    if (req.method === "GET") {
      const r = await query(
        "SELECT id,name,description,auth_type,header_name,username,active,created_at,updated_at FROM authentication_profiles WHERE deleted_at IS NULL ORDER BY name",
      );
      return res.json({ data: r.rows });
    }
    const b = req.body || {};
    if (req.method === "POST") {
      if (!b.name || !b.secret)
        return res
          .status(400)
          .json({ error: "Name and credential are required." });
      await query(
        "INSERT INTO authentication_profiles(name,description,auth_type,header_name,username,secret_value,active) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          b.name.trim(),
          b.description || "",
          b.auth_type || "apiKey",
          b.header_name || "",
          b.username || "",
          encryptSecret(b.secret),
          b.active !== false,
        ],
      );
      return res.json({ message: "Authentication profile created." });
    }
    if (req.method === "PUT") {
      const params = [
        b.name.trim(),
        b.description || "",
        b.auth_type || "apiKey",
        b.header_name || "",
        b.username || "",
        b.active !== false,
        b.id,
      ];
      await query(
        "UPDATE authentication_profiles SET name=$1,description=$2,auth_type=$3,header_name=$4,username=$5,active=$6,updated_at=NOW() WHERE id=$7 AND deleted_at IS NULL",
        params,
      );
      if (b.secret)
        await query(
          "UPDATE authentication_profiles SET secret_value=$1,updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL",
          [encryptSecret(b.secret), b.id],
        );
      return res.json({ message: "Authentication profile updated." });
    }
    if (req.method === "DELETE") {
      await query(
        "UPDATE authentication_profiles SET deleted_at=NOW(),deleted_by=$2,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
        [b.id, user.id],
      );
      return res.json({ message: "Authentication profile deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(e.code === "23505" ? 409 : 500).json({
      error: e.code === "23505" ? "Profile name already exists." : e.message,
    });
  }
};
