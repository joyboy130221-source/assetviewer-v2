const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) throw Object.assign(new Error("URL is required."), { status: 400 });
  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  throw Object.assign(
    new Error(
      "URL must be an http(s) URL or an application-relative URL starting with /.",
    ),
    { status: 400 },
  );
}

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "externalViews");
  if (!user) return;
  try {
    if (req.method === "GET") {
      const activeOnly =
        String(req.query.active || "").toLowerCase() === "true";
      const result = await query(
        `SELECT id,name,description,url,active,created_at,updated_at FROM external_views ${activeOnly ? "WHERE active=TRUE" : ""} ORDER BY name`,
      );
      return res.json({ data: result.rows });
    }
    const body = req.body || {};
    if (req.method === "POST") {
      if (!String(body.name || "").trim())
        return res.status(400).json({ error: "Name is required." });
      await query(
        `INSERT INTO external_views(name,description,url,active) VALUES($1,$2,$3,$4)`,
        [
          body.name.trim(),
          body.description || "",
          normalizeUrl(body.url),
          body.active !== false,
        ],
      );
      return res.json({ message: "External view created successfully." });
    }
    if (req.method === "PUT") {
      if (!body.id) return res.status(400).json({ error: "id is required." });
      await query(
        `UPDATE external_views SET name=$1,description=$2,url=$3,active=$4,updated_at=NOW() WHERE id=$5`,
        [
          body.name.trim(),
          body.description || "",
          normalizeUrl(body.url),
          body.active !== false,
          body.id,
        ],
      );
      return res.json({ message: "External view updated successfully." });
    }
    if (req.method === "DELETE") {
      await query("DELETE FROM external_views WHERE id=$1", [body.id]);
      return res.json({ message: "External view deleted successfully." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(error.code === "23505" ? 409 : error.status || 500).json({
      error:
        error.code === "23505"
          ? "External view name already exists."
          : error.message,
    });
  }
};
