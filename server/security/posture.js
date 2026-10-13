/**
 * Security posture self-check. Logs (once per process) every configuration
 * that is still running in a legacy / weaker mode, so operators can see what
 * remains to be tightened. Never logs secret values.
 */
const { getSecurityConfig } = require("../config/security-config");

function securityPostureFindings() {
  const c = getSecurityConfig();
  const env = process.env;
  const findings = [];
  const add = (level, setting, message) =>
    findings.push({ level, setting, message });

  if (!c.headers.embedOrigins.length)
    add(
      "warn",
      "EMBED_ALLOWED_ORIGINS",
      "External View pages can be embedded by any website.",
    );
  if (c.headers.invalidEmbedOrigins.length)
    add(
      "warn",
      "EMBED_ALLOWED_ORIGINS",
      `Ignored invalid origins: ${c.headers.invalidEmbedOrigins.join(", ")}`,
    );
  if (!c.headers.embedOnly)
    add(
      "warn",
      "EXTERNAL_PAGES_EMBED_ONLY",
      "External View pages can be opened directly in a browser (not only when embedded).",
    );
  else if (!c.headers.embedOrigins.length)
    add(
      "warn",
      "EXTERNAL_PAGES_EMBED_ONLY",
      "Embed-only is on but EMBED_ALLOWED_ORIGINS is empty, so any website may embed the pages.",
    );
  if (c.externalApi.mode !== "enforce")
    add(
      "warn",
      "EXTERNAL_API_AUTH_MODE",
      `External View APIs accept unauthenticated calls (mode=${c.externalApi.mode}).`,
    );
  const ssl = String(env.DATABASE_SSL_MODE || "auto").toLowerCase();
  if (ssl !== "verify-full")
    add(
      "warn",
      "DATABASE_SSL_MODE",
      `Database TLS certificate is not verified (mode=${ssl}).`,
    );
  if (!c.network.rpaUploadRoot)
    add(
      "warn",
      "WORKFLOW_RPA_UPLOAD_ROOT",
      "Browser RPA Upload File can read any file on the runner.",
    );
  if (c.network.rpaPolicy === "unrestricted")
    add(
      "warn",
      "WORKFLOW_RPA_NETWORK_POLICY",
      "Browser RPA may open private/internal addresses.",
    );
  if (c.rateLimit.store === "memory" && env.VERCEL)
    add(
      "info",
      "RATE_LIMIT_STORE",
      "In-memory rate limits are per serverless instance; use postgres for shared limits.",
    );
  if (!c.auth.lockoutThreshold)
    add("warn", "AUTH_LOCKOUT_THRESHOLD", "Account lockout is disabled.");
  if (!env.CRON_SECRET)
    add(
      "info",
      "CRON_SECRET",
      "External scheduler endpoint is disabled (no secret configured).",
    );
  return findings;
}

let reported = false;
function reportSecurityPostureOnce() {
  if (reported) return;
  reported = true;
  try {
    const findings = securityPostureFindings();
    if (!findings.length)
      return console.info(
        "[security] posture: all hardening settings enabled.",
      );
    console.warn(
      `[security] posture: ${findings.length} setting(s) still in legacy mode:\n` +
        findings
          .map((f) => `  - [${f.level}] ${f.setting}: ${f.message}`)
          .join("\n"),
    );
  } catch (error) {
    console.error("[security] posture check failed:", error.message);
  }
}

module.exports = { securityPostureFindings, reportSecurityPostureOnce };
