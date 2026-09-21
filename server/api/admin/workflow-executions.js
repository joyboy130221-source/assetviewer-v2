const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "workflowExecutions");
  if (!user) return;
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const id = String(req.query.id || "").trim();
    if (id) {
      const execution = (
        await query(
          `SELECT we.*, f.name AS form_name, o.name AS organization_name
           FROM workflow_executions we
           JOIN form_definitions f ON f.id=we.form_id
           JOIN organizations o ON o.id=we.organization_id
          WHERE we.id=$1::uuid`,
          [id],
        )
      ).rows[0];
      if (!execution)
        return res.status(404).json({ error: "Workflow execution not found." });
      const steps = (
        await query(
          `SELECT id,step_key,step_name,sequence,success,response_status,duration_ms,request_method,request_url,
                request_headers,request_params,request_body,response_body,error_message,created_at
           FROM workflow_step_executions WHERE workflow_execution_id=$1::uuid ORDER BY sequence`,
          [id],
        )
      ).rows;
      return res.json({ data: { ...execution, steps } });
    }
    const where = [],
      params = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace("?", `$${params.length}`));
    };
    if (req.query.status)
      add("we.status=?", String(req.query.status).toUpperCase());
    if (req.query.formId) add("we.form_id=?::uuid", req.query.formId);
    if (req.query.organizationId)
      add("we.organization_id=?::uuid", req.query.organizationId);
    else if (String(req.query.organizationSearch || "").trim().length >= 3)
      add(
        "o.name ILIKE '%' || ? || '%'",
        String(req.query.organizationSearch).trim(),
      );
    if (req.query.search)
      add(
        "(we.id::text ILIKE '%' || ? || '%' OR f.name ILIKE '%' || ? || '%')",
        req.query.search,
      );
    // search expression needs same value twice; simplify separately
    if (req.query.search) {
      const v = params.pop();
      where.pop();
      params.push(v, v);
      where.push(
        `(we.id::text ILIKE '%' || $${params.length - 1} || '%' OR f.name ILIKE '%' || $${params.length} || '%')`,
      );
    }
    if (req.query.from) add("we.started_at>=?::timestamptz", req.query.from);
    if (req.query.to) add("we.started_at<=?::timestamptz", req.query.to);
    const result = await query(
      `SELECT we.id,we.submission_id,we.form_id,we.organization_id,we.status,we.success,we.duration_ms,we.started_at,we.completed_at,
              f.name AS form_name,o.name AS organization_name,
              (SELECT COUNT(*)::int FROM workflow_step_executions ws WHERE ws.workflow_execution_id=we.id) AS step_count
         FROM workflow_executions we JOIN form_definitions f ON f.id=we.form_id JOIN organizations o ON o.id=we.organization_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY we.started_at DESC LIMIT 500`,
      params,
    );
    return res.json({ data: result.rows });
  } catch (error) {
    console.error("Workflow executions API error:", error);
    return res.status(500).json({ error: error.message });
  }
};
