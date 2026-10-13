const { query } = require("../../lib/db");

/** Readiness probe: verifies database connectivity without exposing errors. */
module.exports = async (req, res) => {
  try {
    const result = await query("SELECT NOW() AS database_time");
    return res.json({
      status: "ok",
      database: "connected",
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error("[health] database connection failed:", error.message);
    return res.status(503).json({ status: "error", database: "unavailable" });
  }
};
