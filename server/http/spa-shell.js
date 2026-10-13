/**
 * Serves the single-page application shell (built `app.html`) with
 * page-specific security headers (frame-ancestors per page).
 *
 * The build renames index.html to app.html (see vite.config.ts) so that no
 * host can serve the shell for "/" without going through this handler. The
 * shell is read from disk (on-premises, containers, or bundled with a
 * serverless function) or, as a fallback, fetched from APP_SHELL_URL; it is
 * cached for APP_SHELL_CACHE_SECONDS.
 */
const fs = require("fs");
const path = require("path");
const { getSecurityConfig } = require("../config/security-config");
const {
  pageHeaders,
  applyHeaders,
  isHttpsRequest,
  isEmbedOnlyPath,
} = require("./security-headers");
const { reportSecurityPostureOnce } = require("../security/posture");

let cached = null; // { html, expiresAt }

async function readFromDisk() {
  const { distDir, shellFile } = getSecurityConfig().app;
  const candidates = [
    path.resolve(process.cwd(), distDir, shellFile),
    path.resolve(__dirname, "..", "..", distDir, shellFile),
  ];
  for (const file of candidates) {
    try {
      return await fs.promises.readFile(file, "utf8");
    } catch {
      /* try next location */
    }
  }
  return null;
}

/**
 * Remote fallback for hosts that keep built files on a CDN only.
 * The URL comes from configuration — never from request headers — so a
 * forged Host header cannot make the server cache a foreign page.
 */
function shellUrl() {
  const configured = String(process.env.APP_SHELL_URL || "").trim();
  if (configured) return configured;
  // Generic platform-provided deployment URL (e.g. VERCEL_URL); optional.
  const platformHost = String(process.env.VERCEL_URL || "").trim();
  if (platformHost)
    return `https://${platformHost}/${getSecurityConfig().app.shellFile}`;
  return null;
}

async function readFromOrigin() {
  const url = shellUrl();
  if (!url) return null;
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  return response.ok ? await response.text() : null;
}

async function loadShell() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.html;
  const html = (await readFromDisk()) || (await readFromOrigin());
  if (!html) return null;
  const ttl = getSecurityConfig().app.shellCacheSeconds * 1000;
  cached = { html, expiresAt: now + ttl };
  return html;
}

/**
 * Embed-only guard (EXTERNAL_PAGES_EMBED_ONLY=true).
 *
 * `Sec-Fetch-Dest` is set by the browser itself and cannot be changed by page
 * scripts: "iframe" means the page is being loaded inside a frame. Which
 * parents may frame it is then enforced by the browser through the
 * frame-ancestors header (EMBED_ALLOWED_ORIGINS). A top-level navigation
 * ("document") is only served to a signed-in administrator.
 */
async function directOpenAllowed(req) {
  const destination = String(
    req.headers?.["sec-fetch-dest"] || "",
  ).toLowerCase();
  if (destination === "iframe" || destination === "frame") return true;
  try {
    const { currentUser } = require("../lib/auth");
    const user = await currentUser(req);
    return Boolean(user && !user.must_change_password);
  } catch {
    return false;
  }
}

const lastBlockedLog = { at: 0 };
function sendEmbedOnlyNotice(pathname, req, res) {
  if (Date.now() - lastBlockedLog.at > 60000) {
    lastBlockedLog.at = Date.now();
    console.warn(
      `[security] EXTERNAL_PAGES_EMBED_ONLY: direct open of ${pathname} refused (not embedded, no administrator session).`,
    );
  }
  applyHeaders(res, pageHeaders("/__blocked", isHttpsRequest(req)));
  const next = encodeURIComponent(pathname);
  res.statusCode = 403;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Integration Hub</title>` +
      `<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f6fa;color:#1e293b;display:grid;place-items:center;min-height:100vh;margin:0}` +
      `main{background:#fff;border:1px solid #dbe4ef;border-radius:14px;padding:32px;max-width:460px;text-align:center}` +
      `h1{font-size:20px;margin:0 0 10px}p{color:#475569;line-height:1.5;margin:0 0 18px}a{color:#1d4ed8;font-weight:600}</style></head>` +
      `<body><main><h1>This page can only be opened from the host application</h1>` +
      `<p>For security, this view is available only when it is embedded in the authorised application.</p>` +
      `<a href="/login?next=${next}">Administrator sign-in</a></main></body></html>`,
  );
}

/** Sends the SPA shell for a client-side route such as "/admin/users". */
async function serveSpaShell(pagePath, req, res) {
  reportSecurityPostureOnce();
  const pathname =
    "/" +
    String(pagePath || "")
      .replace(/^\/+/, "")
      .split("?")[0];
  if (
    getSecurityConfig().headers.embedOnly &&
    isEmbedOnlyPath(pathname) &&
    !(await directOpenAllowed(req))
  )
    return sendEmbedOnlyNotice(pathname, req, res);
  applyHeaders(res, pageHeaders(pathname, isHttpsRequest(req)));
  try {
    const html = await loadShell();
    if (!html) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Application shell not found. Run `npm run build` first.");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(html);
  } catch (error) {
    console.error("[spa] unable to load application shell:", error.message);
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Application temporarily unavailable.");
  }
}

function resetShellCache() {
  cached = null;
}

module.exports = { serveSpaShell, resetShellCache };
