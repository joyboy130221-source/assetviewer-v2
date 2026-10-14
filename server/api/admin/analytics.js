const crypto = require("crypto");
const { requireAuth } = require("../../lib/auth");
const repo = require("../../repositories/analytics-repository");
const {
  mapDefinitionRow,
  normalizeDefinitionBody,
} = require("../../services/analytics-definition");
const { publicBuilderLimits } = require("../../config/analytics-limits");
const map = (r) => mapDefinitionRow(r);
const definition = (b) => normalizeDefinitionBody(b);
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "analyticsBuilder");
  if (!user) return;
  try {
    const b = req.body || {},
      id = req.query.id;
    if (req.method === "GET") {
      // Builder settings bounds (e.g. source timeout default and ceiling).
      if (req.query.limits) return res.json({ data: publicBuilderLimits() });
      const r = await repo.find(id);
      return res.json({
        data: id ? (r.rows[0] ? map(r.rows[0]) : null) : r.rows.map(map),
      });
    }
    if (req.method === "POST") {
      if (!b.organizationId || !b.name?.trim())
        return res
          .status(400)
          .json({ error: "Organization and name are required." });
      const newId = crypto.randomUUID();
      await repo.create({
        id: newId,
        organizationId: b.organizationId,
        name: b.name.trim(),
        description: b.description || "",
        status: "draft",
        definition: definition(b),
        createdBy: user.id,
      });
      return res.json({ id: newId });
    }
    if (req.method === "PUT") {
      if (!b.id || !b.organizationId || !b.name?.trim())
        return res
          .status(400)
          .json({ error: "ID, organization and name are required." });
      await repo.update({
        id: b.id,
        organizationId: b.organizationId,
        name: b.name.trim(),
        description: b.description || "",
        status: b.status === "published" ? "published" : "draft",
        definition: definition(b),
      });
      return res.json({ message: "Analytics definition saved." });
    }
    if (req.method === "DELETE") {
      await repo.remove(b.id, user.id);
      return res.json({ message: "Analytics definition deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Analytics API error", e);
    return res.status(e.status || 500).json({ error: e.message });
  }
};
