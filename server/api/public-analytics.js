const repo = require("../repositories/analytics-repository");
const { run } = require("../services/analytics-service");
const defaultAppearance = {
  colorMode: "palette",
  palette: "default",
  singleColor: "#2563eb",
  categoryColors: {},
};
const map = (r) => {
  const stored = r.definition || {};
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    description: r.description || "",
    status: r.status,
    ...stored,
    visualization: {
      type: "bar",
      title: "",
      showLegend: true,
      showLabels: true,
      ...(stored.visualization || {}),
      appearance: {
        ...defaultAppearance,
        ...(stored.visualization?.appearance || {}),
      },
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
};
module.exports = async (req, res) => {
  try {
    if (req.method !== "GET")
      return res.status(405).json({ error: "Method not allowed" });
    const r = (await repo.find(req.query.id)).rows[0];
    if (!r || r.status !== "published")
      return res.status(404).json({ error: "Published analytics not found." });
    const d = map(r);
    const context = { ...req.query };
    delete context.id;
    delete context.execute;
    if (req.query.execute === "1")
      return res.json({ data: await run(d, context) });
    return res.json({ data: d });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.message, details: e.details });
  }
};
