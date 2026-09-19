const express = require("express");
const { query } = require("./lib/db");

const loginHandler = require("./api/auth/login");
const logoutHandler = require("./api/auth/logout");
const meHandler = require("./api/auth/me");
const dashboardHandler = require("./api/admin/dashboard");
const usersHandler = require("./api/admin/users");
const environmentsHandler = require("./api/admin/environments");
const externalViewsHandler = require("./api/admin/external-views");
const rolesHandler = require("./api/admin/roles");
const apiLogsHandler = require("./api/admin/api-logs");
const organizationsHandler = require("./api/admin/organizations");
const formsHandler = require("./api/admin/forms");
const formIntegrationTestHandler = require("./api/admin/form-integration-test");
const formSubmissionsHandler = require("./api/admin/form-submissions");
const authenticationProfilesHandler = require("./api/admin/authentication-profiles");
const publicFormsHandler = require("./api/public-forms");

console.log(
  "DATABASE_URL:",
  process.env.DATABASE_URL ? "configured" : "missing",
);

console.log(
  "SESSION_SECRET:",
  process.env.SESSION_SECRET ? "configured" : "missing",
);

console.log(
  "CREDENTIAL_ENCRYPTION_KEY:",
  process.env.CREDENTIAL_ENCRYPTION_KEY ? "configured" : "missing",
);

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "BIB Backend",
  });
});

app.get("/api/db-health", async (req, res) => {
  try {
    const result = await query("SELECT NOW() AS database_time");

    res.json({
      status: "ok",
      database: "connected",
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      status: "error",
      database: "connection failed",
      message: error.message,
    });
  }
});

// ----------------------------------------------------
// Authentication
// ----------------------------------------------------

app.post("/api/auth/login", loginHandler);
app.get("/api/auth/me", meHandler);
app.post("/api/auth/logout", logoutHandler);

// ----------------------------------------------------
// Dashboard
// ----------------------------------------------------

app.get("/api/admin/dashboard", dashboardHandler);

app.all("/api/admin/users", usersHandler);
app.all("/api/admin/environments", environmentsHandler);
app.all("/api/admin/external-views", externalViewsHandler);
app.all("/api/admin/roles", rolesHandler);
app.all("/api/admin/api-logs", apiLogsHandler);
app.all("/api/admin/organizations", organizationsHandler);
app.all("/api/admin/forms", formsHandler);
app.all("/api/admin/form-integration-test", formIntegrationTestHandler);
app.all("/api/admin/form-submissions", formSubmissionsHandler);
app.all("/api/public-forms", publicFormsHandler);
app.all("/api/admin/authentication-profiles", authenticationProfilesHandler);

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Local API running on http://localhost:${PORT}`);
});
