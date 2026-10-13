/**
 * Node entry point for on-premises / VM / container hosting and local
 * development (`npm run dev:backend`, `npm start`).
 */
const { createApp } = require("./app");
const { getSecurityConfig } = require("./config/security-config");
const { runDue: runDueApiWatchers } = require("./services/api-watcher-service");
const { reportSecurityPostureOnce } = require("./security/posture");

for (const name of [
  "DATABASE_URL",
  "SESSION_SECRET",
  "CREDENTIAL_ENCRYPTION_KEY",
])
  console.log(`${name}:`, process.env[name] ? "configured" : "missing");

const { app: appConfig } = getSecurityConfig();
const app = createApp();

app.listen(appConfig.port, () => {
  console.log(`Integration Hub running on http://localhost:${appConfig.port}`);
  reportSecurityPostureOnce();
  // In-process scheduler. PostgreSQL advisory locks keep it safe when several
  // instances run; set API_WATCHER_SCHEDULER=off when an external scheduler
  // calls /api/cron/api-watchers instead.
  if (appConfig.schedulerEnabled)
    setInterval(() => {
      runDueApiWatchers(appConfig.schedulerBatchSize).catch((error) =>
        console.error("API Watcher scheduler heartbeat failed:", error.message),
      );
    }, appConfig.schedulerIntervalSeconds * 1000).unref();
});
