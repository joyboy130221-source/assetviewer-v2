const { ensureSchema, query, verifyPassword } = require("../../lib/db");
const { setSession } = require("../../lib/auth");
const {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} = require("../../security/login-protection");
const { isKnownDefaultPassword } = require("../../security/password-policy");

// One generic message for every failure so accounts cannot be enumerated.
const INVALID = "Invalid username/email or password.";

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    await ensureSchema();
    const { login, password } = req.body || {};
    const r = await query(
      `SELECT u.*,r.name role_name,r.active role_active,r.permissions FROM app_users u JOIN app_roles r ON r.id=u.role_id WHERE (lower(u.username)=lower($1) OR lower(u.email)=lower($1)) AND u.deleted_at IS NULL AND r.deleted_at IS NULL LIMIT 1`,
      [String(login || "").trim()],
    );
    const u = r.rows[0];
    if (u && isLocked(u))
      return res.status(423).json({
        error:
          "This account is temporarily locked after repeated failed sign-ins. Try again later or contact an administrator.",
        code: "ACCOUNT_LOCKED",
      });
    const passwordText = String(password || "");
    if (
      !u ||
      !u.active ||
      !u.role_active ||
      !verifyPassword(passwordText, u.password_hash)
    ) {
      if (u) await recordFailedLogin(u.id).catch(() => {});
      return res.status(401).json({ error: INVALID });
    }
    await recordSuccessfulLogin(u.id);
    // Accounts still using a published default password must change it.
    let mustChangePassword = Boolean(u.must_change_password);
    if (!mustChangePassword && isKnownDefaultPassword(passwordText)) {
      mustChangePassword = true;
      await query(
        "UPDATE app_users SET must_change_password=TRUE WHERE id=$1",
        [u.id],
      );
    }
    setSession(res, u);
    return res.json({
      message: "Login successful.",
      mustChangePassword,
      user: {
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role_name,
        permissions: u.permissions,
        mustChangePassword,
      },
    });
  } catch (e) {
    console.error("[auth] login failed:", e);
    return res
      .status(e.status || 500)
      .json({ error: "Sign-in is temporarily unavailable." });
  }
};
