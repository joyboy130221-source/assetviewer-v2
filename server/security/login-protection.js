/**
 * Account lockout after repeated failed sign-ins (stored in the database so
 * it holds across instances). AUTH_LOCKOUT_THRESHOLD=0 disables it.
 * Per-IP throttling is handled separately by the pipeline rate limiter.
 */
const { query } = require("../lib/db");
const { getSecurityConfig } = require("../config/security-config");

function isLocked(user) {
  return Boolean(
    user?.locked_until && new Date(user.locked_until).getTime() > Date.now(),
  );
}

/** Records a failed attempt; locks the account when the threshold is hit. */
async function recordFailedLogin(userId) {
  const { lockoutThreshold, lockoutMinutes } = getSecurityConfig().auth;
  if (!userId) return;
  if (!lockoutThreshold) {
    await query(
      "UPDATE app_users SET failed_login_count=failed_login_count+1 WHERE id=$1",
      [userId],
    );
    return;
  }
  await query(
    `UPDATE app_users
        SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
            locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE locked_until END
      WHERE id=$1`,
    [userId, lockoutThreshold, lockoutMinutes],
  );
}

async function recordSuccessfulLogin(userId) {
  await query(
    "UPDATE app_users SET failed_login_count=0, locked_until=NULL, last_login_at=NOW() WHERE id=$1",
    [userId],
  );
}

/** Administrator action: clear a lockout. */
async function unlockAccount(userId) {
  const r = await query(
    "UPDATE app_users SET failed_login_count=0, locked_until=NULL, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
    [userId],
  );
  return r.rowCount > 0;
}

module.exports = {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  unlockAccount,
};
