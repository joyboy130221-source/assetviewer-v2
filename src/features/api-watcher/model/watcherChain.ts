import { createId } from "../../../shared/workflow/createId";
import {
  newBrowserAction,
  newMessageBusAction,
  stepOutputFields,
  type WorkflowStepType,
} from "../../../shared/workflow/workflowStep.types";
import type {
  ApiWatcherDefinition,
  EventAction,
  RestAction,
  WatcherStep,
} from "./apiWatcher.types";

export type EventKind = "NEW" | "MODIFIED";

export const newRestAction = (method = "GET"): RestAction => ({
  method,
  url: "",
  authProfileId: "",
  headers: {},
  params: [],
  body: {},
  bodyFormat: "json",
});

export const stepTypeOf = (step: WatcherStep): WorkflowStepType =>
  step.type === "browser" || step.type === "message" ? step.type : "api";

/** Creates a step with a key that is unique among `existingKeys`. */
export function newWatcherStep(
  existingKeys: ReadonlySet<string>,
  options: { prefix?: string; method?: string; type?: WorkflowStepType } = {},
): WatcherStep {
  const prefix = options.prefix || "step";
  let n = 1;
  while (existingKeys.has(`${prefix}${n}`)) n += 1;
  return withStepType(
    {
      id: createId(),
      key: `${prefix}${n}`,
      name: `Step ${n}`,
      enabled: true,
      type: "api",
      action: newRestAction(options.method || "GET"),
    },
    options.type || "api",
  );
}

/**
 * Switches a step's type. Configuration of the other types is kept so a user
 * can switch back without losing work; the runtime only reads the active one.
 */
export function withStepType(
  step: WatcherStep,
  type: WorkflowStepType,
): WatcherStep {
  return {
    ...step,
    type,
    action: step.action || (type === "api" ? newRestAction("GET") : undefined),
    browser:
      step.browser || (type === "browser" ? newBrowserAction() : undefined),
    message:
      step.message || (type === "message" ? newMessageBusAction() : undefined),
  };
}

/** Upgrades a legacy single-action event to an editable chain. */
export function toEditableEvent(
  event: EventAction | undefined,
  kind: EventKind,
): EventAction {
  const base: EventAction = event || { enabled: true };
  if (Array.isArray(base.steps)) return base;
  // An unconfigured legacy action (no URL) becomes an empty chain instead of
  // an invalid step, so existing watchers stay editable.
  if (!base.action?.url) return { ...base, steps: [] };
  const action = base.action;
  return {
    ...base,
    steps: [
      {
        id: createId(),
        // Same key the runtime used for the legacy action, so monitoring
        // history keeps the same step key after the upgrade.
        key: kind === "NEW" ? "new" : "modified",
        name: kind === "NEW" ? "Create target record" : "Update target record",
        enabled: true,
        type: "api",
        action,
      },
    ],
  };
}

/**
 * Persisted event shape: `steps` is authoritative; `action` mirrors the first
 * enabled API step so older readers keep working.
 */
export function toPersistedEvent(event: EventAction): EventAction {
  const steps = event.steps || [];
  const mirror = steps.find(
    (s) => s.enabled && stepTypeOf(s) === "api",
  )?.action;
  const { action: _legacy, ...rest } = event;
  return mirror ? { ...rest, steps, action: mirror } : { ...rest, steps };
}

export function toPersistedDefinition(
  d: ApiWatcherDefinition,
): ApiWatcherDefinition {
  return {
    ...d,
    enrichmentSteps: d.enrichmentSteps || [],
    events: {
      onNew: toPersistedEvent(d.events.onNew),
      onModified: toPersistedEvent(d.events.onModified),
    },
  };
}

/** Templates published by one step, based on its type. */
export function stepTemplates(step: WatcherStep): string[] {
  const type = stepTypeOf(step);
  if (type === "api")
    return [`{{steps.${step.key}}}`, `{{steps.${step.key}.id}}`];
  return stepOutputFields(type, step).map(
    (field) => `{{steps.${step.key}.${field}}}`,
  );
}

/** Templates of every step that runs before position `index` of `steps`. */
export function precedingTemplates(
  steps: WatcherStep[],
  index: number,
): string[] {
  return steps
    .slice(0, Math.max(index, 0))
    .filter((s) => s.key)
    .flatMap(stepTemplates);
}

/** Client-side mirror of the server chain validation, for fast feedback. */
export function chainProblem(
  label: string,
  steps: WatcherStep[],
  reserved: ReadonlySet<string> = new Set(),
): string | null {
  const seen = new Set(reserved);
  for (const step of steps) {
    const name = `${label} step '${step.name || step.key || "?"}'`;
    if (!step.key || !/^[a-zA-Z0-9_]+$/.test(step.key))
      return `${name} needs a key made of letters, numbers or underscore.`;
    if (seen.has(step.key))
      return `${label} step key '${step.key}' is already used. Step keys must be unique.`;
    seen.add(step.key);
    if (!step.enabled) continue;
    const type = stepTypeOf(step);
    if (type === "api" && !step.action?.url)
      return `${name} needs an Endpoint URL.`;
    if (
      type === "browser" &&
      step.browser?.action === "openPage" &&
      !step.browser.url
    )
      return `${name} (Open Page) needs a URL.`;
    if (type === "message" && !step.message?.connectionId)
      return `${name} needs a messaging connection.`;
    if (type === "message" && !step.message?.destination)
      return `${name} needs a destination.`;
  }
  return null;
}
