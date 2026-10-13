const { currentUser } = require("../../lib/auth");
module.exports = async (req, res) => {
  try {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ error: "Authentication required." });
    res.json({
      user: {
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role_name,
        permissions: u.permissions,
        mustChangePassword: Boolean(u.must_change_password),
      },
    });
  } catch (e) {
    console.error("[auth] session lookup failed:", e);
    res.status(e.status || 500).json({ error: "Unable to read the session." });
  }
};
