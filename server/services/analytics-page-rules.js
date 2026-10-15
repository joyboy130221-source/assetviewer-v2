/**
 * Routing for Analytics Pages: which analytic an item opens and which
 * {{parameters}} it receives. Pure functions, no I/O.
 *
 * Rules are checked top to bottom; the first match wins. An item no rule
 * matches follows the page's `unmatched` setting.
 */

/** @param {{label: string, value: string}} item */
function matchesRule(item, rule) {
  const { field, operator, text, ignoreCase } = rule.match;
  if (!rule.analyticsId || !text) return false;
  const norm = (s) => (ignoreCase ? String(s).toLowerCase() : String(s));
  const subject = norm(field === "value" ? item.value : item.label);
  const needle = norm(text);
  if (operator === "startsWith") return subject.startsWith(needle);
  if (operator === "contains") return subject.includes(needle);
  return subject === needle;
}

/** {{parameter}} values a mapping list produces for an item. */
function mappedParameters(mappings, item) {
  const values = {};
  for (const m of mappings) {
    if (m.source === "itemValue") values[m.name] = item?.value ?? "";
    else if (m.source === "itemLabel") values[m.name] = item?.label ?? "";
    else values[m.name] = m.value;
  }
  return values;
}

/**
 * @returns {{ ruleId: string|null, analyticsId: string,
 *   parameters: Record<string,string> } | null} null = no chart for this item
 */
function routeItem(page, item) {
  const rule = page.rules.find((r) => matchesRule(item, r));
  if (rule)
    return {
      ruleId: rule.id,
      analyticsId: rule.analyticsId,
      parameters: mappedParameters(rule.parameters, item),
    };
  if (page.selector.unmatched === "default" && page.defaultChart.analyticsId)
    return defaultRoute(page);
  return null;
}

/** The page's default chart (selector off, or as fallback). */
function defaultRoute(page) {
  if (!page.defaultChart.analyticsId) return null;
  return {
    ruleId: null,
    analyticsId: page.defaultChart.analyticsId,
    parameters: mappedParameters(page.defaultChart.parameters, null),
  };
}

module.exports = { matchesRule, mappedParameters, routeItem, defaultRoute };
