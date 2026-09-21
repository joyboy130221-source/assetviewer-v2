const { query } = require("../lib/db");

const base = `SELECT a.*, o.name AS organization_name
  FROM analytics_definitions a
  JOIN organizations o ON o.id = a.organization_id`;

async function find(id) {
  return query(
    `${base}${id ? " WHERE a.id = $1::uuid" : ""} ORDER BY a.updated_at DESC`,
    id ? [id] : [],
  );
}

async function create(d) {
  return query(
    `INSERT INTO analytics_definitions(
      id, organization_id, name, description, status, definition, created_by
    ) VALUES(
      $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::jsonb, $7::bigint
    )`,
    [
      d.id,
      d.organizationId,
      d.name,
      d.description,
      d.status,
      JSON.stringify(d.definition),
      d.createdBy,
    ],
  );
}

async function update(d) {
  return query(
    `UPDATE analytics_definitions
      SET organization_id = $1::uuid,
          name = $2::text,
          description = $3::text,
          status = $4::text,
          definition = $5::jsonb,
          published_at = CASE
            WHEN $4::text = 'published'::text THEN COALESCE(published_at, NOW())
            ELSE published_at
          END,
          updated_at = NOW()
      WHERE id = $6::uuid`,
    [
      d.organizationId,
      d.name,
      d.description,
      d.status,
      JSON.stringify(d.definition),
      d.id,
    ],
  );
}

async function remove(id) {
  return query(`DELETE FROM analytics_definitions WHERE id = $1::uuid`, [id]);
}

module.exports = { find, create, update, remove };
