const repo = require("../repositories/analytics-page-repository");
const { mapPageRow } = require("../services/analytics-page-definition");
const {
  pageContext,
  listItems,
  resolveTarget,
  loadAnalytic,
  executeTarget,
} = require("../services/analytics-page-service");
const { publicView } = require("../services/analytics-definition");
const { splitPublicQuery } = require("../services/analytics-runtime");

/** Query keys owned by the page itself (never template parameters). */
const PAGE_KEYS = ["id", "resolve", "execute", "_item"];
const SOURCE_ERRORS = [
  "SOURCE_TIMEOUT",
  "SOURCE_UNREACHABLE",
  "ITEMS_SOURCE_ERROR",
];

/** Safe message for anonymous viewers: no URLs or source details. */
function publicError(e) {
  const status = e.status || 500;
  return {
    status,
    body: {
      error:
        status >= 500
          ? e.publicMessage || "The page could not be loaded."
          : e.message,
      ...(e.code ? { code: e.code } : {}),
    },
  };
}

/**
 * What a viewer needs: title, theme and the dropdown items. The item API
 * request, rules and target analytics stay server-side. A failing item API
 * does not fail the page: the selector reports the error so the viewer can
 * retry.
 */
async function pageView(page, context, fresh) {
  const view = {
    id: page.id,
    name: page.name,
    description: page.description,
    title: page.title,
    theme: page.theme,
    selector: { enabled: false },
  };
  if (!page.selector.enabled) return view;
  const selector = {
    enabled: true,
    label: page.selector.label,
    rememberInLink: page.selector.rememberInLink,
    searchThreshold: page.selector.searchThreshold,
    defaultValue: page.selector.defaultValue,
    items: [],
  };
  try {
    const list = await listItems(page, context, { fresh });
    selector.items = list.items.map(({ label, value, route }) => ({
      label,
      value,
      available: !!route,
    }));
    selector.truncated = list.truncated;
  } catch (e) {
    if (SOURCE_ERRORS.includes(e.code))
      console.warn(`Public analytics page items error: ${e.message}`);
    else console.error("Public analytics page items error", e);
    selector.error = publicError(e).body;
  }
  return { ...view, selector };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET")
      return res.status(405).json({ error: "Method not allowed" });
    const row = (await repo.find(req.query.id)).rows[0];
    if (!row || row.status !== "published")
      return res.status(404).json({ error: "Published page not found." });
    const page = mapPageRow(row, { includeOrganizationName: false });

    const query = { ...req.query };
    for (const key of PAGE_KEYS) delete query[key];
    const { context: raw, input } = splitPublicQuery(query);
    const context = pageContext(page, raw);
    const item = String(req.query._item || "");
    const options = { requirePublished: true, fresh: input.fresh === true };

    if (req.query.execute === "1")
      return res.json({
        data: await executeTarget(page, context, item, input, options),
      });
    if (req.query.resolve === "1") {
      const target = await resolveTarget(page, context, item, options);
      const chart = target.route
        ? publicView(
            await loadAnalytic(page, target.route.analyticsId, options),
          )
        : null;
      // Rule ids and parameter values stay server-side.
      return res.json({
        data: { item: target.item, chart, message: target.message },
      });
    }
    return res.json({ data: await pageView(page, context, options.fresh) });
  } catch (e) {
    if (SOURCE_ERRORS.includes(e.code))
      console.warn(`Public analytics page source error: ${e.message}`);
    else if ((e.status || 500) >= 500)
      console.error("Public analytics page error", e);
    const { status, body } = publicError(e);
    return res.status(status).json(body);
  }
};
