const crypto = require("crypto");
const { requireAuth } = require("../../lib/auth");
const repo = require("../../repositories/analytics-repository");
const defaults = {
  dataSource: {
    type: "rest",
    action: { method: "GET", url: "", headers: {}, params: {} },
    arrayPath: "",
  },
  queryParams: [],
  filterMode: "bib",
  filters: [],
  dimension: "",
  measure: "",
  aggregation: "count",
  visualization: {
    type: "bar",
    title: "",
    showLegend: true,
    showLabels: true,
    appearance: {
      colorMode: "palette",
      palette: "default",
      singleColor: "#2563eb",
      categoryColors: {},
    },
  },
};
const map = (r) => {
  const stored = r.definition || {};
  return {
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    name: r.name,
    description: r.description || "",
    status: r.status,
    ...defaults,
    ...stored,
    visualization: {
      ...defaults.visualization,
      ...(stored.visualization || {}),
      appearance: {
        ...defaults.visualization.appearance,
        ...(stored.visualization?.appearance || {}),
      },
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
};
function definition(b) {
  return {
    dataSource: b.dataSource || defaults.dataSource,
    queryParams: b.queryParams || [],
    filterMode: b.filterMode || "bib",
    filters: b.filters || [],
    dimension: b.dimension || "",
    measure: b.measure || "",
    aggregation: b.aggregation || "count",
    visualization: {
      ...defaults.visualization,
      ...(b.visualization || {}),
      appearance: {
        ...defaults.visualization.appearance,
        ...(b.visualization?.appearance || {}),
      },
    },
  };
}
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "analyticsBuilder");
  if (!user) return;
  try {
    const b = req.body || {},
      id = req.query.id;
    if (req.method === "GET") {
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
      await repo.remove(b.id);
      return res.json({ message: "Analytics definition deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Analytics API error", e);
    return res.status(e.status || 500).json({ error: e.message });
  }
};
