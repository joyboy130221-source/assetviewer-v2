const crypto = require("crypto");
const { query } = require("./db");

const sensitiveKey =
  /authorization|api[-_]?key|token|secret|password|credential|connection[-_]?string/i;
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        sensitiveKey.test(k) ? "[REDACTED]" : redact(v),
      ]),
    );
  }
  return value;
}
function bodyText(body) {
  if (body == null) return null;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(redact(body), null, 2);
  } catch {
    return String(body);
  }
}
async function writeMessageBusLog(entry) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO message_bus_logs(
    id,source,operation,connection_id,connection_name,destination_type,destination,message_id,correlation_id,
    message_format,content_type,application_properties,message_body,success,duration_ms,error_message,
    workflow_execution_id,user_id,created_at
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,NOW())`,
    [
      id,
      entry.source || "MANUAL",
      entry.operation || "SEND",
      entry.connectionId || null,
      entry.connectionName || null,
      entry.destinationType || null,
      entry.destination || null,
      entry.messageId || null,
      entry.correlationId || null,
      entry.messageFormat || null,
      entry.contentType || null,
      JSON.stringify(redact(entry.applicationProperties || {})),
      bodyText(entry.messageBody),
      Boolean(entry.success),
      entry.durationMs ?? null,
      entry.errorMessage || null,
      entry.workflowExecutionId || null,
      entry.userId || null,
    ],
  );
  return id;
}
module.exports = { writeMessageBusLog, redact };
