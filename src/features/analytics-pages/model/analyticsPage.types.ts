import type {
  AnalyticsDefinition,
  AnalyticsTheme,
} from "../../analytics/model/analytics.types";

/** Same REST source shape as an analytic's data source. */
export type RestDataSource = AnalyticsDefinition["dataSource"];

export type PageItem = { label: string; value: string };
export type ItemSource = "static" | "api";
export type RuleField = "label" | "value";
export type RuleOperator = "equals" | "startsWith" | "contains";
export type ParameterSource = "itemValue" | "itemLabel" | "fixed";
/** What happens to an item no rule matches. */
export type UnmatchedBehavior = "message" | "hide" | "default";

/** One {{parameter}} a chart receives. */
export type ParameterMapping = {
  name: string;
  source: ParameterSource;
  /** Used when source is "fixed". */
  value: string;
};

export type PageRule = {
  id: string;
  match: {
    field: RuleField;
    operator: RuleOperator;
    text: string;
    ignoreCase: boolean;
  };
  analyticsId: string;
  parameters: ParameterMapping[];
};

export type ItemSelectorConfig = {
  /** Off: the page always shows the default chart and calls no item API. */
  enabled: boolean;
  label: string;
  source: ItemSource;
  staticItems: PageItem[];
  api: { dataSource: RestDataSource; labelField: string; valueField: string };
  defaultValue: string;
  /** Keep the selection in the link (`?_item=…`) so it can be shared. */
  rememberInLink: boolean;
  unmatched: UnmatchedBehavior;
  /** Show a search box above this many items (0 = always). */
  searchThreshold: number;
};

export type AnalyticsPageDefinition = {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  description: string;
  status: "draft" | "published";
  theme: AnalyticsTheme;
  title: string;
  /** Host-link parameters the page accepts and passes to its charts. */
  parameters: string[];
  defaultChart: { analyticsId: string; parameters: ParameterMapping[] };
  selector: ItemSelectorConfig;
  rules: PageRule[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};

/** Where an item leads (builder preview only; never sent to viewers). */
export type PageRoute = {
  ruleId: string | null;
  analyticsId: string;
  parameters: Record<string, string>;
};
export type PreviewItem = PageItem & { route: PageRoute | null };
export type PreviewItems = {
  items: PreviewItem[];
  truncated?: boolean;
  cached?: boolean;
  durationMs?: number;
  recordsPath?: string;
  fields?: string[];
};

/** A dropdown item as viewers see it. */
export type ViewerItem = PageItem & { available: boolean };
export type ViewerError = { error: string; code?: string };

type EnabledSelectorView = {
  enabled: true;
  label: string;
  rememberInLink: boolean;
  searchThreshold: number;
  defaultValue: string;
  items: ViewerItem[];
  truncated?: boolean;
  /** The item API failed; the viewer can retry. */
  error?: ViewerError;
};
export type SelectorView = { enabled: false } | EnabledSelectorView;

/** What a viewer receives for a published page. */
export type PublicAnalyticsPage = {
  id: string;
  name: string;
  description: string;
  title: string;
  theme: AnalyticsTheme;
  selector: SelectorView;
};

/** The chart an item opens. */
export type PageTarget = {
  item: PageItem | null;
  chart: AnalyticsDefinition | null;
  /** Why there is no chart (no rule matched, nothing configured…). */
  message?: string;
};

export type PageLimits = {
  maxItems: number;
  maxRules: number;
  maxParameters: number;
};
