/**
 * Analytics Page runtime: lists dropdown items, resolves which analytic the
 * selected item opens, and executes it.
 *
 * Guarantees:
 * - Only parameters the page declares are taken from the host link; values a
 *   rule maps from the selected item always win over them, so a viewer cannot
 *   replace e.g. {{TabName}} through the URL.
 * - A selected item must exist in the item list the server resolved itself.
 * - A page only opens analytics of its own organization (published ones on
 *   public pages).
 */
const analyticsRepo = require("../repositories/analytics-repository");
const { mapDefinitionRow } = require("./analytics-definition");
const { run } = require("./analytics-service");
const { resolveItems } = require("./analytics-page-items");
const { routeItem, defaultRoute } = require("./analytics-page-rules");

const fail = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

/** The declared host parameters from a query/context object. */
function pageContext(page, values = {}) {
  const context = {};
  for (const name of page.parameters)
    if (values[name] != null && values[name] !== "")
      context[name] = String(values[name]);
  return context;
}

/**
 * Items as shown in the dropdown, with their route. Unmatched items are
 * dropped when the page is set to hide them.
 * @returns {Promise<{ items: {label: string, value: string,
 *   route: object|null}[], truncated: boolean, cached: boolean,
 *   durationMs: number, recordsPath?: string, fields?: string[] }>}
 */
async function listItems(page, context, options = {}) {
  const resolved = await resolveItems(page, context, options);
  const items = resolved.items
    .map((item) => ({ ...item, route: routeItem(page, item) }))
    .filter((item) => item.route || page.selector.unmatched !== "hide");
  return { ...resolved, items };
}

/** The item a page opens with: requested, else default, else the first. */
function chooseItem(items, requested, defaultValue) {
  if (requested) {
    const found = items.find((i) => i.value === requested);
    if (!found)
      throw fail(400, "The selected item is not available.", {
        code: "ITEM_NOT_AVAILABLE",
      });
    return found;
  }
  return items.find((i) => i.value === defaultValue) ?? items[0] ?? null;
}

/**
 * Which analytic the page shows and with which {{parameters}}.
 * @returns {Promise<{ item: {label: string, value: string}|null,
 *   route: {ruleId: string|null, analyticsId: string,
 *   parameters: Record<string,string>}|null, message?: string }>}
 */
async function resolveTarget(page, context, requestedItem, options = {}) {
  if (!page.selector.enabled) {
    const route = defaultRoute(page);
    return route
      ? { item: null, route }
      : {
          item: null,
          route: null,
          message: "This page has no chart configured yet.",
        };
  }
  const { items } = await listItems(page, context, options);
  if (!items.length)
    return { item: null, route: null, message: "There are no items to show." };
  const chosen = chooseItem(items, requestedItem, page.selector.defaultValue);
  const item = { label: chosen.label, value: chosen.value };
  return chosen.route
    ? { item, route: chosen.route }
    : {
        item,
        route: null,
        message: "No chart is configured for this item yet.",
      };
}

/** An analytic the page may open: same organization; published if required. */
async function loadAnalytic(page, analyticsId, { requirePublished }) {
  const row = (await analyticsRepo.find(analyticsId)).rows[0];
  const analytic =
    row && mapDefinitionRow(row, { includeOrganizationName: false });
  if (
    !analytic ||
    analytic.organizationId !== page.organizationId ||
    (requirePublished && analytic.status !== "published")
  )
    throw fail(404, "The chart for this item is not available.", {
      code: "CHART_NOT_AVAILABLE",
    });
  return analytic;
}

/** {{parameter}} values for the chart: host parameters, then route values. */
const chartContext = (context, route) => ({ ...context, ...route.parameters });

/**
 * Runs the analytic the selected item opens.
 * @param {object} options { requirePublished, detailedErrors, fresh }
 */
async function executeTarget(
  page,
  context,
  requestedItem,
  runtimeInput,
  options,
) {
  const target = await resolveTarget(page, context, requestedItem, options);
  if (!target.route) throw fail(404, target.message, { code: "NO_CHART" });
  const analytic = await loadAnalytic(page, target.route.analyticsId, options);
  return run(analytic, chartContext(context, target.route), runtimeInput, {
    detailedErrors: !!options.detailedErrors,
  });
}

module.exports = {
  pageContext,
  listItems,
  resolveTarget,
  loadAnalytic,
  executeTarget,
};
