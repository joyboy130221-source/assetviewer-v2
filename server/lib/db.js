const { Pool } = require("pg");
const crypto = require("crypto");

let pool;
let initialized;
function getPool() {
  if (!process.env.DATABASE_URL)
    throw Object.assign(
      new Error(
        "DATABASE_URL is not configured. Connect a PostgreSQL database to this Vercel project.",
      ),
      { status: 500 },
    );
  if (!pool)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: databaseSslOptions(),
      max: envInt("DATABASE_POOL_MAX", 5, 1, 100),
      idleTimeoutMillis: envInt("DATABASE_POOL_IDLE_MS", 10000, 1000, 600000),
      connectionTimeoutMillis: envInt(
        "DATABASE_CONNECT_TIMEOUT_MS",
        10000,
        1000,
        120000,
      ),
    });
  return pool;
}
function envInt(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (
    process.env[name] == null ||
    process.env[name] === "" ||
    !Number.isFinite(n)
  )
    return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
/**
 * DATABASE_SSL_MODE:
 *   auto        (default) legacy behaviour: TLS without certificate
 *               verification when NODE_ENV=production, otherwise as given by
 *               the connection string.
 *   disable     no TLS (local development only).
 *   require     TLS, certificate not verified.
 *   verify-full TLS with certificate + hostname verification (recommended).
 *               Uses the system CA store, or DATABASE_SSL_CA (PEM text or a
 *               path to a PEM file) for private CAs.
 */
function databaseSslOptions() {
  const mode = String(process.env.DATABASE_SSL_MODE || "auto").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") {
    const caSetting = String(process.env.DATABASE_SSL_CA || "").trim();
    let ca;
    if (caSetting.includes("-----BEGIN")) ca = caSetting;
    else if (caSetting) ca = require("fs").readFileSync(caSetting, "utf8");
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }
  return process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actual.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actual, expectedBuffer)
  );
}

function credentialKey() {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw)
    throw Object.assign(
      new Error("CREDENTIAL_ENCRYPTION_KEY is not configured."),
      { status: 500 },
    );
  return crypto.createHash("sha256").update(raw).digest();
}
function encryptSecret(value) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
function decryptSecret(value) {
  const text = String(value || "");
  if (!text.startsWith("enc:v1:")) return text;
  const [, , iv, tag, data] = text.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    credentialKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Creates the first administrator on an empty database.
 * The password comes from INITIAL_ADMIN_PASSWORD; when it is not set a random
 * one is generated and printed once to the server log. Either way the
 * administrator must change it at first sign-in.
 */
async function seedInitialAdministrator(db) {
  const { getSecurityConfig } = require("../config/security-config");
  const { auth } = getSecurityConfig();
  const role = (
    await db.query(
      `SELECT id FROM app_roles WHERE name='administrator' AND deleted_at IS NULL LIMIT 1`,
    )
  ).rows[0];
  if (!role) return;
  const generated = !auth.initialAdminPassword;
  const password =
    auth.initialAdminPassword || crypto.randomBytes(18).toString("base64url");
  const inserted = await db.query(
    `INSERT INTO app_users(username,name,email,password_hash,active,role_id,must_change_password)
     VALUES($1,$2,$3,$4,TRUE,$5,TRUE) ON CONFLICT(username) DO NOTHING RETURNING id`,
    [
      auth.initialAdminUsername,
      "Administrator",
      auth.initialAdminEmail,
      hashPassword(password),
      role.id,
    ],
  );
  if (inserted.rowCount && generated)
    console.warn(
      `\n[security] Initial administrator created.\n  Username: ${auth.initialAdminUsername}\n  Temporary password: ${password}\n  It must be changed at first sign-in. Set INITIAL_ADMIN_PASSWORD to choose it yourself.\n`,
    );
}

async function ensureSchema() {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = getPool();
    await db.query(`CREATE TABLE IF NOT EXISTS app_roles (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(80) UNIQUE NOT NULL, description TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY, username VARCHAR(80) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL, email VARCHAR(255) UNIQUE,
      password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, role_id BIGINT NOT NULL REFERENCES app_roles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS maximo_environments (
      id BIGSERIAL PRIMARY KEY, env_name VARCHAR(80) UNIQUE NOT NULL, description TEXT, endpoint TEXT NOT NULL, api_key TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS message_bus_connections (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(120) UNIQUE NOT NULL, description TEXT, provider VARCHAR(40) NOT NULL DEFAULT 'azureServiceBus',
      connection_string TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS message_bus_logs (
      id UUID PRIMARY KEY, source VARCHAR(20) NOT NULL DEFAULT 'MANUAL', operation VARCHAR(30) NOT NULL DEFAULT 'SEND',
      connection_id BIGINT REFERENCES message_bus_connections(id) ON DELETE SET NULL, connection_name VARCHAR(120),
      destination_type VARCHAR(20), destination VARCHAR(255), message_id VARCHAR(255), correlation_id VARCHAR(255),
      message_format VARCHAR(20), content_type VARCHAR(160), application_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
      message_body TEXT, success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER, error_message TEXT,
      workflow_execution_id UUID, user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_message_bus_logs_created ON message_bus_logs(created_at DESC)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_message_bus_logs_destination ON message_bus_logs(destination, created_at DESC)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_message_bus_logs_workflow ON message_bus_logs(workflow_execution_id)`,
    );
    await db.query(
      `ALTER TABLE message_bus_logs ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) NOT NULL DEFAULT 'NOT_CHECKED'`,
    );
    await db.query(
      `ALTER TABLE message_bus_logs ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT`,
    );
    await db.query(
      `ALTER TABLE message_bus_logs ADD COLUMN IF NOT EXISTS dead_letter_description TEXT`,
    );
    await db.query(
      `ALTER TABLE message_bus_logs ADD COLUMN IF NOT EXISTS dead_letter_subscription VARCHAR(255)`,
    );
    await db.query(
      `ALTER TABLE message_bus_logs ADD COLUMN IF NOT EXISTS delivery_checked_at TIMESTAMPTZ`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS authentication_profiles (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(120) UNIQUE NOT NULL, description TEXT, auth_type VARCHAR(30) NOT NULL,
      header_name VARCHAR(120), username VARCHAR(180), secret_value TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS external_views (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(120) UNIQUE NOT NULL, description TEXT, url TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    // Configuration/master records use a shared soft-delete lifecycle.
    // These additive migrations are backward compatible: existing rows remain visible because deleted_at defaults to NULL.
    for (const table of [
      "app_roles",
      "app_users",
      "maximo_environments",
      "message_bus_connections",
      "authentication_profiles",
      "external_views",
    ]) {
      await db.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      );
      await db.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL`,
      );
    }
    await db.query(`CREATE TABLE IF NOT EXISTS api_request_logs (
      id BIGSERIAL PRIMARY KEY, environment_id BIGINT REFERENCES maximo_environments(id) ON DELETE SET NULL,
      environment_name VARCHAR(80), request_method VARCHAR(12) NOT NULL, request_url TEXT NOT NULL,
      request_headers JSONB NOT NULL DEFAULT '{}'::jsonb, request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_body JSONB, response_status INTEGER, response_headers JSONB NOT NULL DEFAULT '{}'::jsonb, response_body JSONB,
      success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at DESC)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_request_logs_environment ON api_request_logs(environment_name, created_at DESC)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_request_logs_status ON api_request_logs(response_status, created_at DESC)`,
    );
    await db.query(
      `INSERT INTO app_roles(name,description,permissions) VALUES($1,$2,$3::jsonb) ON CONFLICT(name) DO NOTHING`,
      [
        "administrator",
        "Default administrator role",
        JSON.stringify({
          roles: true,
          users: true,
          maximoEnvironments: true,
          externalViews: true,
          apiLogs: true,
          organizations: true,
          formBuilder: true,
          authenticationProfiles: true,
          workflowExecutions: true,
          messaging: true,
          messageBusLogs: true,
        }),
      ],
    );
    await db.query(
      `UPDATE app_roles SET permissions = permissions || '{"externalViews": true}'::jsonb, updated_at=NOW() WHERE name='administrator' AND NOT (permissions ? 'externalViews')`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY, code VARCHAR(80) UNIQUE NOT NULL, name VARCHAR(180) NOT NULL, description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    );
    await db.query(
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL`,
    );
    // Managed bearer/OAuth token lifecycle. Columns are additive so existing credential profiles remain compatible.
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_url TEXT`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_method VARCHAR(10) NOT NULL DEFAULT 'POST'`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_client_auth VARCHAR(20) NOT NULL DEFAULT 'body'`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_grant_type VARCHAR(120) NOT NULL DEFAULT 'client_credentials'`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_scope TEXT`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_audience TEXT`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_response_path VARCHAR(255) NOT NULL DEFAULT 'access_token'`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_expiry_response_path VARCHAR(255) NOT NULL DEFAULT 'expires_in'`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_refresh_before_seconds INTEGER NOT NULL DEFAULT 60`,
    );
    await db.query(
      `ALTER TABLE authentication_profiles ADD COLUMN IF NOT EXISTS token_timeout_ms INTEGER NOT NULL DEFAULT 15000`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS authentication_token_cache (
      cache_key VARCHAR(180) PRIMARY KEY, profile_id BIGINT NOT NULL REFERENCES authentication_profiles(id) ON DELETE CASCADE,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, access_token_value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_auth_token_cache_expiry ON authentication_token_cache(expires_at)`,
    );
    await db.query(
      `ALTER TABLE external_views ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS analytics_definitions (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), name VARCHAR(180) NOT NULL, description TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft', definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ
    )`);
    await db.query(
      `ALTER TABLE analytics_definitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    );
    await db.query(
      `ALTER TABLE analytics_definitions ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_analytics_org ON analytics_definitions(organization_id, updated_at DESC)`,
    );
    // Analytics Pages: a page shows one of several analytics, optionally
    // chosen from a dropdown (static items or items from an API).
    await db.query(`CREATE TABLE IF NOT EXISTS analytics_pages (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), name VARCHAR(180) NOT NULL, description TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft', definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_analytics_pages_not_deleted ON analytics_pages(organization_id, updated_at DESC) WHERE deleted_at IS NULL`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS form_definitions (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), name VARCHAR(180) NOT NULL, description TEXT,
      mode VARCHAR(30) NOT NULL DEFAULT 'empty', status VARCHAR(30) NOT NULL DEFAULT 'draft', fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      submit_action JSONB, created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ
    )`);
    await db.query(
      `ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS source_action JSONB`,
    );
    await db.query(
      `ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`,
    );
    await db.query(
      `ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    );
    await db.query(
      `ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_forms_not_deleted ON form_definitions(organization_id, updated_at DESC) WHERE deleted_at IS NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_analytics_not_deleted ON analytics_definitions(organization_id, updated_at DESC) WHERE deleted_at IS NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_org_not_deleted ON organizations(name) WHERE deleted_at IS NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_forms_org ON form_definitions(organization_id, updated_at DESC)`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS form_submissions (
      id UUID PRIMARY KEY, form_id UUID NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id), values JSONB NOT NULL DEFAULT '{}'::jsonb,
      query_context JSONB NOT NULL DEFAULT '{}'::jsonb, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS query_context JSONB NOT NULL DEFAULT '{}'::jsonb`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_submissions_form ON form_submissions(form_id, submitted_at DESC)`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS form_action_logs (
      id UUID PRIMARY KEY, submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
      form_id UUID NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id),
      request_method VARCHAR(12) NOT NULL, request_url TEXT NOT NULL, request_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_params JSONB NOT NULL DEFAULT '{}'::jsonb, request_body JSONB, response_status INTEGER, response_body JSONB,
      success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_form_action_logs_submission ON form_action_logs(submission_id, created_at DESC)`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS workflow_executions (
      id UUID PRIMARY KEY, submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
      form_id UUID NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id),
      status VARCHAR(20) NOT NULL, success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS workflow_step_executions (
      id UUID PRIMARY KEY, workflow_execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
      step_key VARCHAR(180) NOT NULL, step_name VARCHAR(240) NOT NULL, sequence INTEGER NOT NULL,
      success BOOLEAN NOT NULL DEFAULT FALSE, response_status INTEGER, duration_ms INTEGER NOT NULL DEFAULT 0,
      request_method VARCHAR(50), request_url TEXT, request_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_params JSONB NOT NULL DEFAULT '{}'::jsonb, request_body JSONB, response_body JSONB, error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    // RPA browser actions are persisted as values such as BROWSER:OPEN_PAGE.
    // Existing installations may still have the original VARCHAR(12) column,
    // so widen it during startup as a backward-compatible schema migration.
    await db.query(
      `ALTER TABLE workflow_step_executions ALTER COLUMN request_method TYPE VARCHAR(50)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_exec_created ON workflow_executions(started_at DESC)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_exec_form ON workflow_executions(form_id, started_at DESC)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_workflow_steps_execution ON workflow_step_executions(workflow_execution_id, sequence)`,
    );
    await db.query(
      `UPDATE app_roles SET permissions = permissions || '{"organizations": true, "formBuilder": true, "authenticationProfiles": true, "workflowExecutions": true, "messaging": true, "messageBusLogs": true, "analyticsBuilder": true}'::jsonb, updated_at=NOW() WHERE name='administrator'`,
    );
    // API Watcher V1: tenant-aware configuration, durable checkpoints, record correlation and execution history.
    await db.query(`CREATE TABLE IF NOT EXISTS api_watchers (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), name VARCHAR(180) NOT NULL, description TEXT,
      active BOOLEAN NOT NULL DEFAULT FALSE, definition JSONB NOT NULL DEFAULT '{}'::jsonb, created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
      last_run_at TIMESTAMPTZ, next_run_at TIMESTAMPTZ, last_status VARCHAR(30), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL
    )`);
    await db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_api_watchers_org_name_active ON api_watchers(organization_id,name) WHERE deleted_at IS NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_watchers_due ON api_watchers(next_run_at) WHERE active=TRUE AND deleted_at IS NULL`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS api_watcher_checkpoints (
      watcher_id UUID PRIMARY KEY REFERENCES api_watchers(id) ON DELETE CASCADE, checkpoint_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS api_watcher_record_state (
      id BIGSERIAL PRIMARY KEY, watcher_id UUID NOT NULL REFERENCES api_watchers(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id), source_record_id TEXT NOT NULL, source_last_updated_on TIMESTAMPTZ NOT NULL,
      target_record_id TEXT, status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS', last_error TEXT, last_processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(watcher_id,source_record_id)
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_watcher_state_org ON api_watcher_record_state(organization_id,watcher_id)`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS api_watcher_executions (
      id UUID PRIMARY KEY, watcher_id UUID NOT NULL REFERENCES api_watchers(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id),
      status VARCHAR(30) NOT NULL, success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER NOT NULL DEFAULT 0,
      records_received INTEGER NOT NULL DEFAULT 0, new_records INTEGER NOT NULL DEFAULT 0, modified_records INTEGER NOT NULL DEFAULT 0,
      ignored_records INTEGER NOT NULL DEFAULT 0, failed_records INTEGER NOT NULL DEFAULT 0, error_message TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_watcher_exec ON api_watcher_executions(watcher_id,started_at DESC)`,
    );
    await db.query(`CREATE TABLE IF NOT EXISTS api_watcher_step_logs (
      id BIGSERIAL PRIMARY KEY, execution_id UUID NOT NULL REFERENCES api_watcher_executions(id) ON DELETE CASCADE,
      watcher_id UUID NOT NULL REFERENCES api_watchers(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id),
      source_record_id TEXT, event_type VARCHAR(30), step_type VARCHAR(30) NOT NULL, step_key VARCHAR(120), step_name VARCHAR(180), sequence INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL, success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER NOT NULL DEFAULT 0,
      request_method VARCHAR(20), request_url TEXT, request_headers JSONB NOT NULL DEFAULT '{}'::jsonb, request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_body TEXT, request_content_type VARCHAR(180), response_status INTEGER, response_body TEXT, response_content_type VARCHAR(180), error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_watcher_step_exec ON api_watcher_step_logs(execution_id,source_record_id,sequence,id)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_api_watcher_step_watch ON api_watcher_step_logs(watcher_id,created_at DESC)`,
    );
    await db.query(
      `UPDATE app_roles SET permissions=permissions || '{"apiWatchers": true}'::jsonb, updated_at=NOW() WHERE name='administrator'`,
    );
    // API Watcher v2 chains: Browser RPA and Message Bus steps (additive, backward compatible).
    // BROWSER:SWITCHTOLATESTPAGE style methods exceed the original 20 characters.
    await db.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_watcher_step_logs' AND column_name='request_method' AND character_maximum_length < 60) THEN
          ALTER TABLE api_watcher_step_logs ALTER COLUMN request_method TYPE VARCHAR(60);
        END IF;
      END $$`,
    );
    await db.query(
      `ALTER TABLE api_watcher_step_logs ADD COLUMN IF NOT EXISTS action_type VARCHAR(20) NOT NULL DEFAULT 'api'`,
    );
    // Optional tenant ownership for Service Bus connections. NULL = shared by all organizations.
    await db.query(
      `ALTER TABLE message_bus_connections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_message_bus_connections_org ON message_bus_connections(organization_id) WHERE deleted_at IS NULL`,
    );
    // Security hardening (Phase 1) — additive, backward compatible.
    for (const statement of [
      `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`,
      `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`,
      `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
      `ALTER TABLE external_views ADD COLUMN IF NOT EXISTS access_key_hash VARCHAR(64)`,
      `ALTER TABLE external_views ADD COLUMN IF NOT EXISTS access_key_prefix VARCHAR(16)`,
      `ALTER TABLE external_views ADD COLUMN IF NOT EXISTS access_key_created_at TIMESTAMPTZ`,
      `ALTER TABLE external_views ADD COLUMN IF NOT EXISTS access_key_created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL`,
      `ALTER TABLE api_request_logs ADD COLUMN IF NOT EXISTS auth_method VARCHAR(20)`,
      `ALTER TABLE api_request_logs ADD COLUMN IF NOT EXISTS user_id BIGINT`,
      `ALTER TABLE api_request_logs ADD COLUMN IF NOT EXISTS external_view_id BIGINT`,
      `ALTER TABLE api_request_logs ADD COLUMN IF NOT EXISTS client_ip VARCHAR(64)`,
      `ALTER TABLE api_request_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(100)`,
      `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        bucket_key VARCHAR(255) NOT NULL, window_start BIGINT NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(bucket_key, window_start))`,
      `CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_buckets(expires_at)`,
    ])
      await db.query(statement);
    const userCount = Number(
      (
        await db.query(
          "SELECT COUNT(*) AS count FROM app_users WHERE deleted_at IS NULL",
        )
      ).rows[0].count,
    );
    if (userCount === 0) await seedInitialAdministrator(db);
  })().catch((err) => {
    initialized = null;
    throw err;
  });
  return initialized;
}

async function query(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}
module.exports = {
  getPool,
  ensureSchema,
  query,
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
};
