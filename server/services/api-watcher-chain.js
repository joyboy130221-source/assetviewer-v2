/**
 * Pure (I/O free) model helpers for API Watcher step chains.
 *
 * A chain step is one of:
 *   { type: "api",     action:  RestAction }
 *   { type: "browser", browser: BrowserAction }
 *   { type: "message", message: MessageBusAction }
 *
 * Backward compatibility:
 *   - Steps saved before v2 have no `type`; they are API steps.
 *   - Event actions saved before v2 have a single `action` and no `steps`;
 *     they are treated as a one-step API chain whose key is the event type
 *     (`new` / `modified`), matching the step key used in existing logs.
 */

const STEP_TYPES = Object.freeze(["api", "browser", "message"]);
const EVENT_TYPES = Object.freeze({ NEW: "onNew", MODIFIED: "onModified" });

const BROWSER_ACTIONS = Object.freeze([
  "openPage",
  "click",
  "fill",
  "select",
  "waitFor",
  "delay",
  "readText",
  "readAttribute",
  "check",
  "uncheck",
  "uploadFile",
  "downloadFile",
  "screenshot",
  "pressKey",
  "hover",
  "scrollIntoView",
  "switchToLatestPage",
]);

/** Browser actions that cannot run without an element selector. */
const SELECTOR_REQUIRED = Object.freeze(
  new Set([
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
  ]),
);

const STEP_KEY_PATTERN = /^[a-zA-Z0-9_]+$/;

function stepType(step) {
  return STEP_TYPES.includes(step?.type) ? step.type : "api";
}

/** Returns the enabled steps of a chain in execution order. */
function enabledSteps(steps) {
  // Matches the original enrichment behaviour: only explicitly enabled steps run.
  return (Array.isArray(steps) ? steps : []).filter(
    (step) => step && step.enabled === true,
  );
}

/**
 * Resolves the executable chain of an event action, upgrading the legacy
 * single-action shape on the fly.
 */
function eventSteps(eventAction, eventType) {
  if (!eventAction) return [];
  // A definition that has a `steps` array (even empty) is a v2 chain; the
  // `action` field is then only a mirror kept for older readers.
  if (Array.isArray(eventAction.steps)) return enabledSteps(eventAction.steps);
  if (eventAction.action && eventAction.action.url)
    return [
      {
        id: `legacy-${String(eventType).toLowerCase()}`,
        key: String(eventType).toLowerCase(),
        name: `${eventType} Event Action`,
        enabled: true,
        type: "api",
        action: eventAction.action,
      },
    ];
  return [];
}

/** Human readable method written to step logs, e.g. BROWSER:OPENPAGE. */
function stepMethod(step) {
  const type = stepType(step);
  if (type === "browser")
    return `BROWSER:${String(step.browser?.action || "UNKNOWN").toUpperCase()}`;
  if (type === "message")
    return step.message?.operation === "dlqCheck"
      ? "MESSAGE:DLQ_CHECK"
      : "MESSAGE:SEND";
  return String(step.action?.method || "GET").toUpperCase();
}

function validateStep(step, label) {
  const type = stepType(step);
  const name = `${label} step '${step?.name || step?.key || "?"}'`;
  if (!step?.key || !STEP_KEY_PATTERN.test(step.key))
    return `${name} needs a key made of letters, numbers or underscore.`;
  if (step.type && !STEP_TYPES.includes(step.type))
    return `${name} has an unsupported step type '${step.type}'.`;
  // Disabled steps are kept as drafts; only their key must be valid/unique.
  if (step.enabled !== true) return null;
  if (type === "api") {
    if (!step.action?.url) return `${name} needs an Endpoint URL.`;
    return null;
  }
  if (type === "browser") {
    const action = step.browser?.action;
    if (!BROWSER_ACTIONS.includes(action))
      return `${name} has an unsupported Browser RPA action.`;
    if (action === "openPage" && !step.browser?.url)
      return `${name} (Open Page) needs a URL.`;
    if (SELECTOR_REQUIRED.has(action) && !step.browser?.selector)
      return `${name} needs an element selector.`;
    if (action === "readAttribute" && !step.browser?.attributeName)
      return `${name} (Read Attribute) needs an attribute name.`;
    if (action === "uploadFile" && !step.browser?.filePath)
      return `${name} (Upload File) needs a runner-local file path.`;
    return null;
  }
  const message = step.message || {};
  if (!message.connectionId) return `${name} needs a messaging connection.`;
  if (!message.destination) return `${name} needs a destination.`;
  if (!["queue", "topic"].includes(message.destinationType || "queue"))
    return `${name} has an invalid destination type.`;
  if (message.operation === "dlqCheck" && !message.messageId)
    return `${name} (Check Dead Letter) needs a Message ID.`;
  return null;
}

/**
 * Validates a chain. `reservedKeys` are keys already used by earlier chains
 * (event chains run after the enrichment chain and share its `steps` scope).
 */
function validateChain(steps, label, maxSteps, reservedKeys = new Set()) {
  const list = Array.isArray(steps) ? steps : [];
  if (list.length > maxSteps)
    return `${label} supports at most ${maxSteps} steps.`;
  const seen = new Set(reservedKeys);
  for (const step of list) {
    const error = validateStep(step, label);
    if (error) return error;
    if (seen.has(step.key))
      return `${label} step key '${step.key}' is already used. Step keys must be unique.`;
    seen.add(step.key);
  }
  return null;
}

/** Keys used by a chain (for message connection / uniqueness checks). */
function chainKeys(steps) {
  return new Set(
    (Array.isArray(steps) ? steps : []).map((s) => s?.key).filter(Boolean),
  );
}

/** Message connection ids referenced anywhere in a definition. */
function referencedConnectionIds(definition) {
  const ids = new Set();
  const collect = (steps) => {
    for (const step of Array.isArray(steps) ? steps : [])
      if (stepType(step) === "message" && step.message?.connectionId)
        ids.add(String(step.message.connectionId));
  };
  collect(definition?.enrichmentSteps);
  collect(definition?.events?.onNew?.steps);
  collect(definition?.events?.onModified?.steps);
  return [...ids];
}

/** True if any chain in the definition contains a Browser RPA step. */
function usesStepType(definition, type) {
  const has = (steps) =>
    enabledSteps(steps).some((step) => stepType(step) === type);
  return (
    has(definition?.enrichmentSteps) ||
    has(definition?.events?.onNew?.steps) ||
    has(definition?.events?.onModified?.steps)
  );
}

module.exports = {
  STEP_TYPES,
  EVENT_TYPES,
  BROWSER_ACTIONS,
  stepType,
  enabledSteps,
  eventSteps,
  stepMethod,
  validateStep,
  validateChain,
  chainKeys,
  referencedConnectionIds,
  usesStepType,
};
