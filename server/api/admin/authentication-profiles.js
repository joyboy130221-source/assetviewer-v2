const { query, encryptSecret } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { testManagedToken } = require("../../lib/token-manager");

const clampInt = (value, min, max, fallback) =>
  Math.max(min, Math.min(max, Number(value) || fallback));
const normalized = (body) => ({
  organizationId: body.organizationId || null,
  name: String(body.name || "").trim(),
  description: String(body.description || ""),
  authType: body.auth_type || "apiKey",
  headerName: String(body.header_name || ""),
  username: String(body.username || ""),
  active: body.active !== false,
  tokenUrl: String(body.token_url || "").trim() || null,
  tokenMethod: "POST",
  tokenClientAuth: body.token_client_auth === "basic" ? "basic" : "body",
  tokenGrantType:
    String(body.token_grant_type || "client_credentials").trim() ||
    "client_credentials",
  tokenScope: String(body.token_scope || "").trim() || null,
  tokenAudience: String(body.token_audience || "").trim() || null,
  tokenResponsePath:
    String(body.token_response_path || "access_token").trim() || "access_token",
  tokenExpiryResponsePath:
    String(body.token_expiry_response_path || "expires_in").trim() ||
    "expires_in",
  tokenRefreshBeforeSeconds: clampInt(
    body.token_refresh_before_seconds,
    0,
    3600,
    60,
  ),
  tokenTimeoutMs: clampInt(body.token_timeout_ms, 1000, 120000, 15000),
});
function validate(profile, secret, editing) {
  if (!profile.name) return "Name is required.";
  if (!editing && !secret) return "Credential is required.";
  if (profile.authType === "managedBearer") {
    if (!profile.tokenUrl) return "Token endpoint is required.";
    if (!profile.username) return "Client ID is required.";
    if (!profile.tokenGrantType) return "Grant type is required.";
    if (!editing && !secret) return "Client secret is required.";
  }
  return null;
}
async function validateOrganization(organizationId) {
  if (!organizationId) return true;
  const org = await query(
    "SELECT id FROM organizations WHERE id=$1 AND active=TRUE AND deleted_at IS NULL",
    [organizationId],
  );
  return Boolean(org.rowCount);
}
async function profileForTokenTest(body, profile) {
  let encryptedSecret = body.secret ? encryptSecret(body.secret) : null;
  if (!encryptedSecret && body.id) {
    const existing = await query(
      "SELECT secret_value,organization_id FROM authentication_profiles WHERE id=$1 AND deleted_at IS NULL",
      [body.id],
    );
    if (!existing.rowCount)
      throw Object.assign(new Error("Authentication profile not found."), {
        status: 404,
      });
    if (
      profile.organizationId &&
      existing.rows[0].organization_id &&
      profile.organizationId !== existing.rows[0].organization_id
    ) {
      // The normal permission gate remains authoritative; this additionally prevents accidentally testing another tenant's stored secret.
      throw Object.assign(
        new Error(
          "Stored credential cannot be reused across organizations. Enter the client secret again.",
        ),
        { status: 400 },
      );
    }
    encryptedSecret = existing.rows[0].secret_value;
  }
  if (!encryptedSecret)
    throw Object.assign(
      new Error("Client secret is required to test the token request."),
      { status: 400 },
    );
  return {
    id: body.id || "test",
    organization_id: profile.organizationId,
    username: profile.username,
    secret_value: encryptedSecret,
    token_url: profile.tokenUrl,
    token_method: profile.tokenMethod,
    token_client_auth: profile.tokenClientAuth,
    token_grant_type: profile.tokenGrantType,
    token_scope: profile.tokenScope,
    token_audience: profile.tokenAudience,
    token_response_path: profile.tokenResponsePath,
    token_expiry_response_path: profile.tokenExpiryResponsePath,
    token_refresh_before_seconds: profile.tokenRefreshBeforeSeconds,
    token_timeout_ms: profile.tokenTimeoutMs,
  };
}
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "authenticationProfiles");
  if (!user) return;
  try {
    if (req.method === "GET") {
      const r =
        await query(`SELECT p.id,p.organization_id,p.name,p.description,p.auth_type,p.header_name,p.username,p.active,
        p.token_url,p.token_method,p.token_client_auth,p.token_grant_type,p.token_scope,p.token_audience,p.token_response_path,p.token_expiry_response_path,
        p.token_refresh_before_seconds,p.token_timeout_ms,p.created_at,p.updated_at,o.name organization_name
        FROM authentication_profiles p LEFT JOIN organizations o ON o.id=p.organization_id
        WHERE p.deleted_at IS NULL ORDER BY p.name`);
      const organizations = (
        await query(
          "SELECT id,name,active FROM organizations WHERE active=TRUE AND deleted_at IS NULL ORDER BY name",
        )
      ).rows;
      return res.json({ data: r.rows, organizations });
    }
    const b = req.body || {};
    const profile = normalized(b);
    const isTest = req.method === "POST" && b.action === "testToken";
    const editing = req.method === "PUT" || Boolean(isTest && b.id);
    const error = validate(profile, b.secret, editing);
    if (error) return res.status(400).json({ error });
    if (!(await validateOrganization(profile.organizationId)))
      return res.status(400).json({ error: "Organization is unavailable." });

    if (isTest) {
      if (profile.authType !== "managedBearer")
        return res.status(400).json({
          error:
            "Token test is only available for Managed Bearer Token profiles.",
        });
      const transientProfile = await profileForTokenTest(b, profile);
      const result = await testManagedToken(transientProfile);
      return res.json({ message: "Token request succeeded.", ...result });
    }
    if (req.method === "POST") {
      await query(
        `INSERT INTO authentication_profiles(organization_id,name,description,auth_type,header_name,username,secret_value,active,
        token_url,token_method,token_client_auth,token_grant_type,token_scope,token_audience,token_response_path,token_expiry_response_path,token_refresh_before_seconds,token_timeout_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          profile.organizationId,
          profile.name,
          profile.description,
          profile.authType,
          profile.headerName,
          profile.username,
          encryptSecret(b.secret),
          profile.active,
          profile.tokenUrl,
          profile.tokenMethod,
          profile.tokenClientAuth,
          profile.tokenGrantType,
          profile.tokenScope,
          profile.tokenAudience,
          profile.tokenResponsePath,
          profile.tokenExpiryResponsePath,
          profile.tokenRefreshBeforeSeconds,
          profile.tokenTimeoutMs,
        ],
      );
      return res.json({ message: "Authentication profile created." });
    }
    if (req.method === "PUT") {
      if (!b.id)
        return res.status(400).json({ error: "Profile id is required." });
      const result = await query(
        `UPDATE authentication_profiles SET organization_id=$1,name=$2,description=$3,auth_type=$4,header_name=$5,username=$6,active=$7,
        token_url=$8,token_method=$9,token_client_auth=$10,token_grant_type=$11,token_scope=$12,token_audience=$13,token_response_path=$14,token_expiry_response_path=$15,
        token_refresh_before_seconds=$16,token_timeout_ms=$17,updated_at=NOW() WHERE id=$18 AND deleted_at IS NULL`,
        [
          profile.organizationId,
          profile.name,
          profile.description,
          profile.authType,
          profile.headerName,
          profile.username,
          profile.active,
          profile.tokenUrl,
          profile.tokenMethod,
          profile.tokenClientAuth,
          profile.tokenGrantType,
          profile.tokenScope,
          profile.tokenAudience,
          profile.tokenResponsePath,
          profile.tokenExpiryResponsePath,
          profile.tokenRefreshBeforeSeconds,
          profile.tokenTimeoutMs,
          b.id,
        ],
      );
      if (!result.rowCount)
        return res
          .status(404)
          .json({ error: "Authentication profile not found." });
      if (b.secret)
        await query(
          "UPDATE authentication_profiles SET secret_value=$1,updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL",
          [encryptSecret(b.secret), b.id],
        );
      await query(
        "DELETE FROM authentication_token_cache WHERE profile_id=$1",
        [b.id],
      );
      return res.json({
        message:
          "Authentication profile updated. Managed token cache was reset.",
      });
    }
    if (req.method === "DELETE") {
      const result = await query(
        "UPDATE authentication_profiles SET deleted_at=NOW(),deleted_by=$2,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
        [b.id, user.id],
      );
      if (!result.rowCount)
        return res
          .status(404)
          .json({ error: "Authentication profile not found." });
      return res.json({ message: "Authentication profile deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(e.code === "23505" ? 409 : e.status || 500).json({
      error: e.code === "23505" ? "Profile name already exists." : e.message,
    });
  }
};
