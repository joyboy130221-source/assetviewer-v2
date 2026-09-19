const crypto = require("crypto"),
  dns = require("dns").promises,
  net = require("net");
const { query } = require("../lib/db");
const {
  render,
  ruleMatches,
  fieldState,
  validateField,
  applyAuthProfile,
} = require("../lib/form-engine");
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
      `SELECT f.*,o.name organization_name FROM form_definitions f JOIN organizations o ON o.id=f.organization_id WHERE f.id=$1 AND f.status='published' AND o.active=TRUE`,
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

    const redactHeaders = (headers = {}) =>
      Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [
          key,
          /authorization|api[-_]?key|token|secret|password/i.test(key)
            ? "[REDACTED]"
            : value,
        ]),
      );

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
          requestUrl,
          JSON.stringify(redactHeaders(resolvedHeaders)),
          JSON.stringify(resolvedParams),
          JSON.stringify(resolvedBody),
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
          url: requestUrl,
          headers: redactHeaders(resolvedHeaders),
          params: resolvedParams,
          body: resolvedBody,
        },
      };
    };

    const workflow = settings.workflow;
    if (
      workflow?.enabled &&
      Array.isArray(workflow.steps) &&
      workflow.steps.length
    ) {
      for (const step of workflow.steps) {
        if (!step?.action?.enabled || !step.action.url) continue;
        const stepKey = step.key || step.id;
        const stepContext = { ...templateContext, steps: workflowResults };
        const result = await runAction(step.action, stepContext, stepKey);
        const stepExecution = {
          key: stepKey,
          name: step.name || stepKey,
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
    } else if (form.submit_action?.enabled && form.submit_action.url) {
      actionResult = await runAction(form.submit_action, templateContext);
    }

    if (actionResult && !actionResult.success) {
      return res.status(502).json({
        id: sid,
        error: actionResult.error || "Integration workflow failed.",
        action: actionResult,
        workflow: workflowResults,
        workflowExecution: {
          workflowExecutionId,
          status: "FAILED",
          success: false,
          durationMs: Date.now() - workflowStartedAt,
          steps: workflowSteps,
        },
      });
    }

    const responseContext = {
      ...templateContext,
      response: actionResult?.response || {},
      steps: workflowResults,
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
            durationMs: Date.now() - workflowStartedAt,
            steps: workflowSteps,
          }
        : null,
      responseAction,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
