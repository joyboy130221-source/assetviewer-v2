const crypto = require("crypto");
const { query } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const formRepository = require("../../repositories/form-repository");

function mapAction(action, profilesById) {
  if (!action) return action;
  const copy = JSON.parse(JSON.stringify(action));
  if (copy.authProfileId) {
    copy.authProfileName = profilesById[String(copy.authProfileId)] || null;
    delete copy.authProfileId;
  }
  return copy;
}
function restoreAction(action, profilesByName, missing) {
  if (!action) return action;
  const copy = JSON.parse(JSON.stringify(action));
  if (copy.authProfileName) {
    const id = profilesByName[String(copy.authProfileName).toLowerCase()];
    if (!id) missing.add(copy.authProfileName);
    else copy.authProfileId = String(id);
    delete copy.authProfileName;
  }
  return copy;
}
module.exports = async (req, res) => {
  const user = await requireAuth(req, res, "formBuilder");
  if (!user) return;
  try {
    if (req.method === "GET") {
      const id = String(req.query.id || "");
      const row = (await formRepository.findForms(id)).rows[0];
      if (!row) return res.status(404).json({ error: "Form not found." });
      const profiles = (
        await query("SELECT id,name FROM authentication_profiles")
      ).rows;
      const byId = Object.fromEntries(
        profiles.map((p) => [String(p.id), p.name]),
      );
      const settings = JSON.parse(JSON.stringify(row.settings || {}));
      if (settings.workflow?.steps)
        settings.workflow.steps = settings.workflow.steps.map((step) => ({
          ...step,
          action: mapAction(step.action, byId),
        }));
      const pkg = {
        format: "bib-form",
        formatVersion: "1.0",
        exportedAt: new Date().toISOString(),
        form: {
          name: row.name,
          description: row.description || "",
          mode: row.mode,
          fields: row.fields || [],
          submitAction: mapAction(row.submit_action, byId),
          sourceAction: mapAction(row.source_action, byId),
          settings,
        },
      };
      return res.json({ data: pkg });
    }
    if (req.method === "POST") {
      const body = req.body || {},
        pkg = body.package;
      if (pkg?.format !== "bib-form" || !pkg.form)
        return res.status(400).json({ error: "Invalid BIB form package." });
      if (!body.organizationId)
        return res
          .status(400)
          .json({ error: "Target organization is required." });
      const profiles = (
        await query(
          "SELECT id,name FROM authentication_profiles WHERE active=TRUE",
        )
      ).rows;
      const byName = Object.fromEntries(
        profiles.map((p) => [String(p.name).toLowerCase(), p.id]),
      );
      const missing = new Set();
      const source = restoreAction(pkg.form.sourceAction, byName, missing);
      const submit = restoreAction(pkg.form.submitAction, byName, missing);
      const settings = JSON.parse(JSON.stringify(pkg.form.settings || {}));
      if (settings.workflow?.steps)
        settings.workflow.steps = settings.workflow.steps.map((step) => ({
          ...step,
          id: crypto.randomUUID(),
          action: restoreAction(step.action, byName, missing),
        }));
      if (missing.size)
        return res.status(409).json({
          error: `Missing Authentication Profile(s): ${[...missing].join(", ")}. Create profiles with these names, then import again.`,
          missingAuthenticationProfiles: [...missing],
        });
      const id = crypto.randomUUID();
      const fields = (pkg.form.fields || []).map((field) => ({
        ...field,
        id: crypto.randomUUID(),
      }));
      await formRepository.createForm(
        {
          id,
          organizationId: body.organizationId,
          name: body.name?.trim() || `${pkg.form.name} - Imported`,
          description: pkg.form.description || "",
          mode: pkg.form.mode || "empty",
          status: "draft",
          fields,
          submitAction: submit,
          sourceAction: source,
          settings,
        },
        user.id,
      );
      return res.json({
        id,
        message: "Form and workflow imported as a draft.",
      });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Form package API error:", error);
    return res.status(500).json({ error: error.message });
  }
};
