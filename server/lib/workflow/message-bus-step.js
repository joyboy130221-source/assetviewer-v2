/**
 * Reusable "Message Bus" workflow step (Azure Service Bus).
 *
 * Shared by Form Builder workflows and API Watcher chains so both features
 * resolve templates, enforce tenant ownership, log and report results in
 * exactly the same way.
 *
 * Result shape (unchanged from the original Form Builder implementation):
 *   { success, status, error, durationMs, request, response }
 */
const { query, decryptSecret } = require("../db");
const serviceBus = require("../service-bus");
const { writeMessageBusLog } = require("../message-bus-log");
const { render } = require("../form-engine");
const { readWorkflowLimits, clamp } = require("../../config/workflow-limits");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OPERATION_METHOD = {
  send: "MESSAGE:SEND",
  dlqCheck: "MESSAGE:DLQ_CHECK",
};

/**
 * @param {object} options
 * @param {string|null} [options.organizationId] Tenant executing the step. A
 *   connection assigned to another organization is rejected; connections with
 *   no organization are shared.
 * @param {string|null} [options.executionId] Correlates message logs with the
 *   workflow / watcher execution.
 * @param {string} [options.logSource] message_bus_logs.source value.
 * @param {number} [options.maxDlqWindowSeconds] Per-definition ceiling for DLQ
 *   monitoring windows (further bounded by the environment ceiling).
 * @param {object} [options.clientCache] Optional shared Service Bus client
 *   cache. When omitted the runner creates and owns one.
 */
function createMessageBusStepRunner(options = {}) {
  const limits = readWorkflowLimits().message;
  const organizationId = options.organizationId || null;
  const executionId = options.executionId || null;
  const logSource = options.logSource || "WORKFLOW";
  const maxDlqWindowSeconds = clamp(
    options.maxDlqWindowSeconds,
    1,
    limits.maxDlqWindowSeconds,
    limits.maxDlqWindowSeconds,
  );
  const ownsCache = !options.clientCache;
  const clientCache = options.clientCache || serviceBus.createClientCache();
  const connections = new Map();

  async function loadConnection(connectionId) {
    const key = String(connectionId || "");
    if (!key) throw new Error("Messaging connection is required.");
    if (!connections.has(key)) {
      const pending = (async () => {
        const result = await query(
          "SELECT id,name,connection_string,organization_id FROM message_bus_connections WHERE id=$1 AND active=TRUE AND deleted_at IS NULL LIMIT 1",
          [key],
        );
        const row = result.rows[0];
        if (!row)
          throw new Error("Messaging connection not found or inactive.");
        if (
          row.organization_id &&
          organizationId &&
          String(row.organization_id) !== String(organizationId)
        )
          throw Object.assign(
            new Error(
              "Messaging connection is not available for this organization.",
            ),
            { status: 403 },
          );
        return {
          id: row.id,
          name: row.name,
          secret: decryptSecret(row.connection_string),
        };
      })();
      connections.set(key, pending);
      // Do not cache failures; a transient DB error must not poison the run.
      pending.catch(() => connections.delete(key));
    }
    return connections.get(key);
  }

  async function checkDeadLetter(messageAction, context, connection, started) {
    const destination = render(messageAction.destination || "", context);
    const destinationType = messageAction.destinationType || "queue";
    const subscription =
      render(messageAction.subscription || "", context) || undefined;
    const messageId = render(messageAction.messageId || "", context);
    if (!destination) throw new Error("DLQ Check destination is required.");
    if (!messageId) throw new Error("DLQ Check Message ID is required.");
    const initialWaitSeconds = clamp(
      messageAction.initialWaitSeconds,
      0,
      Math.min(300, maxDlqWindowSeconds),
      Math.min(5, maxDlqWindowSeconds),
    );
    const checkIntervalSeconds = clamp(
      messageAction.checkIntervalSeconds,
      1,
      300,
      5,
    );
    const monitoringWindowSeconds = clamp(
      messageAction.monitoringWindowSeconds,
      1,
      maxDlqWindowSeconds,
      Math.min(30, maxDlqWindowSeconds),
    );
    const request = {
      method: OPERATION_METHOD.dlqCheck,
      url: destination,
      headers: {},
      params: {
        connection: connection.name,
        destinationType,
        subscription: subscription || null,
        messageId,
        initialWaitSeconds,
        checkIntervalSeconds,
        monitoringWindowSeconds,
      },
      body: null,
    };
    if (initialWaitSeconds) await sleep(initialWaitSeconds * 1000);
    const deadline = Date.now() + monitoringWindowSeconds * 1000;
    let checks = 0;
    while (true) {
      checks += 1;
      const check = await serviceBus.checkDeadLetterByMessageId(
        connection.secret,
        destinationType,
        destination,
        subscription,
        messageId,
        limits.dlqPeekCount,
        { clientCache },
      );
      if (check.found) {
        const dead = check.message || {};
        return {
          success: false,
          status: null,
          durationMs: Date.now() - started,
          error:
            `Message ${messageId} was found in the Dead Letter Queue${dead.subscription ? ` (${dead.subscription})` : ""}. ${dead.deadLetterReason || ""} ${dead.deadLetterErrorDescription || ""}`.trim(),
          request,
          response: {
            status: "DEAD_LETTER",
            messageId,
            checks,
            subscription: dead.subscription || subscription || null,
            deadLetterReason: dead.deadLetterReason || null,
            deadLetterDescription: dead.deadLetterErrorDescription || null,
            message: dead,
          },
        };
      }
      if (Date.now() >= deadline) break;
      await sleep(
        Math.min(
          checkIntervalSeconds * 1000,
          Math.max(deadline - Date.now(), 0),
        ),
      );
    }
    return {
      success: true,
      status: null,
      error: null,
      durationMs: Date.now() - started,
      request,
      response: {
        status: "NOT_FOUND_IN_DLQ",
        messageId,
        checks,
        monitoringWindowSeconds,
        subscription: subscription || null,
      },
    };
  }

  async function send(messageAction, context, connection, started) {
    const destination = render(messageAction.destination || "", context);
    if (!destination) throw new Error("Message destination is required.");
    const destinationType = messageAction.destinationType || "queue";
    const body = render(messageAction.body || "", context);
    const propertiesText = render(
      messageAction.applicationProperties || "{}",
      context,
    );
    let applicationProperties = {};
    try {
      applicationProperties = propertiesText ? JSON.parse(propertiesText) : {};
    } catch {
      throw new Error(
        "Message application properties must resolve to valid JSON.",
      );
    }
    const messageFormat =
      messageAction.messageFormat ||
      (String(messageAction.contentType || "").includes("xml")
        ? "xml"
        : String(messageAction.contentType || "").includes("text/plain")
          ? "text"
          : "json");
    const contentType = render(
      messageAction.contentType || "application/json",
      context,
    );
    const messageId =
      render(messageAction.messageId || "", context) || undefined;
    const correlationId =
      render(messageAction.correlationId || "", context) || undefined;
    const result = await serviceBus.sendMessage(
      connection.secret,
      destinationType,
      destination,
      {
        body,
        messageFormat,
        contentType,
        messageId,
        correlationId,
        applicationProperties,
      },
      { clientCache },
    );
    const durationMs = Date.now() - started;
    await writeMessageBusLog({
      source: logSource,
      connectionId: connection.id,
      connectionName: connection.name,
      destinationType,
      destination,
      messageId: result.messageId || messageId,
      correlationId: result.correlationId || correlationId,
      messageFormat,
      contentType,
      applicationProperties,
      messageBody: body,
      success: true,
      durationMs,
      workflowExecutionId: executionId,
    }).catch(() => {});
    return {
      success: true,
      status: null,
      error: null,
      durationMs,
      request: {
        method: OPERATION_METHOD.send,
        url: destination,
        headers: {},
        params: { connection: connection.name, destinationType },
        body: { body, applicationProperties },
      },
      response: result,
    };
  }

  /**
   * Executes one Message Bus action. Never throws: failures are returned as
   * `{ success: false, error }` so callers can apply their own stop rules.
   */
  async function run(messageAction = {}, context = {}) {
    const started = Date.now();
    const operation =
      messageAction.operation === "dlqCheck" ? "dlqCheck" : "send";
    try {
      const connection = await loadConnection(messageAction.connectionId);
      return operation === "dlqCheck"
        ? await checkDeadLetter(messageAction, context, connection, started)
        : await send(messageAction, context, connection, started);
    } catch (error) {
      await writeMessageBusLog({
        source: logSource,
        operation: operation === "dlqCheck" ? "DLQ_CHECK" : "SEND",
        destinationType: messageAction.destinationType || "queue",
        destination: render(messageAction.destination || "", context),
        messageFormat: messageAction.messageFormat || null,
        contentType: render(
          messageAction.contentType || "application/json",
          context,
        ),
        messageBody: render(messageAction.body || "", context),
        success: false,
        durationMs: Date.now() - started,
        errorMessage: error.message,
        workflowExecutionId: executionId,
      }).catch(() => {});
      return {
        success: false,
        status: null,
        error: error.message,
        durationMs: Date.now() - started,
        request: {
          method: OPERATION_METHOD[operation],
          url: messageAction.destination || "",
          headers: {},
          params: {},
          body: null,
        },
        response: {},
      };
    }
  }

  async function close() {
    if (ownsCache) await clientCache.close();
  }

  return { run, close };
}

module.exports = { createMessageBusStepRunner };
