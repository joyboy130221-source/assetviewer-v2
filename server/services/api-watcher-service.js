const crypto = require("crypto");
const { query, getPool } = require("../lib/db");
const { execute, getPath } = require("../lib/integration-http");
const {
  setQueryParameter,
  queryParametersForLog,
} = require("../lib/query-params");
const {
  applyAuthProfile,
  refreshManagedAuth,
  render,
} = require("../lib/form-engine");
const { resolveRecords, fieldsOf } = require("./analytics-records");
const { BrowserPool } = require("../lib/browser-rpa");
const {
  createMessageBusStepRunner,
} = require("../lib/workflow/message-bus-step");
const { readWorkflowLimits } = require("../config/workflow-limits");
const {
  stepType,
  enabledSteps,
  eventSteps,
  stepMethod,
  usesStepType,
} = require("./api-watcher-chain");

const clamp = (v, min, max, fallback) =>
  Math.max(min, Math.min(max, Number(v) || fallback));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime()))
    throw Object.assign(new Error(`Invalid Last Updated value: ${value}`), {
      status: 400,
    });
  return d.toISOString();
};
const stringifyValues = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v),
    ]),
  );
function renderDeep(value, context) {
  if (typeof value === "string") return render(value, context);
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, context));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, renderDeep(v, context)]),
    );
  return value;
}
async function preparedAction(action, context, timeoutMs, organizationId) {
  const rendered = renderDeep(action || {}, context);
  const authed = await applyAuthProfile(rendered, query, { organizationId });
  return { ...authed, timeoutMs };
}
function sourceContext(record, system, steps = {}) {
  return { ...stringifyValues(record), ...system, source: record, steps };
}
function maxTimestamp(rows, path, fallback) {
  let max = fallback ? new Date(fallback) : null;
  for (const row of rows) {
    const raw = getPath(row, path);
    if (raw == null) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime()) && (!max || d > max)) max = d;
  }
  return max?.toISOString() || fallback || null;
}
function redactHeaders(headers = {}) {
  const sensitive = /authorization|api[-_]?key|token|secret|cookie/i;
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      sensitive.test(k) ? "[REDACTED]" : String(v),
    ]),
  );
}
function requestBodyText(action) {
  if (action.body == null) return null;
  return typeof action.body === "string"
    ? action.body
    : JSON.stringify(action.body, null, 2);
}
function responseBodyText(response) {
  if (response.text != null) return response.text.slice(0, 100000);
  try {
    return JSON.stringify(response.data, null, 2).slice(0, 100000);
  } catch {
    return String(response.data ?? "").slice(0, 100000);
  }
}
const SENSITIVE_KEY =
  /authorization|api[-_]?key|token|secret|cookie|password|passwd|credential|connection[-_]?string/i;
function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? "[REDACTED]" : redactDeep(v),
      ]),
    );
  return value;
}
function jsonText(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value, null, 2).slice(0, 100000);
  } catch {
    return String(value).slice(0, 100000);
  }
}
/** Object-shaped diagnostics (browser/message params) -> ordered key/value log rows. */
function paramsForLog(params) {
  if (!params || typeof params !== "object" || Array.isArray(params))
    return queryParametersForLog(params);
  return Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([key, v]) => ({
      key,
      value: typeof v === "object" ? JSON.stringify(v) : String(v),
    }));
}
async function logStep({
  executionId,
  watcher,
  sourceRecordId,
  eventType,
  stepType,
  actionType = "api",
  stepKey,
  stepName,
  sequence,
  status,
  success,
  durationMs,
  action,
  response,
  error,
  request,
  responseBody,
}) {
  // `request` / `responseBody` are used by non-REST steps (Browser RPA,
  // Message Bus); REST steps keep the original action/response mapping.
  const method = request?.method ?? action?.method ?? null;
  const url = request?.url ?? action?.url ?? null;
  const headers = request ? request.headers || {} : action?.headers || {};
  const params = request
    ? paramsForLog(request.params)
    : queryParametersForLog(action?.params);
  const bodyTextValue = request
    ? jsonText(request.body == null ? null : redactDeep(request.body))
    : requestBodyText(action);
  await query(
    `INSERT INTO api_watcher_step_logs(execution_id,watcher_id,organization_id,source_record_id,event_type,step_type,step_key,step_name,sequence,status,success,duration_ms,request_method,request_url,request_headers,request_params,request_body,request_content_type,response_status,response_body,response_content_type,error_message,action_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20,$21,$22,$23)`,
    [
      executionId,
      watcher.id,
      watcher.organization_id,
      sourceRecordId || null,
      eventType || null,
      stepType,
      stepKey || null,
      stepName || null,
      sequence,
      status,
      success,
      durationMs,
      method ? String(method).slice(0, 60) : null,
      url || null,
      JSON.stringify(redactHeaders(headers)),
      JSON.stringify(params),
      bodyTextValue,
      request
        ? null
        : action?.headers?.["Content-Type"] ||
          action?.headers?.["content-type"] ||
          null,
      response?.status || null,
      responseBody !== undefined
        ? jsonText(responseBody)
        : response
          ? responseBodyText(response)
          : null,
      responseBody !== undefined
        ? "application/json"
        : response?.contentType || null,
      error?.message || null,
      actionType,
    ],
  );
}
async function executeLogged({
  action,
  context,
  timeoutMs,
  executionId,
  watcher,
  sourceRecordId,
  eventType,
  stepType,
  stepKey,
  stepName,
  sequence,
  actionType = "api",
}) {
  let prepared = await preparedAction(
    action,
    context,
    timeoutMs,
    watcher.organization_id,
  );
  const started = Date.now();
  try {
    let response = await execute(prepared);
    if (
      response.status === 401 &&
      prepared.__authProfileType === "managedBearer"
    ) {
      prepared = await refreshManagedAuth(prepared, query, {
        organizationId: watcher.organization_id,
      });
      response = await execute(prepared);
    }
    await logStep({
      executionId,
      watcher,
      sourceRecordId,
      eventType,
      stepType,
      stepKey,
      stepName,
      sequence,
      actionType,
      status: response.ok ? "SUCCESS" : "FAILED",
      success: response.ok,
      durationMs: Date.now() - started,
      action: prepared,
      response,
      error: response.ok ? null : new Error(`HTTP ${response.status}`),
    });
    return response;
  } catch (error) {
    await logStep({
      executionId,
      watcher,
      sourceRecordId,
      eventType,
      stepType,
      stepKey,
      stepName,
      sequence,
      actionType,
      status: "FAILED",
      success: false,
      durationMs: Date.now() - started,
      action: prepared,
      error,
    });
    throw error;
  }
}
async function testSource(definition) {
  const perf = definition.performance || {};
  let action = await preparedAction(
    definition.source?.action || {},
    {
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      checkpoint: "",
    },
    clamp(perf.timeoutMs, 1000, 120000, 15000),
    definition.organizationId,
  );
  let result = await execute(action);
  if (result.status === 401 && action.__authProfileType === "managedBearer") {
    action = await refreshManagedAuth(action, query, {
      organizationId: definition.organizationId,
    });
    result = await execute(action);
  }
  if (!result.ok)
    throw Object.assign(
      new Error(`Source API returned HTTP ${result.status}.`),
      { status: result.status, details: result.data },
    );
  const resolved = resolveRecords(
    result.data,
    definition.source?.recordsPath || "",
  );
  return {
    status: result.status,
    recordsPath: resolved.path,
    candidates: resolved.candidates,
    fields: fieldsOf(resolved.rows),
    sample: resolved.rows.slice(0, 3),
    count: resolved.rows.length,
  };
}
/**
 * Resolves the effective performance settings of a watcher. Every value is
 * clamped; ceilings for Browser RPA / Message Bus come from the environment
 * (server/config/workflow-limits.js) so operators can tune them per
 * deployment without code changes.
 */
function performanceSettings(perf = {}) {
  const limits = readWorkflowLimits();
  return {
    intervalSeconds: boundedInt(perf.intervalSeconds, 60, 86400, 300),
    timeoutMs: boundedInt(perf.timeoutMs, 1000, 120000, 15000),
    maxRecords: boundedInt(perf.maxRecordsPerRun, 1, 10000, 1000),
    concurrency: boundedInt(perf.concurrency, 1, 20, 5),
    retries: boundedInt(perf.retryCount, 0, 5, 2),
    overlapSeconds: boundedInt(perf.overlapSeconds, 0, 300, 5),
    maxEnrichmentSteps: boundedInt(
      perf.maxEnrichmentSteps,
      0,
      limits.maxChainSteps,
      10,
    ),
    maxEventSteps: boundedInt(perf.maxEventSteps, 1, limits.maxChainSteps, 10),
    browserConcurrency: boundedInt(
      perf.browserConcurrency,
      1,
      limits.browser.maxConcurrency,
      Math.min(2, limits.browser.maxConcurrency),
    ),
    browserTimeoutMs: boundedInt(
      perf.browserTimeoutMs,
      1000,
      limits.browser.maxTimeoutMs,
      Math.min(30000, limits.browser.maxTimeoutMs),
    ),
    maxDlqWindowSeconds: boundedInt(
      perf.maxDlqWindowSeconds,
      1,
      limits.message.maxDlqWindowSeconds,
      Math.min(30, limits.message.maxDlqWindowSeconds),
    ),
  };
}
/** Like clamp() but keeps an explicit 0 (e.g. Retry Count = 0). */
function boundedInt(value, min, max, fallback) {
  const n = Number(value);
  if (value === "" || value == null || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

const SENSITIVE_SELECTOR = /pass(word|wd)?|secret|token|otp|pin\b|credential/i;
/** Browser request diagnostics with typed secrets removed. */
function browserRequestForLog(request, step) {
  const sensitive =
    ["fill", "select"].includes(step.browser?.action) &&
    SENSITIVE_SELECTOR.test(String(step.browser?.selector || ""));
  return sensitive && request?.body
    ? { ...request, body: { value: "[REDACTED]" } }
    : request;
}

/**
 * Executes enrichment and event chains for one watcher run. Owns the
 * run-scoped resources (shared browser, Service Bus connections) so they are
 * opened at most once per run and always released.
 */
function createChainRunner({ watcher, executionId, settings }) {
  const definition = watcher.definition || {};
  const browserPool = usesStepType(definition, "browser")
    ? new BrowserPool({
        maxConcurrency: settings.browserConcurrency,
        maxTimeoutMs: settings.browserTimeoutMs,
        defaultTimeoutMs: settings.browserTimeoutMs,
      })
    : null;
  const messageRunner = usesStepType(definition, "message")
    ? createMessageBusStepRunner({
        organizationId: watcher.organization_id,
        executionId,
        logSource: "API_WATCHER",
        maxDlqWindowSeconds: settings.maxDlqWindowSeconds,
      })
    : null;

  async function runApiStep(step, ctx, log) {
    const response = await executeLogged({
      ...log,
      action: step.action,
      context: ctx,
      timeoutMs: settings.timeoutMs,
      actionType: "api",
    });
    if (!response.ok)
      throw new Error(
        `${log.stepType === "ENRICHMENT" ? "Enrichment" : "Event action"} step '${log.stepName}' returned HTTP ${response.status}.`,
      );
    return response.data;
  }

  async function runBrowserStep(step, ctx, log, attempt) {
    if (!browserPool)
      throw new Error("Browser RPA is not available for this run.");
    // One isolated browser context per record attempt: enrichment and event
    // steps of the same record share cookies/page state (e.g. login first).
    if (!attempt.browserSession)
      attempt.browserSession = browserPool.createSession();
    const session = attempt.browserSession;
    const started = Date.now();
    try {
      const result = await session.execute(step.browser, ctx);
      await logStep({
        ...log,
        actionType: "browser",
        status: "SUCCESS",
        success: true,
        durationMs: Date.now() - started,
        request: browserRequestForLog(result.request, step),
        responseBody: result.response,
      });
      return result.response;
    } catch (error) {
      const failureScreenshot = await session.captureFailureScreenshot();
      await logStep({
        ...log,
        actionType: "browser",
        status: "FAILED",
        success: false,
        durationMs: Date.now() - started,
        request: {
          method: stepMethod(step),
          url: render(step.browser?.url || "", ctx) || null,
          headers: {},
          params: {
            selector: render(step.browser?.selector || "", ctx) || null,
            frameSelector: step.browser?.frameSelector || null,
            match: step.browser?.match || "single",
          },
          body: null,
        },
        responseBody: failureScreenshot ? { failureScreenshot } : undefined,
        error,
      });
      throw new Error(
        `Browser step '${log.stepName}' failed: ${error.message}`,
      );
    }
  }

  async function runMessageStep(step, ctx, log, sentMessages) {
    if (!messageRunner)
      throw new Error("Message Bus is not available for this run.");
    const isSend = step.message?.operation !== "dlqCheck";
    const reuseKey = `${log.stepType}:${step.id || step.key}`;
    // A record retry must not publish the same message twice: a message that
    // was already sent in an earlier attempt of this record is reused.
    if (isSend && sentMessages.has(reuseKey)) {
      const previous = sentMessages.get(reuseKey);
      await logStep({
        ...log,
        actionType: "message",
        status: "REUSED",
        success: true,
        durationMs: 0,
        request: previous.request,
        responseBody: previous.response,
      });
      return previous.response;
    }
    const result = await messageRunner.run(step.message, ctx);
    await logStep({
      ...log,
      actionType: "message",
      status: result.success ? "SUCCESS" : "FAILED",
      success: result.success,
      durationMs: result.durationMs || 0,
      request: result.request,
      responseBody: result.response || {},
      error: result.success ? null : new Error(result.error),
    });
    if (!result.success)
      throw new Error(`Message step '${log.stepName}' failed: ${result.error}`);
    if (isSend) sentMessages.set(reuseKey, result);
    return result.response;
  }

  /**
   * Runs a chain sequentially. Each step's output is published to
   * `scope[step.key]` so later steps can use {{steps.<key>...}}.
   * Throws on the first failing step.
   */
  async function runChain(
    steps,
    { job, stage, scope, system, attempt, sentMessages, sequence },
  ) {
    let last = null;
    for (const step of steps) {
      const ctx = sourceContext(job.record, system, scope);
      const log = {
        executionId,
        watcher,
        sourceRecordId: job.sourceId,
        eventType: job.eventType,
        stepType: stage,
        stepKey: step.key,
        stepName: step.name || step.key,
        sequence: sequence.next++,
      };
      const type = stepType(step);
      const data =
        type === "browser"
          ? await runBrowserStep(step, ctx, log, attempt)
          : type === "message"
            ? await runMessageStep(step, ctx, log, sentMessages)
            : await runApiStep(step, ctx, log);
      scope[step.key] = data;
      last = { step, data };
    }
    return last;
  }

  async function close() {
    await Promise.all([
      browserPool ? browserPool.close() : null,
      messageRunner ? messageRunner.close() : null,
    ]);
  }

  return { runChain, close };
}

/** Target record id from the configured (or last) event chain step. */
function resolveTargetId(eventAction, last, scope, previous) {
  const path = eventAction?.targetRecordIdPath || "";
  const fallback = previous?.target_record_id ?? "";
  if (!path) return String(fallback);
  const key = eventAction?.targetRecordIdStepKey;
  const data = key ? scope[key] : last?.data;
  return String(getPath(data, path) ?? fallback);
}

async function runWatcher(watcher, options = {}) {
  const started = Date.now(),
    executionId = crypto.randomUUID(),
    definition = watcher.definition || {},
    settings = performanceSettings(definition.performance || {});
  const { intervalSeconds, timeoutMs, maxRecords, concurrency, retries } =
    settings;
  const client = await getPool().connect();
  let locked = false,
    chainRunner = null,
    counts = { received: 0, new: 0, modified: 0, ignored: 0, failed: 0 };
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) locked",
      [`api-watcher:${watcher.id}`],
    );
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked)
      return { skipped: true, reason: "Watcher is already running." };
    await query(
      `INSERT INTO api_watcher_executions(id,watcher_id,organization_id,status,started_at) VALUES($1,$2,$3,'RUNNING',NOW())`,
      [executionId, watcher.id, watcher.organization_id],
    );
    const state = (
      await query(
        "SELECT checkpoint_at FROM api_watcher_checkpoints WHERE watcher_id=$1",
        [watcher.id],
      )
    ).rows[0];
    let checkpoint = state?.checkpoint_at
      ? new Date(state.checkpoint_at).toISOString()
      : null;
    if (!checkpoint) {
      const mode = definition.changeDetection?.initialMode || "startNow";
      if (mode === "startNow") {
        checkpoint = new Date().toISOString();
        await query(
          `INSERT INTO api_watcher_checkpoints(watcher_id,checkpoint_at,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(watcher_id) DO UPDATE SET checkpoint_at=EXCLUDED.checkpoint_at,updated_at=NOW()`,
          [watcher.id, checkpoint],
        );
      } else if (
        mode === "startAt" &&
        definition.changeDetection?.initialStartAt
      )
        checkpoint = iso(definition.changeDetection.initialStartAt);
    }
    const overlapSeconds = settings.overlapSeconds,
      from = checkpoint
        ? new Date(
            new Date(checkpoint).getTime() - overlapSeconds * 1000,
          ).toISOString()
        : null,
      sourceAction = JSON.parse(
        JSON.stringify(definition.source?.action || {}),
      ),
      cpParam = definition.source?.checkpointParam;
    if (from && cpParam)
      sourceAction.params = setQueryParameter(
        sourceAction.params,
        cpParam,
        from,
      );
    const sourceResult = await executeLogged({
      action: sourceAction,
      context: {
        checkpoint: from || "",
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      timeoutMs,
      executionId,
      watcher,
      stepType: "SOURCE",
      stepName: "Source API",
      sequence: 0,
    });
    if (!sourceResult.ok)
      throw Object.assign(
        new Error(`Source API returned HTTP ${sourceResult.status}.`),
        { status: sourceResult.status },
      );
    const resolved = resolveRecords(
        sourceResult.data,
        definition.source?.recordsPath || "",
      ),
      rows = resolved.rows.slice(0, maxRecords);
    counts.received = rows.length;
    const idPath = definition.changeDetection?.recordIdField,
      updatedPath = definition.changeDetection?.lastUpdatedField;
    if (!idPath || !updatedPath)
      throw Object.assign(
        new Error("Record ID Field and Last Updated Field are required."),
        { status: 400 },
      );
    const ids = [
        ...new Set(
          rows.map((r) => String(getPath(r, idPath) ?? "")).filter(Boolean),
        ),
      ],
      existing = new Map();
    if (ids.length) {
      const r = await query(
        `SELECT source_record_id,source_last_updated_on,target_record_id FROM api_watcher_record_state WHERE watcher_id=$1 AND source_record_id=ANY($2::text[])`,
        [watcher.id, ids],
      );
      for (const x of r.rows) existing.set(x.source_record_id, x);
    }
    const enrichment = enabledSteps(definition.enrichmentSteps).slice(
      0,
      settings.maxEnrichmentSteps,
    );
    const chains = {
      NEW: eventSteps(definition.events?.onNew, "NEW").slice(
        0,
        settings.maxEventSteps,
      ),
      MODIFIED: eventSteps(definition.events?.onModified, "MODIFIED").slice(
        0,
        settings.maxEventSteps,
      ),
    };
    const jobs = [];
    for (const record of rows) {
      const sourceId = String(getPath(record, idPath) ?? "");
      if (!sourceId) {
        counts.failed++;
        continue;
      }
      const currentUpdated = iso(getPath(record, updatedPath)),
        previous = existing.get(sourceId);
      if (
        previous &&
        new Date(currentUpdated) <= new Date(previous.source_last_updated_on)
      ) {
        counts.ignored++;
        continue;
      }
      const eventType = previous ? "MODIFIED" : "NEW",
        action =
          eventType === "NEW"
            ? definition.events?.onNew
            : definition.events?.onModified;
      if (!action?.enabled || !chains[eventType].length) {
        counts.ignored++;
        continue;
      }
      jobs.push({
        record,
        sourceId,
        currentUpdated,
        previous,
        eventType,
        action,
        steps: chains[eventType],
      });
    }
    if (jobs.length)
      chainRunner = createChainRunner({ watcher, executionId, settings });
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const sentMessages = new Map();
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
          const attemptState = { browserSession: null };
          try {
            const scope = {},
              sequence = { next: 1 },
              system = {
                sourceRecordId: job.sourceId,
                targetRecordId: job.previous?.target_record_id || "",
                eventType: job.eventType,
                watcherId: watcher.id,
                uuid: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                checkpoint: from || "",
              };
            const chainOptions = {
              job,
              scope,
              system,
              attempt: attemptState,
              sentMessages,
              sequence,
            };
            await chainRunner.runChain(enrichment, {
              ...chainOptions,
              stage: "ENRICHMENT",
            });
            const last = await chainRunner.runChain(job.steps, {
              ...chainOptions,
              stage: "EVENT_ACTION",
            });
            const targetId = resolveTargetId(
              job.action,
              last,
              scope,
              job.previous,
            );
            await query(
              `INSERT INTO api_watcher_record_state(watcher_id,organization_id,source_record_id,source_last_updated_on,target_record_id,status,last_processed_at) VALUES($1,$2,$3,$4,$5,'SUCCESS',NOW()) ON CONFLICT(watcher_id,source_record_id) DO UPDATE SET source_last_updated_on=EXCLUDED.source_last_updated_on,target_record_id=COALESCE(NULLIF(EXCLUDED.target_record_id,''),api_watcher_record_state.target_record_id),status='SUCCESS',last_error=NULL,last_processed_at=NOW(),updated_at=NOW()`,
              [
                watcher.id,
                watcher.organization_id,
                job.sourceId,
                job.currentUpdated,
                targetId,
              ],
            );
            if (job.eventType === "NEW") counts.new++;
            else counts.modified++;
            lastError = null;
            break;
          } catch (e) {
            lastError = e;
            if (attempt < retries)
              await sleep(Math.min(5000, 500 * Math.pow(2, attempt)));
          } finally {
            if (attemptState.browserSession)
              await attemptState.browserSession.close();
          }
        }
        if (lastError) {
          counts.failed++;
          if (job.previous)
            await query(
              `UPDATE api_watcher_record_state SET status='FAILED',last_error=$3,last_processed_at=NOW(),updated_at=NOW() WHERE watcher_id=$1 AND source_record_id=$2`,
              [watcher.id, job.sourceId, lastError.message],
            );
        }
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(1, jobs.length)) },
        () => worker(),
      ),
    );
    const nextCheckpoint =
      counts.failed === 0
        ? maxTimestamp(rows, updatedPath, checkpoint)
        : checkpoint;
    if (nextCheckpoint)
      await query(
        `INSERT INTO api_watcher_checkpoints(watcher_id,checkpoint_at,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(watcher_id) DO UPDATE SET checkpoint_at=EXCLUDED.checkpoint_at,updated_at=NOW()`,
        [watcher.id, nextCheckpoint],
      );
    await query(
      `UPDATE api_watchers SET last_run_at=NOW(),next_run_at=NOW()+($2||' seconds')::interval,last_status=$3,updated_at=NOW() WHERE id=$1`,
      [watcher.id, intervalSeconds, counts.failed ? "PARTIAL" : "SUCCESS"],
    );
    await query(
      `UPDATE api_watcher_executions SET status=$2,success=$3,duration_ms=$4,records_received=$5,new_records=$6,modified_records=$7,ignored_records=$8,failed_records=$9,completed_at=NOW() WHERE id=$1`,
      [
        executionId,
        counts.failed ? "PARTIAL" : "SUCCESS",
        counts.failed === 0,
        Date.now() - started,
        counts.received,
        counts.new,
        counts.modified,
        counts.ignored,
        counts.failed,
      ],
    );
    return {
      executionId,
      ...counts,
      checkpoint: nextCheckpoint,
      status: counts.failed ? "PARTIAL" : "SUCCESS",
    };
  } catch (e) {
    if (executionId)
      await query(
        `UPDATE api_watcher_executions SET status='FAILED',success=FALSE,duration_ms=$2,error_message=$3,completed_at=NOW() WHERE id=$1`,
        [executionId, Date.now() - started, e.message],
      ).catch(() => {});
    await query(
      `UPDATE api_watchers SET last_run_at=NOW(),next_run_at=NOW()+($2||' seconds')::interval,last_status='FAILED',updated_at=NOW() WHERE id=$1`,
      [watcher.id, intervalSeconds],
    ).catch(() => {});
    throw e;
  } finally {
    if (chainRunner) await chainRunner.close().catch(() => {});
    if (locked)
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1))", [
          `api-watcher:${watcher.id}`,
        ])
        .catch(() => {});
    client.release();
  }
}
async function runDue(limit = 20) {
  const r = await query(
    `SELECT * FROM api_watchers WHERE active=TRUE AND deleted_at IS NULL AND (next_run_at IS NULL OR next_run_at<=NOW()) ORDER BY next_run_at NULLS FIRST LIMIT $1`,
    [limit],
  );
  const results = [];
  for (const w of r.rows) {
    try {
      results.push({ id: w.id, result: await runWatcher(w) });
    } catch (e) {
      results.push({ id: w.id, error: e.message });
    }
  }
  return results;
}
module.exports = {
  testSource,
  runWatcher,
  runDue,
  // Exported for unit tests and reuse.
  performanceSettings,
  resolveTargetId,
  createChainRunner,
};
