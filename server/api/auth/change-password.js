const { query, verifyPassword, hashPassword } = require("../../lib/db");
const { requireAuth, setSession } = require("../../lib/auth");
const {
  passwordPolicyViolation,
  passwordPolicySummary,
} = require("../../security/password-policy");
const { recordFailedLogin } = require("../../security/login-protection");

/**
 * GET  → password policy (for the UI).
 * POST { currentPassword, newPassword } → changes the signed-in user's
 * password, clears the forced-change flag, revokes other sessions and
 * issues a fresh session for this browser.
 */
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, null, { allowPasswordChange: true });
  if (!user) return;
  if (req.method === "GET")
    return res.json({ policy: passwordPolicySummary() });
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const { currentPassword, newPassword } = req.body || {};
    const row = (
      await query("SELECT password_hash FROM app_users WHERE id=$1", [user.id])
    ).rows[0];
    if (
      !row ||
      !verifyPassword(String(currentPassword || ""), row.password_hash)
    ) {
      await recordFailedLogin(user.id).catch(() => {});
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    if (String(newPassword || "") === String(currentPassword || ""))
      return res.status(400).json({
        error: "New password must be different from the current one.",
      });
    const violation = passwordPolicyViolation(newPassword, user);
    if (violation) return res.status(400).json({ error: violation });
    const changedAt = new Date();
    await query(
      `UPDATE app_users SET password_hash=$2, must_change_password=FALSE, password_changed_at=$3,
              failed_login_count=0, updated_at=NOW() WHERE id=$1`,
      [user.id, hashPassword(String(newPassword)), changedAt],
    );
    setSession(res, user);
    return res.json({ message: "Password changed." });
  } catch (e) {
    console.error("[auth] change password failed:", e);
    return res.status(500).json({ error: "Unable to change password." });
  }
};
