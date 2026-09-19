const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "formBuilder");
  if (!user) return;
  try {
    const formId = req.query.formId;
    if (!formId) return res.status(400).json({ error: "formId is required" });
    const subs = (
      await query(
        `SELECT s.*,o.name organization_name FROM form_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.form_id=$1 ORDER BY s.submitted_at DESC`,
        [formId],
      )
    ).rows;
    const logs = (
      await query(
        `SELECT * FROM form_action_logs WHERE form_id=$1 ORDER BY created_at DESC`,
        [formId],
      )
    ).rows;
    return res.json({
      data: subs.map((s) => ({
        id: s.id,
        formId: s.form_id,
        organizationId: s.organization_id,
        organizationName: s.organization_name,
        values: s.values,
        submittedAt: s.submitted_at,
        actionLogs: logs
          .filter((l) => l.submission_id === s.id)
          .map((l) => ({
            id: l.id,
            method: l.request_method,
            url: l.request_url,
            status: l.response_status,
            success: l.success,
            durationMs: l.duration_ms,
            error: l.error_message,
            responseBody: l.response_body,
            createdAt: l.created_at,
          })),
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
