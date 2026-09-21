const crypto = require("crypto");
const { requireAuth } = require("../../lib/auth");
const formRepository = require("../../repositories/form-repository");

const mapForm = (row) => ({
  id: row.id,
  organizationId: row.organization_id,
  organizationName: row.organization_name,
  name: row.name,
  description: row.description || "",
  mode: row.mode,
  status: row.status,
  fields: row.fields || [],
  submitAction: row.submit_action || null,
  sourceAction: row.source_action || null,
  queryParams: row.settings?.queryParams || [],
  showSubmitButton: row.settings?.showSubmitButton !== false,
  submitButtonLabel: row.settings?.submitButtonLabel || "Submit Form",
  rules: row.settings?.rules || [],
  responseAction: row.settings?.responseAction || null,
  failureResponse: row.settings?.failureResponse || "",
  theme: row.settings?.theme || "current",
  workflow: row.settings?.workflow || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
});

function validateUniqueFieldNames(fields = []) {
  const names = fields
    .map((field) => String(field.name || "").trim())
    .filter(Boolean);

  return new Set(names).size === names.length;
}

module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "formBuilder");
  if (!user) return;

  try {
    const id = req.query.id;
    const body = req.body || {};

    if (req.method === "GET") {
      const result = await formRepository.findForms(id);
      return res.json(
        id
          ? { data: result.rows[0] ? mapForm(result.rows[0]) : null }
          : { data: result.rows.map(mapForm) },
      );
    }

    if (req.method === "POST") {
      if (body.duplicateOf) {
        const source = (await formRepository.findForms(body.duplicateOf))
          .rows[0];
        if (!source)
          return res.status(404).json({ error: "Source form not found." });
        const formId = crypto.randomUUID();
        const fields = (source.fields || []).map((field) => ({
          ...field,
          id: crypto.randomUUID(),
        }));
        await formRepository.createForm(
          {
            id: formId,
            organizationId: source.organization_id,
            name: `${source.name} - Copy`,
            description: source.description || "",
            mode: source.mode,
            status: "draft",
            fields,
            submitAction: source.submit_action || null,
            sourceAction: source.source_action || null,
            settings: source.settings || {},
          },
          user.id,
        );
        return res.json({ id: formId });
      }
      if (!body.organizationId || !body.name?.trim()) {
        return res
          .status(400)
          .json({ error: "Organization and form name are required." });
      }

      if (!validateUniqueFieldNames(body.fields)) {
        return res
          .status(400)
          .json({ error: "Field name must be unique within the form." });
      }

      const formId = crypto.randomUUID();
      await formRepository.createForm(
        {
          id: formId,
          organizationId: body.organizationId,
          name: body.name.trim(),
          description: body.description || "",
          mode: body.mode || "empty",
          status: body.status || "draft",
          fields: body.fields || [],
          submitAction: body.submitAction || null,
          sourceAction: body.sourceAction || null,
          settings: {
            queryParams: body.queryParams || [],
            showSubmitButton: body.showSubmitButton !== false,
            submitButtonLabel: body.submitButtonLabel || "Submit Form",
            rules: body.rules || [],
            responseAction: body.responseAction || null,
            failureResponse: body.failureResponse || "",
            theme: body.theme || "current",
            workflow: body.workflow || null,
          },
        },
        user.id,
      );

      return res.json({ id: formId });
    }

    if (req.method === "PUT") {
      if (!body.id) {
        return res.status(400).json({ error: "id is required" });
      }

      if (!body.organizationId || !body.name?.trim()) {
        return res
          .status(400)
          .json({ error: "Organization and form name are required." });
      }

      if (!validateUniqueFieldNames(body.fields)) {
        return res
          .status(400)
          .json({ error: "Field name must be unique within the form." });
      }

      await formRepository.updateForm({
        id: body.id,
        organizationId: body.organizationId,
        name: body.name.trim(),
        description: body.description || "",
        mode: body.mode || "empty",
        status: body.status || "draft",
        fields: body.fields || [],
        submitAction: body.submitAction || null,
        sourceAction: body.sourceAction || null,
        settings: {
          queryParams: body.queryParams || [],
          showSubmitButton: body.showSubmitButton !== false,
          submitButtonLabel: body.submitButtonLabel || "Submit Form",
          rules: body.rules || [],
          responseAction: body.responseAction || null,
          failureResponse: body.failureResponse || "",
          theme: body.theme || "current",
          workflow: body.workflow || null,
        },
      });

      return res.json({ message: "Form saved." });
    }

    if (req.method === "DELETE") {
      if (!body.id) {
        return res.status(400).json({ error: "id is required" });
      }
      await formRepository.deleteForm(body.id, user.id);
      return res.json({ message: "Form deleted." });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Form API error:", error);
    return res.status(error.status || 500).json({ error: error.message });
  }
};
