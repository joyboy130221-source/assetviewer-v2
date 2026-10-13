const { decryptSecret, encryptSecret } = require("./db");
const { execute, getPath } = require("./integration-http");

const inFlight = new Map();
const clamp = (v, min, max, fallback) =>
  Math.max(min, Math.min(max, Number(v) || fallback));
const cacheKey = (profileId, organizationId) =>
  `${profileId}:${organizationId || "shared"}`;

async function readCache(profile, query, organizationId) {
  const key = cacheKey(profile.id, organizationId);
  const r = await query(
    "SELECT access_token_value,expires_at FROM authentication_token_cache WHERE cache_key=$1",
    [key],
  );
  const row = r.rows[0];
  if (!row?.access_token_value || !row?.expires_at) return null;
  const refreshBefore = clamp(
    profile.token_refresh_before_seconds,
    0,
    3600,
    60,
  );
  if (new Date(row.expires_at).getTime() - refreshBefore * 1000 <= Date.now())
    return null;
  return decryptSecret(row.access_token_value);
}

function tokenRequest(profile) {
  if (!profile.token_url)
    throw Object.assign(
      new Error(
        "Token endpoint is required for managed bearer authentication.",
      ),
      { status: 400 },
    );
  const clientId = profile.username || "";
  const clientSecret = decryptSecret(profile.secret_value);
  if (!clientId || !clientSecret)
    throw Object.assign(
      new Error(
        "Client ID and client secret are required for managed bearer authentication.",
      ),
      { status: 400 },
    );
  const params = new URLSearchParams();
  params.set(
    "grant_type",
    String(profile.token_grant_type || "client_credentials").trim() ||
      "client_credentials",
  );
  if ((profile.token_client_auth || "body") === "body") {
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  }
  if (profile.token_scope) params.set("scope", profile.token_scope);
  if (profile.token_audience) params.set("audience", profile.token_audience);
  const headers = { Accept: "application/json" };
  if (profile.token_client_auth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }
  return {
    method: profile.token_method || "POST",
    url: profile.token_url,
    headers,
    body: params.toString(),
    bodyFormat: "form",
    timeoutMs: clamp(profile.token_timeout_ms, 1000, 120000, 15000),
  };
}

async function requestTokenResponse(profile) {
  const startedAt = Date.now();
  const response = await execute(tokenRequest(profile));
  if (!response.ok)
    throw Object.assign(
      new Error(`Token endpoint returned HTTP ${response.status}.`),
      { status: 502 },
    );
  const token = getPath(
    response.data,
    profile.token_response_path || "access_token",
  );
  if (!token)
    throw Object.assign(
      new Error(
        `Token response path “${profile.token_response_path || "access_token"}” did not resolve to a value.`,
      ),
      { status: 502 },
    );
  const rawExpiry = getPath(
    response.data,
    profile.token_expiry_response_path || "expires_in",
  );
  const expiresIn = clamp(rawExpiry, 30, 86400 * 30, 3600);
  return {
    token: String(token),
    expiresIn,
    status: response.status,
    durationMs: Date.now() - startedAt,
    contentType: response.contentType,
    responseData: response.data,
  };
}

async function requestToken(profile, query, organizationId) {
  const result = await requestTokenResponse(profile);
  const expiresAt = new Date(Date.now() + result.expiresIn * 1000);
  const key = cacheKey(profile.id, organizationId);
  await query(
    `INSERT INTO authentication_token_cache(cache_key,profile_id,organization_id,access_token_value,expires_at,updated_at)
     VALUES($1,$2,$3,$4,$5,NOW())
     ON CONFLICT(cache_key) DO UPDATE SET access_token_value=EXCLUDED.access_token_value,expires_at=EXCLUDED.expires_at,updated_at=NOW()`,
    [
      key,
      profile.id,
      organizationId || null,
      encryptSecret(result.token),
      expiresAt,
    ],
  );
  return result.token;
}

async function getManagedToken(profile, query, options = {}) {
  const organizationId =
    options.organizationId || profile.organization_id || null;
  if (!options.forceRefresh) {
    const cached = await readCache(profile, query, organizationId);
    if (cached) return cached;
  }
  const key = cacheKey(profile.id, organizationId);
  if (!inFlight.has(key)) {
    const promise = requestToken(profile, query, organizationId).finally(() =>
      inFlight.delete(key),
    );
    inFlight.set(key, promise);
  }
  return inFlight.get(key);
}

async function invalidateManagedToken(profileId, query, organizationId) {
  await query("DELETE FROM authentication_token_cache WHERE cache_key=$1", [
    cacheKey(profileId, organizationId),
  ]);
}

async function testManagedToken(profile) {
  const result = await requestTokenResponse(profile);
  const responseKeys =
    result.responseData &&
    typeof result.responseData === "object" &&
    !Array.isArray(result.responseData)
      ? Object.keys(result.responseData)
          .filter((key) => !/token|secret|password/i.test(key))
          .slice(0, 20)
      : [];
  return {
    success: true,
    status: result.status,
    durationMs: result.durationMs,
    expiresIn: result.expiresIn,
    contentType: result.contentType || null,
    responseKeys,
  };
}

module.exports = { getManagedToken, invalidateManagedToken, testManagedToken };
