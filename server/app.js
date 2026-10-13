/**
 * Portable application server (Express).
 *
 * This is the canonical runtime for on-premises, VM and container hosting:
 * it serves the built frontend and the API through the same security
 * pipeline used by every other host adapter.
 */
const express = require("express");
const path = require("path");
const { handleApiRequest } = require("./http/pipeline");
const { serveSpaShell } = require("./http/spa-shell");
const { getSecurityConfig } = require("./config/security-config");

function createApp() {
  const config = getSecurityConfig();
  const app = express();
  app.disable("x-powered-by");
  // Client IPs are resolved by server/http/client-ip.js (TRUST_PROXY_HOPS).
  app.use(express.json({ limit: process.env.HTTP_JSON_LIMIT || "5mb" }));

  // API: every /api/<route> goes through the shared pipeline.
  app.all(/^\/api\/(.+)$/, (req, res) =>
    handleApiRequest(req.params[0], req, res),
  );

  // The shell file itself is never served raw (it would bypass page headers);
  // a direct request gets the most restrictive page policy.
  app.get(`/${config.app.shellFile}`, (req, res) =>
    serveSpaShell("/__direct-shell", req, res),
  );

  // Static build output (JS/CSS/images).
  const distDir = path.resolve(process.cwd(), config.app.distDir);
  app.use(
    express.static(distDir, {
      index: false,
      fallthrough: true,
      maxAge: "1h",
      setHeaders: (res, file) => {
        if (/[\\/]assets[\\/]/.test(file))
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );

  // Client-side routes → SPA shell with page-specific headers.
  app.get(/^(?!\/api\/).*/, (req, res) => serveSpaShell(req.path, req, res));

  // Malformed JSON and other middleware errors → JSON without internals.
  app.use((error, req, res, _next) => {
    const status = Number(error?.status || error?.statusCode) || 500;
    if (status >= 500) console.error("[http] unhandled error:", error);
    res.status(status).json({
      error: status === 400 ? "Malformed request body." : "Request failed.",
    });
  });
  return app;
}

module.exports = { createApp };
