export type FieldType =
  "text" | "date" | "number" | "textarea" | "checkbox" | "radio" | "combobox";
export type FormStatus = "draft" | "published";
export type FormMode = "empty" | "integrated";
export type ApiAction = {
  enabled: boolean;
  method: "POST" | "PUT" | "PATCH" | "DELETE" | "GET";
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: Record<string, unknown>;
  authProfileId?: string;
};
export type IntegrationSource = ApiAction;
export type FormTheme = "current" | "sap" | "maximo";
export type BrowserAction = {
  action:
    | "openPage"
    | "click"
    | "fill"
    | "select"
    | "waitFor"
    | "delay"
    | "readText"
    | "readAttribute"
    | "check"
    | "uncheck"
    | "uploadFile"
    | "downloadFile"
    | "screenshot"
    | "pressKey"
    | "hover"
    | "scrollIntoView"
    | "switchToLatestPage";
  url?: string;
  selector?: string;
  value?: string;
  timeoutMs?: number;
  match?: "single" | "first" | "last" | "nth";
  matchIndex?: number;
  frameSelector?: string;
  waitState?: "attached" | "detached" | "visible" | "hidden";
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  attributeName?: string;
  filePath?: string;
  fileName?: string;
  fullPage?: boolean;
  key?: string;
  delayMs?: number;
};
export type WorkflowStep = {
  id: string;
  key: string;
  name: string;
  type?: "api" | "browser";
  action?: ApiAction;
  browser?: BrowserAction;
};
export type WorkflowDefinition = {
  enabled: boolean;
  steps: WorkflowStep[];
};
export type FormField = {
  id: string;
  type: FieldType;
  name: string;
  label: string;
  placeholder?: string;
  required: boolean;
  readOnly?: boolean;
  defaultValue?: string;
  options?: string[];
  sourcePath?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
};
export type FormRule = {
  id: string;
  conditionMode: "AND" | "OR";
  conditions: {
    field: string;
    operator:
      | "equals"
      | "notEquals"
      | "contains"
      | "empty"
      | "notEmpty"
      | "greaterThan"
      | "lessThan";
    value?: string;
  }[];
  actions: {
    type: "show" | "hide" | "enable" | "disable" | "required" | "setValue";
    field: string;
    value?: string;
  }[];
};
export type ResponseAction = { type: "message" | "redirect"; value: string };
export type FormDefinition = {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  description: string;
  mode: FormMode;
  status: FormStatus;
  fields: FormField[];
  submitAction?: ApiAction | null;
  sourceAction?: IntegrationSource | null;
  queryParams?: string[];
  showSubmitButton?: boolean;
  submitButtonLabel?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  initialValues?: Record<string, unknown>;
  integrationError?: string | null;
  rules?: FormRule[];
  responseAction?: ResponseAction | null;
  theme?: FormTheme;
  workflow?: WorkflowDefinition | null;
};
export type ActionLog = {
  id: string;
  method: string;
  url: string;
  status?: number | null;
  success: boolean;
  durationMs?: number;
  error?: string | null;
  responseBody?: unknown;
  createdAt: string;
};
export type FormSubmission = {
  id: string;
  formId: string;
  organizationId: string;
  organizationName?: string;
  values: Record<string, unknown>;
  submittedAt: string;
  actionLogs?: ActionLog[];
};
export type Organization = {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};
