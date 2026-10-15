import type {
  AnalyticsPageDefinition,
  ItemSelectorConfig,
  ParameterSource,
  PageRule,
  RuleOperator,
  UnmatchedBehavior,
} from "./analyticsPage.types";
import { createId } from "../../../shared/workflow/createId";

/** Option lists shown in the editor (values match the server contract). */
export const RULE_OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "contains", label: "contains" },
];
export const PARAMETER_SOURCES: { value: ParameterSource; label: string }[] = [
  { value: "itemValue", label: "Selected item value" },
  { value: "itemLabel", label: "Selected item label" },
  { value: "fixed", label: "Fixed value" },
];
export const UNMATCHED_BEHAVIORS: {
  value: UnmatchedBehavior;
  label: string;
}[] = [
  { value: "message", label: "Show the item with a “not configured” message" },
  { value: "hide", label: "Hide the item from the dropdown" },
  { value: "default", label: "Open the default chart" },
];

/** Same defaults as the server's normalization (dropdown off). */
export const DEFAULT_SELECTOR: ItemSelectorConfig = {
  enabled: false,
  label: "Select",
  source: "static",
  staticItems: [],
  api: {
    dataSource: {
      type: "rest",
      action: { method: "GET", url: "", headers: {}, params: [] },
      arrayPath: "",
    },
    labelField: "",
    valueField: "",
  },
  defaultValue: "",
  rememberInLink: true,
  unmatched: "message",
  searchThreshold: 10,
};

/** Fills sections missing on pages saved by older clients. */
export function withPageDefaults(
  page: Partial<AnalyticsPageDefinition>,
): AnalyticsPageDefinition {
  return {
    id: "",
    organizationId: "",
    name: "",
    description: "",
    status: "draft",
    theme: "auto",
    title: "",
    parameters: [],
    rules: [],
    createdAt: "",
    updatedAt: "",
    ...page,
    defaultChart: {
      analyticsId: page.defaultChart?.analyticsId ?? "",
      parameters: page.defaultChart?.parameters ?? [],
    },
    selector: {
      ...DEFAULT_SELECTOR,
      ...(page.selector ?? {}),
      api: {
        ...DEFAULT_SELECTOR.api,
        ...(page.selector?.api ?? {}),
        dataSource: {
          ...DEFAULT_SELECTOR.api.dataSource,
          ...(page.selector?.api?.dataSource ?? {}),
        },
      },
    },
  };
}

export const blankPage = (organizationId = ""): AnalyticsPageDefinition =>
  withPageDefaults({ organizationId });

export const newRule = (): PageRule => ({
  id: createId(),
  match: { field: "label", operator: "equals", text: "", ignoreCase: true },
  analyticsId: "",
  parameters: [],
});
