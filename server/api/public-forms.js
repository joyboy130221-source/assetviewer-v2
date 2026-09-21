const crypto = require("crypto"),
  dns = require("dns").promises,
  net = require("net");
const { query, decryptSecret } = require("../lib/db");
const serviceBus = require("../lib/service-bus");
const { writeMessageBusLog } = require("../lib/message-bus-log");
const {
  render,
  ruleMatches,
  fieldState,
  validateField,
  applyAuthProfile,
} = require("../lib/form-engine");
const { BrowserRpaSession } = require("../lib/browser-rpa");
const {
  execute: executeIntegration,
  getPath,
} = require("../lib/integration-http");
const privateIp = (ip) =>
  ip === "::1" ||
  ip.startsWith("127.") ||
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  ip.startsWith("169.254.") ||
  ip.startsWith("fc") ||
  ip.startsWith("fd") ||
  ip.startsWith("fe80:");
async function safeUrl(raw) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("Only HTTP/HTTPS action URLs are allowed.");
  if (["localhost", "0.0.0.0"].includes(u.hostname))
    throw new Error("Private/local action URLs are not allowed.");
  const ips = net.isIP(u.hostname)
    ? [{ address: u.hostname }]
    : await dns.lookup(u.hostname, { all: true });
  if (ips.some((x) => privateIp(x.address)))
    throw new Error("Private/local action URLs are not allowed.");
  return u;
}
const getQueryContext = (req, allowed = []) => {
  const context = {};
  for (const name of allowed) {
    const value = req.query?.[name];
    if (value !== undefined && !Array.isArray(value))
      context[name] = String(value);
  }
  return context;
};

module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Form id is required." });
    const r = await query(
      `SELECT f.*,o.name organization_name FROM form_definitions f JOIN organizations o ON o.id=f.organization_id WHERE f.id=$1 AND f.status='published' AND f.deleted_at IS NULL AND o.active=TRUE AND o.deleted_at IS NULL`,
      [id],
    );
    const form = r.rows[0];
    if (!form)
      return res.status(404).json({ error: "Published form not found." });

    const settings = form.settings || {};
    const queryContext = getQueryContext(req, settings.queryParams || []);

    if (req.method === "GET") {
      let initialValues = {};
      let integrationError = null;
      if (form.mode === "integrated" && form.source_action?.url) {
        try {
          const sourceAction = await applyAuthProfile(
            render(form.source_action, queryContext),
            query,
          );
          const sourceResult = await executeIntegration(sourceAction);
          if (!sourceResult.ok)
            integrationError = `Source API returned HTTP ${sourceResult.status}`;
          else
            for (const field of form.fields || []) {
              if (field.sourcePath)
                initialValues[field.name] =
                  getPath(sourceResult.data, field.sourcePath) ?? "";
            }
        } catch (error) {
          integrationError = error.message;
        }
      }
      for (const field of form.fields || []) {
        if (initialValues[field.name] === undefined && field.defaultValue)
          initialValues[field.name] = render(field.defaultValue, queryContext);
        if (queryContext[field.name] !== undefined)
          initialValues[field.name] = queryContext[field.name];
      }
      return res.json({
        data: {
          id: form.id,
          organizationId: form.organization_id,
          organizationName: form.organization_name,
          name: form.name,
          description: form.description || "",
          mode: form.mode,
          status: form.status,
          fields: form.fields || [],
          createdAt: form.created_at,
          updatedAt: form.updated_at,
          sourceAction: form.source_action || null,
          queryParams: settings.queryParams || [],
          showSubmitButton: settings.showSubmitButton !== false,
          submitButtonLabel: settings.submitButtonLabel || "Submit Form",
          rules: settings.rules || [],
          responseAction: settings.responseAction || null,
          failureResponse: settings.failureResponse || "",
          theme: settings.theme || "current",
          workflow: settings.workflow || null,
          initialValues,
          integrationError,
        },
      });
    }
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });
    const values = req.body?.values || {};
    const names = (form.fields || []).map((x) => x.name);
    for (const rule of settings.rules || []) {
      if (!ruleMatches(rule, values)) continue;
      for (const action of rule.actions || []) {
        if (action.type === "setValue" && names.includes(action.field))
          values[action.field] = render(action.value || "", values);
      }
    }
    for (const f of form.fields || []) {
      const state = fieldState(f, settings.rules || [], values);
      if (state.hidden || state.disabled) continue;
      const validationError = validateField(f, values[f.name], state.required);
      if (validationError)
        return res.status(400).json({ error: validationError });
    }
    for (const k of Object.keys(values))
      if (!names.includes(k)) delete values[k];
    const sid = crypto.randomUUID();
    await query(
      `INSERT INTO form_submissions(id,form_id,organization_id,values,query_context) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
      [
        sid,
        form.id,
        form.organization_id,
        JSON.stringify(values),
        JSON.stringify(queryContext),
      ],
    );
    const templateContext = { ...queryContext, ...values };
    let actionResult = null;
    const workflowResults = {};
    const workflowExecutionId = crypto.randomUUID();
    const workflowStartedAt = Date.now();
    const workflowSteps = [];

    const persistWorkflowExecution = async (status) => {
      const durationMs = Date.now() - workflowStartedAt;
      await query(
        `INSERT INTO workflow_executions(id,submission_id,form_id,organization_id,status,success,duration_ms,started_at,completed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,TO_TIMESTAMP($8 / 1000.0),NOW())`,
        [
          workflowExecutionId,
          sid,
          form.id,
          form.organization_id,
          status,
          status === "SUCCESS",
          durationMs,
          workflowStartedAt,
        ],
      );
      for (let index = 0; index < workflowSteps.length; index += 1) {
        const step = workflowSteps[index];
        await query(
          `INSERT INTO workflow_step_executions(
             id,workflow_execution_id,step_key,step_name,sequence,success,response_status,duration_ms,
             request_method,request_url,request_headers,request_params,request_body,response_body,error_message
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15)`,
          [
            crypto.randomUUID(),
            workflowExecutionId,
            step.key,
            step.name,
            index + 1,
            step.success,
            step.status,
            step.durationMs,
            step.request?.method || null,
            step.request?.url || null,
            JSON.stringify(sanitize(step.request?.headers || {})),
            JSON.stringify(sanitize(step.request?.params || {})),
            JSON.stringify(sanitize(step.request?.body ?? null)),
            JSON.stringify(sanitize(step.response ?? null)),
            step.error || null,
          ],
        );
      }
      return durationMs;
    };

    const sensitiveKey =
      /authorization|api[-_]?key|x[-_]?api[-_]?key|token|secret|password|credential/i;
    const sanitize = (value) => {
      if (Array.isArray(value)) return value.map(sanitize);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            sensitiveKey.test(key) ? "[REDACTED]" : sanitize(item),
          ]),
        );
      }
      return value;
    };
    const sanitizeUrl = (rawUrl) => {
      try {
        const parsed = new URL(rawUrl);
        for (const key of parsed.searchParams.keys()) {
          if (sensitiveKey.test(key))
            parsed.searchParams.set(key, "[REDACTED]");
        }
        return parsed.toString();
      } catch {
        return rawUrl;
      }
    };

    const runAction = async (rawAction, context, stepKey = null) => {
      let action = await applyAuthProfile(rawAction, query);
      const started = Date.now();
      const logId = crypto.randomUUID();
      let status = null;
      let responseBody = null;
      let error = null;
      let success = false;
      let requestUrl = action.url;
      let resolvedHeaders = {};
      let resolvedParams = {};
      let resolvedBody = {};

      try {
        const url = await safeUrl(render(action.url, context));
        resolvedParams = render(action.params || {}, context);
        Object.entries(resolvedParams).forEach(([key, value]) =>
          url.searchParams.set(key, String(value)),
        );
        requestUrl = url.toString();
        const headers = render(action.headers || {}, context);
        resolvedHeaders = headers;
        let body;
        if (
          !["GET", "HEAD"].includes((action.method || "POST").toUpperCase())
        ) {
          headers["Content-Type"] =
            headers["Content-Type"] || "application/json";
          resolvedBody = render(action.body || {}, context);
          body = JSON.stringify(resolvedBody);
        }
        const response = await fetch(url, {
          method: (action.method || "POST").toUpperCase(),
          headers,
          body,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        status = response.status;
        const text = await response.text();
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = { text: text.slice(0, 10000) };
        }
        success = response.ok;
        if (!success) error = `HTTP ${status}`;
      } catch (executionError) {
        error = executionError.message;
      }

      await query(
        `INSERT INTO form_action_logs(id,submission_id,form_id,organization_id,request_method,request_url,request_headers,request_params,request_body,response_status,response_body,success,duration_ms,error_message) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12,$13,$14)`,
        [
          logId,
          sid,
          form.id,
          form.organization_id,
          (action.method || "POST").toUpperCase(),
          sanitizeUrl(requestUrl),
          JSON.stringify(sanitize(resolvedHeaders)),
          JSON.stringify(sanitize(resolvedParams)),
          JSON.stringify(sanitize(resolvedBody)),
          status,
          responseBody ? JSON.stringify(responseBody) : null,
          success,
          Date.now() - started,
          stepKey ? `[${stepKey}] ${error || ""}`.trim() : error,
        ],
      );

      const durationMs = Date.now() - started;
      return {
        success,
        status,
        error,
        response: responseBody,
        durationMs,
        request: {
          method: (action.method || "POST").toUpperCase(),
          url: sanitizeUrl(requestUrl),
          headers: sanitize(resolvedHeaders),
          params: sanitize(resolvedParams),
          body: sanitize(resolvedBody),
        },
      };
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const runMessageAction = async (messageAction, context) => {
      const started = Date.now();
      const operation = messageAction.operation || "send";
      try {
        const connectionResult = await query(
          "SELECT id,name,connection_string FROM message_bus_connections WHERE id=$1 AND active=TRUE AND deleted_at IS NULL LIMIT 1",
          [messageAction.connectionId],
        );
        const connection = connectionResult.rows[0];
        if (!connection)
          throw new Error("Messaging connection not found or inactive.");
        const destination = render(messageAction.destination || "", context);
        if (operation === "dlqCheck") {
          const destinationType = messageAction.destinationType || "queue";
          const subscription =
            render(messageAction.subscription || "", context) || undefined;
          const messageId = render(messageAction.messageId || "", context);
          if (!destination)
            throw new Error("DLQ Check destination is required.");
          if (!messageId) throw new Error("DLQ Check Message ID is required.");
          const initialWaitSeconds = Math.min(
            Math.max(Number(messageAction.initialWaitSeconds ?? 5), 0),
            300,
          );
          const checkIntervalSeconds = Math.min(
            Math.max(Number(messageAction.checkIntervalSeconds ?? 5), 1),
            300,
          );
          const monitoringWindowSeconds = Math.min(
            Math.max(Number(messageAction.monitoringWindowSeconds ?? 30), 1),
            600,
          );
          const secret = decryptSecret(connection.connection_string);
          if (initialWaitSeconds) await sleep(initialWaitSeconds * 1000);
          const deadline = Date.now() + monitoringWindowSeconds * 1000;
          let checks = 0;
          while (true) {
            checks += 1;
            const check = await serviceBus.checkDeadLetterByMessageId(
              secret,
              destinationType,
              destination,
              subscription,
              messageId,
              100,
            );
            if (check.found) {
              const dead = check.message || {};
              return {
                success: false,
                status: null,
                durationMs: Date.now() - started,
                error:
                  `Message ${messageId} was found in the Dead Letter Queue${dead.subscription ? ` (${dead.subscription})` : ""}. ${dead.deadLetterReason || ""} ${dead.deadLetterErrorDescription || ""}`.trim(),
                request: {
                  method: "MESSAGE:DLQ_CHECK",
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
                },
                response: {
                  status: "DEAD_LETTER",
                  messageId,
                  checks,
                  subscription: dead.subscription || subscription || null,
                  deadLetterReason: dead.deadLetterReason || null,
                  deadLetterDescription:
                    dead.deadLetterErrorDescription || null,
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
            request: {
              method: "MESSAGE:DLQ_CHECK",
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
            },
            response: {
              status: "NOT_FOUND_IN_DLQ",
              messageId,
              checks,
              monitoringWindowSeconds,
              subscription: subscription || null,
            },
          };
        }
        const body = render(messageAction.body || "", context);
        const propertiesText = render(
          messageAction.applicationProperties || "{}",
          context,
        );
        let applicationProperties = {};
        try {
          applicationProperties = propertiesText
            ? JSON.parse(propertiesText)
            : {};
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
          decryptSecret(connection.connection_string),
          messageAction.destinationType || "queue",
          destination,
          {
            body,
            messageFormat,
            contentType,
            messageId,
            correlationId,
            applicationProperties,
          },
        );
        const durationMs = Date.now() - started;
        await writeMessageBusLog({
          source: "WORKFLOW",
          connectionId: connection.id,
          connectionName: connection.name,
          destinationType: messageAction.destinationType || "queue",
          destination,
          messageId: result.messageId || messageId,
          correlationId: result.correlationId || correlationId,
          messageFormat,
          contentType,
          applicationProperties,
          messageBody: body,
          success: true,
          durationMs,
          workflowExecutionId,
        }).catch(() => {});
        return {
          success: true,
          status: null,
          error: null,
          durationMs,
          request: {
            method: "MESSAGE:SEND",
            url: destination,
            headers: {},
            params: {
              connection: connection.name,
              destinationType: messageAction.destinationType || "queue",
            },
            body: { body, applicationProperties },
          },
          response: result,
        };
      } catch (error) {
        await writeMessageBusLog({
          source: "WORKFLOW",
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
          workflowExecutionId,
        }).catch(() => {});
        return {
          success: false,
          status: null,
          error: error.message,
          durationMs: Date.now() - started,
          request: {
            method:
              operation === "dlqCheck" ? "MESSAGE:DLQ_CHECK" : "MESSAGE:SEND",
            url: messageAction.destination || "",
            headers: {},
            params: {},
            body: null,
          },
          response: {},
        };
      }
    };

    const workflow = settings.workflow;
    if (
      workflow?.enabled &&
      Array.isArray(workflow.steps) &&
      workflow.steps.length
    ) {
      const browserRpa = new BrowserRpaSession();
      try {
        for (const step of workflow.steps) {
          const stepType = step?.type || "api";
          if (
            stepType === "api" &&
            (!step?.action?.enabled || !step.action.url)
          )
            continue;
          if (stepType === "browser" && !step?.browser?.action) continue;
          if (
            stepType === "message" &&
            (!step?.message?.connectionId || !step?.message?.destination)
          )
            continue;

          const stepKey = step.key || step.id;
          const stepContext = { ...templateContext, steps: workflowResults };
          let result;
          try {
            result =
              stepType === "browser"
                ? await browserRpa.execute(step.browser, stepContext)
                : stepType === "message"
                  ? await runMessageAction(step.message, stepContext)
                  : await runAction(step.action, stepContext, stepKey);
          } catch (executionError) {
            const failureScreenshot =
              stepType === "browser"
                ? await browserRpa.captureFailureScreenshot()
                : null;
            result = {
              success: false,
              status: null,
              error: executionError.message,
              durationMs: 0,
              request: {
                method:
                  stepType === "browser"
                    ? `BROWSER:${String(step.browser?.action || "UNKNOWN").toUpperCase()}`
                    : stepType === "message"
                      ? (step.message?.operation || "send") === "dlqCheck"
                        ? "MESSAGE:DLQ_CHECK"
                        : "MESSAGE:SEND"
                      : "API",
                url:
                  step.browser?.url ||
                  step.message?.destination ||
                  step.action?.url ||
                  "",
                headers: {},
                params: {
                  selector: step.browser?.selector || null,
                  frameSelector: step.browser?.frameSelector || null,
                  match: step.browser?.match || "single",
                },
                body:
                  step.browser?.value == null
                    ? null
                    : { value: "[REDACTED_IF_SENSITIVE]" },
              },
              response: failureScreenshot
                ? {
                    action: step.browser?.action || "unknown",
                    failureScreenshot,
                  }
                : {},
            };
          }
          const stepExecution = {
            key: stepKey,
            name: step.name || stepKey,
            type: stepType,
            success: result.success,
            status: result.status,
            error: result.error,
            durationMs: result.durationMs,
            request: result.request,
            response: result.response || {},
          };
          workflowResults[stepKey] = stepExecution;
          workflowSteps.push(stepExecution);
          actionResult = result;
          if (!result.success) break;
        }
      } finally {
        await browserRpa.close();
      }
    } else if (form.submit_action?.enabled && form.submit_action.url) {
      actionResult = await runAction(form.submit_action, templateContext);
    }

    if (actionResult && !actionResult.success) {
      const persistedDurationMs = workflow?.enabled
        ? await persistWorkflowExecution("FAILED")
        : Date.now() - workflowStartedAt;
      const failedStep = workflowSteps.find((step) => !step.success) || {
        key: "submitAction",
        name: "Submit Action",
        type: "api",
        success: false,
        error: actionResult.error || "Integration workflow failed.",
        status: actionResult.status ?? null,
        response: actionResult.response || {},
      };
      const safeFailedStep = sanitize(failedStep);
      const safeWorkflowResults = sanitize(workflowResults);
      const failureContext = {
        ...templateContext,
        steps: safeWorkflowResults,
        workflow: {
          status: "FAILED",
          success: false,
          error:
            failedStep.error ||
            actionResult.error ||
            "Integration workflow failed.",
        },
        failedStep: safeFailedStep,
      };
      const failureResponse = settings.failureResponse
        ? render(settings.failureResponse, failureContext)
        : "";
      return res.status(502).json({
        id: sid,
        error: actionResult.error || "Integration workflow failed.",
        failureResponse,
        failedStep: safeFailedStep,
        action: sanitize(actionResult),
        workflow: safeWorkflowResults,
        workflowExecution: {
          workflowExecutionId,
          status: "FAILED",
          success: false,
          durationMs: persistedDurationMs,
          steps: workflowSteps.map(sanitize),
        },
      });
    }

    const persistedWorkflowDurationMs = workflow?.enabled
      ? await persistWorkflowExecution("SUCCESS")
      : Date.now() - workflowStartedAt;

    const responseContext = {
      ...templateContext,
      response: actionResult?.response || {},
      steps: sanitize(workflowResults),
    };
    const responseAction = settings.responseAction?.value
      ? {
          ...settings.responseAction,
          value: render(settings.responseAction.value, responseContext),
        }
      : null;
    return res.status(201).json({
      id: sid,
      action: actionResult,
      workflow: workflowResults,
      workflowExecution: workflow?.enabled
        ? {
            workflowExecutionId,
            status: "SUCCESS",
            success: true,
            durationMs: persistedWorkflowDurationMs,
            steps: workflowSteps,
          }
        : null,
      responseAction,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
