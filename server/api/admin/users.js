const { query, hashPassword } = require("../../lib/db");
const { requireAuth, setSession } = require("../../lib/auth");
const {
  passwordPolicyViolation,
  passwordPolicySummary,
} = require("../../security/password-policy");
const { unlockAccount } = require("../../security/login-protection");

/**
 * Whether a password set by an administrator must be changed by the user at
 * the next sign-in. Defaults to true (temporary password), except when an
 * administrator changes their own password.
 */
function mustChangeAfterAdminReset(body, targetId, me) {
  if (Number(targetId) === Number(me.id)) return false;
  return body.mustChangePassword !== false;
}

module.exports = async (req, res) => {
  const me = await requireAuth(req, res, "users");
  if (!me) return;
  try {
    if (req.method === "GET") {
      const [u, r] = await Promise.all([
        query(
          `SELECT u.id,u.username,u.name,u.email,u.active,u.role_id,r.name role_name,u.created_at,u.updated_at,
                  u.must_change_password,u.locked_until,u.last_login_at,u.password_changed_at
             FROM app_users u JOIN app_roles r ON r.id=u.role_id
            WHERE u.deleted_at IS NULL AND r.deleted_at IS NULL ORDER BY u.name`,
        ),
        query(
          `SELECT id,name FROM app_roles WHERE active=TRUE AND deleted_at IS NULL ORDER BY name`,
        ),
      ]);
      return res.json({
        data: u.rows,
        roles: r.rows,
        passwordPolicy: passwordPolicySummary(),
      });
    }
    const b = req.body || {};
    if (req.method === "POST" && String(req.query?.action || "") === "unlock") {
      if (!b.id) return res.status(400).json({ error: "User id is required." });
      if (!(await unlockAccount(b.id)))
        return res.status(404).json({ error: "User not found." });
      return res.json({ message: "User account unlocked." });
    }
    if (req.method === "POST") {
      if (!b.username || !b.name || !b.password || !b.role_id)
        return res
          .status(400)
          .json({ error: "Username, Name, Password and Role are required." });
      const violation = passwordPolicyViolation(b.password, {
        username: b.username,
        email: b.email,
      });
      if (violation) return res.status(400).json({ error: violation });
      await query(
        `INSERT INTO app_users(username,name,email,password_hash,active,role_id,must_change_password,password_changed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [
          b.username.trim(),
          b.name.trim(),
          b.email?.trim() || null,
          hashPassword(b.password),
          b.active !== false,
          b.role_id,
          b.mustChangePassword !== false,
        ],
      );
      return res.json({ message: "User created successfully." });
    }
    if (req.method === "PUT") {
      if (Number(b.id) === Number(me.id) && b.active === false)
        return res
          .status(400)
          .json({ error: "You cannot deactivate your current user." });
      let sql = `UPDATE app_users SET username=$1,name=$2,email=$3,active=$4,role_id=$5,updated_at=NOW()`;
      const p = [
        b.username.trim(),
        b.name.trim(),
        b.email?.trim() || null,
        b.active !== false,
        b.role_id,
        b.id,
      ];
      if (String(b.password || "").trim()) {
        const violation = passwordPolicyViolation(b.password, {
          username: b.username,
          email: b.email,
        });
        if (violation) return res.status(400).json({ error: violation });
        // Setting a password revokes the user's existing sessions.
        sql += `,password_hash=$7,password_changed_at=$8,must_change_password=$9,failed_login_count=0,locked_until=NULL`;
        p.push(
          hashPassword(b.password),
          new Date(),
          mustChangeAfterAdminReset(b, b.id, me),
        );
      }
      sql += ` WHERE id=$6 AND deleted_at IS NULL`;
      await query(sql, p);
      // Keep the administrator signed in after changing their own password.
      if (String(b.password || "").trim() && Number(b.id) === Number(me.id))
        setSession(res, me);
      return res.json({ message: "User updated successfully." });
    }
    if (req.method === "DELETE") {
      if (Number(b.id) === Number(me.id))
        return res
          .status(400)
          .json({ error: "You cannot delete your current user." });
      await query(
        "UPDATE app_users SET deleted_at=NOW(),deleted_by=$2,active=FALSE,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
        [b.id, me.id],
      );
      return res.json({ message: "User deleted successfully." });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e.code !== "23505") console.error("[users] request failed:", e);
    res.status(e.code === "23505" ? 409 : 500).json({
      error:
        e.code === "23505"
          ? "Username or Email already exists."
          : "Unable to process the user request.",
    });
  }
};
