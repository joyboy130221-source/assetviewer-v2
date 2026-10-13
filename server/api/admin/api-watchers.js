const repo = require("../../repositories/api-watcher-repository");
const { requireAuth } = require("../../lib/auth");
const {
  testSource,
  runWatcher,
} = require("../../services/api-watcher-service");
const { query } = require("../../lib/db");
const { validatedQueryParameters } = require("../../lib/query-params");
const { readWorkflowLimits } = require("../../config/workflow-limits");
const {
  stepType,
  validateChain,
  chainKeys,
  referencedConnectionIds,
} = require("../../services/api-watcher-chain");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeDefinition(d) {
  const action = (a) =>
    a ? { ...a, params: validatedQueryParameters(a.params) } : a;
  // Steps without a type are legacy REST steps. Only REST steps carry query
  // parameters, so only they are normalized/validated by the HTTP layer.
  const step = (x) => {
    const type = stepType(x);
    return type === "api"
      ? { ...x, type, action: action(x.action) }
      : { ...x, type };
  };
  const event = (e) =>
    e
      ? {
          ...e,
          action: action(e.action),
          ...(Array.isArray(e.steps) ? { steps: e.steps.map(step) } : {}),
        }
      : e;
  return {
    ...d,
    source: d.source
      ? { ...d.source, action: action(d.source.action) }
      : d.source,
    enrichmentSteps: (d.enrichmentSteps || []).map(step),
    events: d.events
      ? {
          ...d.events,
          onNew: event(d.events.onNew),
          onModified: event(d.events.onModified),
        }
      : d.events,
  };
}
function validate(d) {
  if (!d?.name?.trim()) return "Name is required.";
  if (!d?.organizationId) return "Organization is required.";
  if (!d?.source?.action?.url) return "Source API URL is required.";
  if (!d?.changeDetection?.recordIdField) return "Record ID Field is required.";
  if (!d?.changeDetection?.lastUpdatedField)
    return "Last Updated Field is required.";
  const { maxChainSteps } = readWorkflowLimits();
  const chainError = validateChain(
    d.enrichmentSteps,
    "Enrichment",
    maxChainSteps,
  );
  if (chainError) return chainError;
  const reserved = chainKeys(d.enrichmentSteps);
  for (const [label, event] of [
    ["New Record event", d.events?.onNew],
    ["Modified Record event", d.events?.onModified],
  ]) {
    if (!event || !Array.isArray(event.steps)) continue;
    const error = validateChain(event.steps, label, maxChainSteps, reserved);
    if (error) return error;
    if (
      event.targetRecordIdStepKey &&
      !chainKeys(event.steps).has(event.targetRecordIdStepKey)
    )
      return `${label}: Target Record ID step '${event.targetRecordIdStepKey}' does not exist in the chain.`;
  }
  return null;
}
/** Ensures every referenced Service Bus connection is usable by the tenant. */
async function validateConnections(d) {
  const ids = referencedConnectionIds(d);
  if (!ids.length) return null;
  if (ids.some((id) => !/^\d+$/.test(id)))
    return "A Message Bus step references an invalid connection.";
  const r = await query(
    "SELECT id,name,organization_id FROM message_bus_connections WHERE id=ANY($1::bigint[]) AND active=TRUE AND deleted_at IS NULL",
    [ids],
  );
  const byId = new Map(r.rows.map((x) => [String(x.id), x]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row)
      return "A Message Bus step references a connection that is missing or inactive.";
    if (
      row.organization_id &&
      String(row.organization_id) !== String(d.organizationId)
    )
      return `Messaging connection '${row.name}' is not available for this organization.`;
  }
  return null;
}
async function messageConnectionLookup(organizationId) {
  const org = UUID_PATTERN.test(String(organizationId || ""))
    ? String(organizationId)
    : null;
  const r = await query(
    `SELECT id,name,organization_id FROM message_bus_connections
     WHERE active=TRUE AND deleted_at IS NULL AND (organization_id IS NULL OR organization_id=$1::uuid)
     ORDER BY name`,
    [org],
  );
  return r.rows.map((x) => ({
    id: String(x.id),
    name: x.name,
    organizationId: x.organization_id || null,
  }));
}
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "apiWatchers");
  if (!user) return;
  try {
    const action = String(req.query?.action || "");
    if (req.method === "GET") {
      // Safe lookup (id/name only) so designers do not need the Messaging
      // permission to pick a connection for a Message Bus step.
      if (req.query?.lookup === "messageConnections")
        return res.json({
          data: await messageConnectionLookup(req.query?.organizationId),
        });
      if (req.query?.id) {
        const item = await repo.find(req.query.id);
        if (!item)
          return res.status(404).json({ error: "API Watcher not found." });
        return res.json({ data: item });
      }
      if (req.query?.executionLogs && req.query?.watcherId) {
        return res.json({
          data: await repo.executionLogs(
            String(req.query.watcherId),
            String(req.query.executionLogs),
          ),
        });
      }
      if (req.query?.executions) {
        return res.json({
          data: await repo.recentExecutions(req.query.executions),
        });
      }
      return res.json({ data: await repo.list() });
    }
    if (req.method === "POST" && action === "test")
      return res.json({ data: await testSource(req.body?.definition || {}) });
    if (req.method === "POST" && action === "run") {
      const item = await repo.find(req.body?.id);
      if (!item)
        return res.status(404).json({ error: "API Watcher not found." });
      return res.json({ data: await runWatcher(item, { manual: true }) });
    }
    if (req.method === "POST" && action === "set-active") {
      const id = String(req.body?.id || "");
      const active = req.body?.active;
      if (!id || typeof active !== "boolean")
        return res
          .status(400)
          .json({ error: "Watcher id and boolean active value are required." });
      if (!(await repo.setActive(id, active)))
        return res.status(404).json({ error: "API Watcher not found." });
      return res.json({
        message: active ? "API Watcher started." : "API Watcher stopped.",
      });
    }
    if (req.method === "POST" && action === "clear-success-cache") {
      const id = String(req.body?.id || "");
      if (!id)
        return res.status(400).json({ error: "Watcher id is required." });
      const result = await repo.clearSuccessCache(id);
      if (!result)
        return res.status(404).json({ error: "API Watcher not found." });
      if (result.busy)
        return res.status(409).json({
          error:
            "API Watcher is currently running. Stop it or wait for the active execution to finish before clearing cache.",
        });
      return res.json({
        data: result,
        message:
          "Successful processing cache cleared. Monitoring history was retained.",
      });
    }
    if (req.method === "POST") {
      const d = req.body?.definition || req.body,
        err = validate(d);
      if (err) return res.status(400).json({ error: err });
      const org = await query(
        "SELECT id FROM organizations WHERE id=$1 AND active=TRUE AND deleted_at IS NULL",
        [d.organizationId],
      );
      if (!org.rowCount)
        return res.status(400).json({ error: "Organization is unavailable." });
      const connectionError = await validateConnections(d);
      if (connectionError)
        return res.status(400).json({ error: connectionError });
      return res.status(201).json({
        id: await repo.create(normalizeDefinition(d), user.id),
        message: "API Watcher created.",
      });
    }
    if (req.method === "PUT") {
      const d = req.body?.definition || req.body,
        err = validate(d);
      if (err) return res.status(400).json({ error: err });
      const connectionError = await validateConnections(d);
      if (connectionError)
        return res.status(400).json({ error: connectionError });
      if (!(await repo.update(normalizeDefinition(d))))
        return res.status(404).json({ error: "API Watcher not found." });
      return res.json({ message: "API Watcher updated." });
    }
    if (req.method === "DELETE") {
      if (!(await repo.remove(req.body?.id, user.id)))
        return res.status(404).json({ error: "API Watcher not found." });
      return res.json({ message: "API Watcher deleted." });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.message, details: e.details });
  }
};
