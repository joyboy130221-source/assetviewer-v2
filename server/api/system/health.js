/** Liveness probe. Contains no configuration or dependency details. */
module.exports = async (req, res) =>
  res.json({ status: "ok", service: "Integration Hub" });
