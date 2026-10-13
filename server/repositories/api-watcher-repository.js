const { query } = require("../lib/db");

async function list() {
  const r = await query(`SELECT w.*, o.name organization_name
    FROM api_watchers w JOIN organizations o ON o.id=w.organization_id AND o.deleted_at IS NULL
    WHERE w.deleted_at IS NULL ORDER BY w.updated_at DESC`);
  return r.rows;
}
async function find(id) {
  const r = await query(
    `SELECT w.*, o.name organization_name
    FROM api_watchers w JOIN organizations o ON o.id=w.organization_id AND o.deleted_at IS NULL
    WHERE w.id=$1 AND w.deleted_at IS NULL`,
    [id],
  );
  return r.rows[0] || null;
}
async function create(definition, userId) {
  const r = await query(
    `INSERT INTO api_watchers(id,organization_id,name,description,active,definition,created_by,next_run_at)
    VALUES(gen_random_uuid(),$1,$2,$3,$4,$5::jsonb,$6,NOW()) RETURNING id`,
    [
      definition.organizationId,
      definition.name,
      definition.description || "",
      definition.active !== false,
      JSON.stringify(definition),
      userId,
    ],
  );
  return r.rows[0].id;
}
async function update(definition) {
  const r = await query(
    `UPDATE api_watchers SET organization_id=$2,name=$3,description=$4,active=$5,definition=$6::jsonb,
    updated_at=NOW(), next_run_at=CASE WHEN $5 THEN LEAST(COALESCE(next_run_at,NOW()),NOW()) ELSE next_run_at END
    WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
    [
      definition.id,
      definition.organizationId,
      definition.name,
      definition.description || "",
      definition.active !== false,
      JSON.stringify(definition),
    ],
  );
  return r.rowCount > 0;
}
async function remove(id, userId) {
  const r = await query(
    `UPDATE api_watchers SET deleted_at=NOW(),deleted_by=$2,active=FALSE,updated_at=NOW()
    WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
    [id, userId],
  );
  return r.rowCount > 0;
}
async function setActive(id, active) {
  const r = await query(
    `UPDATE api_watchers
    SET active=$2,
        definition=jsonb_set(COALESCE(definition,'{}'::jsonb),'{active}',to_jsonb($2::boolean),TRUE),
        next_run_at=CASE WHEN $2 THEN NOW() ELSE next_run_at END,
        updated_at=NOW()
    WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
    [id, active],
  );
  return r.rowCount > 0;
}
async function clearSuccessCache(id) {
  const client = await require("../lib/db").getPool().connect();
  try {
    await client.query("BEGIN");
    const watcher = await client.query(
      "SELECT id FROM api_watchers WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [id],
    );
    if (!watcher.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) locked",
      [`api-watcher:${id}`],
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return { busy: true };
    }
    const removed = await client.query(
      "DELETE FROM api_watcher_record_state WHERE watcher_id=$1 AND status='SUCCESS'",
      [id],
    );
    // Epoch deliberately replays previously visible source records on the next run when checkpoint filtering is configured.
    const checkpointResetTo = "1970-01-01T00:00:00.000Z";
    await client.query(
      `INSERT INTO api_watcher_checkpoints(watcher_id,checkpoint_at,updated_at)
      VALUES($1,$2::timestamptz,NOW())
      ON CONFLICT(watcher_id) DO UPDATE SET checkpoint_at=EXCLUDED.checkpoint_at,updated_at=NOW()`,
      [id, checkpointResetTo],
    );
    await client.query(
      "UPDATE api_watchers SET next_run_at=CASE WHEN active THEN NOW() ELSE next_run_at END,updated_at=NOW() WHERE id=$1",
      [id],
    );
    await client.query("COMMIT");
    return { clearedRecords: removed.rowCount, checkpointResetTo };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
async function recentExecutions(watcherId, limit = 50) {
  const r = await query(
    `SELECT * FROM api_watcher_executions WHERE watcher_id=$1 ORDER BY started_at DESC LIMIT $2`,
    [watcherId, limit],
  );
  return r.rows;
}
async function executionLogs(watcherId, executionId) {
  const r = await query(
    `SELECT l.* FROM api_watcher_step_logs l JOIN api_watcher_executions e ON e.id=l.execution_id WHERE l.watcher_id=$1 AND l.execution_id=$2 ORDER BY l.source_record_id NULLS FIRST,l.sequence,l.id`,
    [watcherId, executionId],
  );
  return r.rows;
}
module.exports = {
  list,
  find,
  create,
  update,
  remove,
  setActive,
  clearSuccessCache,
  recentExecutions,
  executionLogs,
};
