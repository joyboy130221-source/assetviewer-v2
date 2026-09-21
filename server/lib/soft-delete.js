/**
 * Shared soft-delete helpers for BIB configuration/master data.
 * Historical/transaction tables intentionally do not use this lifecycle.
 */
const ACTIVE_RECORD = "deleted_at IS NULL";

function softDeleteSql(table, idColumn = "id") {
  // Table/column names are developer-owned constants, never request input.
  return `UPDATE ${table}
             SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
           WHERE ${idColumn} = $1 AND deleted_at IS NULL`;
}

module.exports = { ACTIVE_RECORD, softDeleteSql };
