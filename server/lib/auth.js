const crypto = require("crypto");
const { query } = require("./db");
const { getSecurityConfig } = require("../config/security-config");

const COOKIE = "assetviewer_session";

function secret() {
  if (!process.env.SESSION_SECRET)
    throw Object.assign(new Error("SESSION_SECRET is not configured."), {
      status: 500,
    });
  return process.env.SESSION_SECRET;
}
function b64(value) {
  return Buffer.from(value).toString("base64url");
}
function sign(value) {
  return crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
}
function sessionMaxAgeSeconds() {
  return getSecurityConfig().auth.sessionHours * 60 * 60;
}
/** Session token: { uid, iat, exp } signed with SESSION_SECRET. */
function createToken(user) {
  const now = Date.now();
  const payload = b64(
    JSON.stringify({
      uid: user.id,
      iat: now,
      exp: now + sessionMaxAgeSeconds() * 1000,
    }),
  );
  return `${payload}.${sign(payload)}`;
}
function readCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((v) => {
        const index = v.indexOf("=");
        if (index < 0) return [];
        try {
          return [
            decodeURIComponent(v.slice(0, index).trim()),
            decodeURIComponent(v.slice(index + 1).trim()),
          ];
        } catch {
          return [];
        }
      })
      .filter((v) => v.length === 2),
  );
}
function signatureMatches(payload, signature) {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(String(signature));
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}
/** @returns {{uid: number, iat: number|null} | null} */
function tokenClaims(req) {
  const token = readCookies(req)[COOKIE];
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !signatureMatches(payload, sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url"));
    if (!(data.exp > Date.now())) return null;
    return { uid: data.uid, iat: Number(data.iat) || null };
  } catch {
    return null;
  }
}
async function currentUser(req) {
  const claims = tokenClaims(req);
  if (!claims) return null;
  const r = await query(
    `SELECT u.id,u.username,u.name,u.email,u.active,u.must_change_password,u.password_changed_at,u.locked_until,
            r.id role_id,r.name role_name,r.permissions
       FROM app_users u JOIN app_roles r ON r.id=u.role_id
      WHERE u.id=$1 AND u.active=TRUE AND r.active=TRUE AND u.deleted_at IS NULL AND r.deleted_at IS NULL`,
    [claims.uid],
  );
  const user = r.rows[0];
  if (!user) return null;
  // A password change revokes every session issued before it. Tokens from
  // before this release carry no iat and are revoked only after a change.
  if (user.password_changed_at) {
    const changedAt = new Date(user.password_changed_at).getTime();
    if (!claims.iat || claims.iat < changedAt - 1000) return null;
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now())
    return null;
  return user;
}
/**
 * Ensures an authenticated user (and optional permission).
 * Users who must change their password can only reach endpoints that pass
 * `{ allowPasswordChange: true }` (session info, change password, logout).
 */
async function requireAuth(req, res, permission, options = {}) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  if (user.must_change_password && !options.allowPasswordChange) {
    res.status(403).json({
      error: "You must change your password before continuing.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    return null;
  }
  if (permission && !user.permissions?.[permission]) {
    res
      .status(403)
      .json({ error: "You do not have permission to access this feature." });
    return null;
  }
  return user;
}
function setSession(res, user) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(createToken(user))}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${sessionMaxAgeSeconds()}`,
  );
}
function clearSession(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
  );
}
module.exports = { currentUser, requireAuth, setSession, clearSession };
