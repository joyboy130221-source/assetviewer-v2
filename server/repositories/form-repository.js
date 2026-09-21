const { query } = require("../lib/db");

async function findForms(id) {
  return query(
    `SELECT f.*, o.name AS organization_name
       FROM form_definitions f
       JOIN organizations o ON o.id = f.organization_id
      WHERE f.deleted_at IS NULL AND o.deleted_at IS NULL
      ${id ? "AND f.id = $1::uuid" : ""}
      ORDER BY f.updated_at DESC`,
    id ? [id] : [],
  );
}

async function createForm(form, createdBy) {
  return query(
    `INSERT INTO form_definitions (
       id, organization_id, name, description, mode, status,
       fields, submit_action, source_action, settings, created_by
     ) VALUES (
       $1::uuid, $2::uuid, $3::varchar, $4::text, $5::varchar, $6::varchar,
       $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::bigint
     )`,
    [
      form.id,
      form.organizationId,
      form.name,
      form.description,
      form.mode,
      form.status,
      JSON.stringify(form.fields),
      form.submitAction ? JSON.stringify(form.submitAction) : null,
      form.sourceAction ? JSON.stringify(form.sourceAction) : null,
      JSON.stringify(form.settings || {}),
      createdBy,
    ],
  );
}

async function updateForm(form) {
  return query(
    `UPDATE form_definitions
        SET organization_id = $1::uuid,
            name = $2::varchar,
            description = $3::text,
            mode = $4::varchar,
            status = $5::varchar,
            fields = $6::jsonb,
            submit_action = $7::jsonb,
            source_action = $8::jsonb,
            settings = $9::jsonb,
            updated_at = NOW(),
            published_at = CASE
              WHEN $5::varchar = 'published'::varchar
                THEN COALESCE(published_at, NOW())
              ELSE published_at
            END
      WHERE id = $10::uuid AND deleted_at IS NULL`,
    [
      form.organizationId,
      form.name,
      form.description,
      form.mode,
      form.status,
      JSON.stringify(form.fields),
      form.submitAction ? JSON.stringify(form.submitAction) : null,
      form.sourceAction ? JSON.stringify(form.sourceAction) : null,
      JSON.stringify(form.settings || {}),
      form.id,
    ],
  );
}

async function deleteForm(id, deletedBy) {
  return query(
    `UPDATE form_definitions
        SET deleted_at = NOW(), deleted_by = $2::bigint, updated_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id, deletedBy],
  );
}

module.exports = { findForms, createForm, updateForm, deleteForm };
