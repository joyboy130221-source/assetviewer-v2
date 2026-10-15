import type { AnalyticsPageDefinition } from "../model/analyticsPage.types";

export type PageIssue = { level: "error" | "warning"; message: string };

/**
 * Checks a page before publishing. Errors make the page unusable; warnings
 * are allowed but worth fixing. The server normalizes regardless, so this is
 * guidance for authors, not a security check.
 */
export function validatePage(
  page: AnalyticsPageDefinition,
  publishedAnalytics: ReadonlySet<string>,
): PageIssue[] {
  const issues: PageIssue[] = [];
  const draft = (id: string) => id && !publishedAnalytics.has(id);
  const { selector, defaultChart, rules } = page;

  if (!selector.enabled) {
    if (!defaultChart.analyticsId)
      issues.push({
        level: "error",
        message:
          "Choose a default chart: with the dropdown off, the page shows only that chart.",
      });
  } else {
    if (selector.source === "static" && !selector.staticItems.length)
      issues.push({
        level: "error",
        message: "Add at least one dropdown item.",
      });
    if (selector.source === "api") {
      if (!selector.api.dataSource.action.url)
        issues.push({ level: "error", message: "The item API needs a URL." });
      if (!selector.api.valueField)
        issues.push({
          level: "error",
          message: "The item API needs a Value field.",
        });
    }
    if (!rules.length && selector.unmatched !== "default")
      issues.push({
        level: "error",
        message:
          "Add a rule, or set “Items without a rule” to open the default chart.",
      });
    if (selector.unmatched === "default" && !defaultChart.analyticsId)
      issues.push({
        level: "error",
        message:
          "Items without a rule open the default chart, but no default chart is chosen.",
      });
    rules.forEach((rule, i) => {
      if (!rule.analyticsId)
        issues.push({ level: "error", message: `Rule ${i + 1} has no chart.` });
      if (!rule.match.text.trim())
        issues.push({
          level: "warning",
          message: `Rule ${i + 1} has no match text and never matches.`,
        });
    });
  }

  const targets = [
    defaultChart.analyticsId,
    ...rules.map((r) => r.analyticsId),
  ];
  if (targets.some(draft))
    issues.push({
      level: "warning",
      message:
        "Some charts are drafts: published pages only open published analytics.",
    });
  return issues;
}
