/**
 * Central, environment-driven limits for multi-step workflow execution
 * (API Watcher chains and Form Builder workflows).
 *
 * Every value has a safe default and a hard bound so a mis-typed environment
 * variable can never remove protection. Per-definition settings (for example
 * an API Watcher's Performance section) are clamped to these ceilings.
 */

function envInt(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw == null || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function envBool(name, fallback) {
  const raw = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw);
}

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (value === "" || value == null || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
};

function readWorkflowLimits() {
  return {
    /** Maximum steps allowed in one chain (enrichment or event chain). */
    maxChainSteps: envInt("WORKFLOW_MAX_CHAIN_STEPS", 25, 1, 100),
    browser: {
      /** Ceiling for concurrent isolated browser contexts per watcher run. */
      maxConcurrency: envInt("WORKFLOW_BROWSER_MAX_CONCURRENCY", 5, 1, 20),
      /** Ceiling for any single Browser RPA action timeout. */
      maxTimeoutMs: envInt(
        "WORKFLOW_BROWSER_MAX_TIMEOUT_MS",
        120000,
        1000,
        600000,
      ),
      /** Default Browser RPA action timeout when a step does not set one. */
      defaultTimeoutMs: envInt(
        "WORKFLOW_BROWSER_DEFAULT_TIMEOUT_MS",
        15000,
        1000,
        600000,
      ),
      headless: envBool("WORKFLOW_BROWSER_HEADLESS", true),
    },
    message: {
      /** Ceiling for a Dead Letter Queue monitoring window. */
      maxDlqWindowSeconds: envInt(
        "WORKFLOW_MESSAGE_DLQ_MAX_WINDOW_SECONDS",
        600,
        1,
        3600,
      ),
      /** Messages peeked from each DLQ per check. */
      dlqPeekCount: envInt("WORKFLOW_MESSAGE_DLQ_PEEK_COUNT", 100, 1, 500),
    },
  };
}

module.exports = { readWorkflowLimits, clamp };
