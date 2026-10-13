/**
 * Step models shared by every multi-step workflow designer
 * (Form Builder workflows and API Watcher chains).
 *
 * The runtime counterparts live in server/lib/browser-rpa.js and
 * server/lib/workflow/message-bus-step.js.
 */

export type WorkflowStepType = "api" | "browser" | "message";

export const WORKFLOW_STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  api: "API",
  browser: "Browser RPA",
  message: "Message Bus",
};

export type BrowserActionType =
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

export type BrowserAction = {
  action: BrowserActionType;
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

export type MessageBusOperation = "send" | "dlqCheck";
export type MessageFormat = "json" | "xml" | "text";

export type MessageBusAction = {
  operation?: MessageBusOperation;
  connectionId?: string;
  destinationType: "queue" | "topic";
  destination: string;
  body: string;
  messageFormat?: MessageFormat;
  contentType?: string;
  messageId?: string;
  correlationId?: string;
  applicationProperties?: string;
  subscription?: string;
  initialWaitSeconds?: number;
  checkIntervalSeconds?: number;
  monitoringWindowSeconds?: number;
};

/** Minimal, secret-free connection info used by step editors. */
export type MessageConnectionOption = { id: string; name: string };

/** Browser actions that operate on an element and need a selector. */
export const BROWSER_SELECTOR_ACTIONS: ReadonlySet<BrowserActionType> =
  new Set<BrowserActionType>([
    "click",
    "fill",
    "select",
    "waitFor",
    "readText",
    "readAttribute",
    "check",
    "uncheck",
    "uploadFile",
    "downloadFile",
    "hover",
    "scrollIntoView",
  ]);

export const BROWSER_ACTION_GROUPS: ReadonlyArray<{
  label: string;
  actions: ReadonlyArray<{ value: BrowserActionType; label: string }>;
}> = [
  {
    label: "Navigation",
    actions: [
      { value: "openPage", label: "Open Page" },
      { value: "switchToLatestPage", label: "Switch to Latest Tab / Window" },
    ],
  },
  {
    label: "Interaction",
    actions: [
      { value: "click", label: "Click" },
      { value: "fill", label: "Enter Text" },
      { value: "select", label: "Select Option" },
      { value: "check", label: "Check" },
      { value: "uncheck", label: "Uncheck" },
      { value: "pressKey", label: "Press Key" },
      { value: "hover", label: "Hover" },
      { value: "scrollIntoView", label: "Scroll Into View" },
    ],
  },
  {
    label: "Wait & Read",
    actions: [
      { value: "waitFor", label: "Wait for Element" },
      { value: "delay", label: "Delay" },
      { value: "readText", label: "Read Text" },
      { value: "readAttribute", label: "Read Attribute" },
    ],
  },
  {
    label: "Files & Diagnostics",
    actions: [
      { value: "uploadFile", label: "Upload File" },
      { value: "downloadFile", label: "Download File" },
      { value: "screenshot", label: "Screenshot" },
    ],
  },
];

export const newBrowserAction = (): BrowserAction => ({
  action: "openPage",
  timeoutMs: 15000,
});

export const newMessageBusAction = (): MessageBusAction => ({
  operation: "send",
  destinationType: "queue",
  destination: "",
  body: "{}",
  messageFormat: "json",
  contentType: "application/json",
});

/**
 * Output fields a step publishes to later steps, relative to the step result.
 * Used to build "Available Fields" for downstream steps.
 */
export function stepOutputFields(
  type: WorkflowStepType,
  step: { browser?: BrowserAction; message?: MessageBusAction },
): string[] {
  if (type === "browser") {
    const action = step.browser?.action;
    if (action === "openPage" || action === "switchToLatestPage")
      return ["value", "url", "title"];
    if (action === "downloadFile" || action === "screenshot")
      return ["value", "fileName", "artifactPath"];
    if (action === "readAttribute") return ["value", "attribute"];
    return ["value"];
  }
  if (type === "message")
    return step.message?.operation === "dlqCheck"
      ? ["status", "messageId", "checks", "deadLetterReason"]
      : ["messageId", "correlationId", "destination"];
  return [];
}
