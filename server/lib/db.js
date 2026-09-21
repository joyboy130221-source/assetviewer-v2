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
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
      max: 5,
    });
  return pool;
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
      `ALTER TABLE external_views ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL`,
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
      `UPDATE app_roles SET permissions = permissions || '{"organizations": true, "formBuilder": true, "authenticationProfiles": true, "workflowExecutions": true, "messaging": true, "messageBusLogs": true}'::jsonb, updated_at=NOW() WHERE name='administrator'`,
    );
    const userCount = Number(
      (await db.query("SELECT COUNT(*) AS count FROM app_users")).rows[0].count,
    );
    if (userCount === 0) {
      const role = (
        await db.query(
          `SELECT id FROM app_roles WHERE name='administrator' LIMIT 1`,
        )
      ).rows[0];
      await db.query(
        `INSERT INTO app_users(username,name,email,password_hash,active,role_id) VALUES($1,$2,$3,$4,TRUE,$5) ON CONFLICT(username) DO NOTHING`,
        [
          "admin",
          "Administrator",
          "admin@local.invalid",
          hashPassword("Gomake1t!@#123"),
          role.id,
        ],
      );
    }
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
