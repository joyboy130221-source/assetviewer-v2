export type AnalyticsStatus = "draft" | "published";
export type VisualizationType = "kpi" | "bar" | "line" | "pie" | "table";
export type AggregationType = "count" | "sum" | "avg" | "min" | "max";
export type FilterMode = "source" | "bib";
export type AnalyticsColorMode = "palette" | "single" | "category" | "custom";
export type AnalyticsPalette =
  "default" | "cool" | "warm" | "vivid" | "professional";
export type AnalyticsAppearance = {
  colorMode: AnalyticsColorMode;
  palette: AnalyticsPalette;
  singleColor: string;
  categoryColors: Record<string, string>;
};

export type AnalyticsApiAction = {
  method: "GET";
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  authProfileId?: string;
};
export type AnalyticsFilter = {
  id: string;
  field: string;
  operator: "equals" | "notEquals" | "contains" | "gt" | "gte" | "lt" | "lte";
  value: string;
};
export type AnalyticsDefinition = {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  description: string;
  status: AnalyticsStatus;
  dataSource: {
    type: "rest";
    action: AnalyticsApiAction;
    arrayPath: string;
  };
  queryParams: string[];
  filterMode: FilterMode;
  filters: AnalyticsFilter[];
  dimension: string;
  measure: string;
  aggregation: AggregationType;
  visualization: {
    type: VisualizationType;
    title: string;
    showLegend: boolean;
    showLabels: boolean;
    appearance?: AnalyticsAppearance;
  };
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};
export type AnalyticsRow = Record<string, unknown>;
export type AnalyticsRecordsPathCandidate = {
  path: string;
  count: number;
  fields: string[];
};
export type AnalyticsResult = {
  rows: AnalyticsRow[];
  rawCount: number;
  filteredCount: number;
  fields: string[];
  recordsPath: string;
  recordsPathCandidates: AnalyticsRecordsPathCandidate[];
};
export type Organization = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};
