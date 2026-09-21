const { query, decryptSecret } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const serviceBus = require("../../lib/service-bus");

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "messageBusLogs");
  if (!user) return;
  try {
    if (
      req.method === "POST" &&
      String(req.query?.op || "") === "checkDelivery"
    ) {
      const id = String(req.body?.id || "").trim();
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!id)
        return res
          .status(400)
          .json({ error: "Service Bus log ID is required." });
      if (!uuidPattern.test(id))
        return res.status(400).json({ error: "Invalid Service Bus log ID." });
      const found = await query(
        `SELECT l.*, c.connection_string FROM message_bus_logs l LEFT JOIN message_bus_connections c ON c.id=l.connection_id WHERE l.id=$1::uuid LIMIT 1`,
        [id],
      );
      const log = found.rows[0];
      if (!log)
        return res.status(404).json({ error: "Service Bus log not found." });
      if (!log.success)
        return res.status(400).json({
          error:
            "The message was not sent successfully, so downstream delivery cannot be checked.",
        });
      if (!log.connection_string)
        return res.status(400).json({
          error: "The original Service Bus connection is no longer available.",
        });
      if (!log.message_id)
        return res.status(400).json({
          error:
            "This older log has no Message ID and cannot be correlated reliably.",
        });
      const secret = decryptSecret(log.connection_string);
      const messages = await serviceBus.peekDeadLetters(
        secret,
        log.destination_type,
        log.destination,
        req.body?.subscription || null,
        100,
      );
      const match = messages.find(
        (m) =>
          String(m.messageId || "") === String(log.message_id) ||
          (log.correlation_id &&
            String(m.correlationId || "") === String(log.correlation_id)),
      );
      if (match) {
        await query(
          `UPDATE message_bus_logs SET delivery_status='DEAD_LETTER', dead_letter_reason=$1, dead_letter_description=$2, dead_letter_subscription=$3, delivery_checked_at=NOW() WHERE id=$4`,
          [
            match.deadLetterReason,
            match.deadLetterErrorDescription,
            match.subscription,
            id,
          ],
        );
      } else {
        await query(
          `UPDATE message_bus_logs SET delivery_status='NOT_FOUND_IN_DLQ', dead_letter_reason=NULL, dead_letter_description=NULL, dead_letter_subscription=NULL, delivery_checked_at=NOW() WHERE id=$1`,
          [id],
        );
      }
      const refreshed = await query(
        `SELECT id,delivery_status,dead_letter_reason,dead_letter_description,dead_letter_subscription,delivery_checked_at FROM message_bus_logs WHERE id=$1`,
        [id],
      );
      return res.json({
        data: refreshed.rows[0],
        inspectedDeadLetterMessages: messages.length,
      });
    }
    if (req.method !== "GET")
      return res.status(405).json({ error: "Method not allowed" });
    const q = req.query || {},
      values = [],
      where = [];
    const add = (sql, v) => {
      values.push(v);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (q.source) add("source=?", String(q.source).toUpperCase());
    if (q.connection) add("connection_name=?", String(q.connection));
    if (q.destination) add("destination=?", String(q.destination));
    if (q.format) add("message_format=?", String(q.format).toLowerCase());
    if (q.delivery) add("delivery_status=?", String(q.delivery).toUpperCase());
    if (q.result === "success") where.push("success=TRUE");
    if (q.result === "error") where.push("success=FALSE");
    if (q.from) add("created_at>=?", q.from);
    if (q.to) add("created_at<=?", q.to);
    if (q.search) {
      values.push(`%${String(q.search).trim()}%`);
      const n = values.length;
      where.push(
        `(COALESCE(destination,'') ILIKE $${n} OR COALESCE(message_id,'') ILIKE $${n} OR COALESCE(correlation_id,'') ILIKE $${n} OR COALESCE(error_message,'') ILIKE $${n} OR COALESCE(dead_letter_reason,'') ILIKE $${n})`,
      );
    }
    values.push(Math.min(Math.max(Number(q.limit) || 100, 1), 200));
    const cols =
      "id,source,operation,connection_name,destination_type,destination,message_id,correlation_id,message_format,content_type,application_properties,message_body,success,duration_ms,error_message,workflow_execution_id,created_at,delivery_status,dead_letter_reason,dead_letter_description,dead_letter_subscription,delivery_checked_at";
    const [logs, connections] = await Promise.all([
      query(
        `SELECT ${cols} FROM message_bus_logs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      ),
      query(
        `SELECT DISTINCT connection_name FROM message_bus_logs WHERE connection_name IS NOT NULL ORDER BY connection_name`,
      ),
    ]);
    res.json({
      data: logs.rows,
      connections: connections.rows.map((x) => x.connection_name),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
