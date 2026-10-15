const { requireAuth } = require("../../lib/auth");
const {
  normalizePageBody,
} = require("../../services/analytics-page-definition");
const {
  pageContext,
  listItems,
  resolveTarget,
  loadAnalytic,
  executeTarget,
} = require("../../services/analytics-page-service");
const { publicView } = require("../../services/analytics-definition");

const SOURCE_ERRORS = [
  "SOURCE_TIMEOUT",
  "SOURCE_UNREACHABLE",
  "ITEMS_SOURCE_ERROR",
];

/**
 * Builder preview of an (unsaved) page. Actions:
 * - items:   the dropdown items with the rule each one matches
 * - resolve: the analytic the selected item opens
 * - execute: run that analytic
 * Draft analytics of the page's organization may be previewed.
 */
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "analyticsBuilder");
  if (!user) return;
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const b = req.body || {};
    const page = {
      ...normalizePageBody(b.page),
      organizationId: String(b.page?.organizationId || ""),
    };
    if (!page.organizationId)
      return res.status(400).json({ error: "Choose an organization first." });
    const context = pageContext(page, b.context || {});
    const options = {
      requirePublished: false,
      detailedErrors: true,
      fresh: b.fresh === true,
    };
    if (b.action === "items") {
      if (!page.selector.enabled) return res.json({ data: { items: [] } });
      return res.json({ data: await listItems(page, context, options) });
    }
    if (b.action === "resolve") {
      const target = await resolveTarget(page, context, b.item || "", options);
      const chart = target.route
        ? publicView(
            await loadAnalytic(page, target.route.analyticsId, options),
          )
        : null;
      return res.json({ data: { ...target, chart } });
    }
    if (b.action === "execute")
      return res.json({
        data: await executeTarget(
          page,
          context,
          b.item || "",
          b.runtime || {},
          options,
        ),
      });
    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    if (SOURCE_ERRORS.includes(e.code))
      console.warn(`Analytics page source error: ${e.message}`);
    else if ((e.status || 500) >= 500)
      console.error("Analytics page preview error", e);
    return res.status(e.status || 500).json({
      error: e.message,
      ...(e.code ? { code: e.code } : {}),
    });
  }
};
