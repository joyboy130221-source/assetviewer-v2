import { useEffect, useState } from "react";
import {
  Copy,
  CopyPlus,
  Download,
  Upload,
  FilePlus2,
  Pencil,
  Eye,
  Inbox,
  Trash2,
  WandSparkles,
  ExternalLink,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { formApi } from "../../features/form-builder/services/formApi";
import type {
  FormDefinition,
  Organization,
} from "../../features/form-builder/model/form.types";
export default function FormBuilderListPage() {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [importOrganizationId, setImportOrganizationId] = useState("");
  const navigate = useNavigate(),
    ui = useAppUI();
  const load = () =>
    formApi
      .forms()
      .then(setForms)
      .catch((e) => ui.toast(e.message, "error"));
  useEffect(() => {
    void load();
    formApi
      .organizations()
      .then((items) => {
        setOrganizations(items);
        if (items[0]) setImportOrganizationId(items[0].id);
      })
      .catch((e) => ui.toast(e.message, "error"));
  }, []);
  const remove = async (id: string) => {
    if (
      await ui.confirm({
        title: "Delete form?",
        message: "The form and all submissions/API history will be deleted.",
        confirmText: "Delete",
      })
    ) {
      try {
        await formApi.deleteForm(id);
        load();
      } catch (e: any) {
        ui.toast(e.message, "error");
      }
    }
  };
  const duplicate = async (id: string) => {
    try {
      const newId = await formApi.duplicateForm(id);
      ui.toast("Form duplicated as a draft.", "success");
      navigate(`/admin/integration/form-builder/${newId}/design`);
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  const copy = async (form: FormDefinition) => {
    const query = (form.queryParams || [])
      .map((name) => `${encodeURIComponent(name)}={{${name}}}`)
      .join("&");
    const url = `${location.origin}/forms/${form.id}${query ? `?${query}` : ""}`;
    await navigator.clipboard.writeText(url);
    ui.toast("Published form link copied.", "success");
  };

  const promote = async (form: FormDefinition) => {
    const query = (form.queryParams || [])
      .map((name) => `${encodeURIComponent(name)}={{${name}}}`)
      .join("&");
    const url = `${location.origin}/forms/${form.id}${query ? `?${query}` : ""}`;
    if (
      !(await ui.confirm({
        title: "Promote to External View?",
        message: `Create a new External View record for “${form.name}”? The form itself will not be changed.`,
        confirmText: "Promote",
      }))
    )
      return;
    try {
      await formApi.promoteToExternalView({
        name: form.name,
        description: form.description || `Published form: ${form.name}`,
        url,
        organizationId: form.organizationId,
      });
      ui.toast("External View record created.", "success");
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  const exportForm = async (form: FormDefinition) => {
    try {
      const data = await formApi.exportForm(form.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${form.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.bib-form.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      ui.toast("Form and workflow exported.", "success");
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  const importForm = async (file: File) => {
    if (!importOrganizationId)
      return ui.toast("Select a target organization first.", "error");
    try {
      const packageData = JSON.parse(await file.text());
      const id = await formApi.importForm(packageData, importOrganizationId);
      ui.toast("Form and workflow imported as a draft.", "success");
      navigate(`/admin/integration/form-builder/${id}/design`);
    } catch (e: any) {
      ui.toast(e.message || "Unable to import package.", "error");
    }
  };
  return (
    <AdminLayout
      permission="formBuilder"
      eyebrow="INTEGRATION"
      title="Form Builder Wizards"
      subtitle="Design, preview, publish, and collect tenant-aware forms."
    >
      <div className="fb-page-actions">
        <div>
          <h2>Forms</h2>
          <p>Form definitions and submissions are persisted in system.</p>
        </div>
        <div className="fb-import-actions">
          <select
            value={importOrganizationId}
            onChange={(e) => setImportOrganizationId(e.target.value)}
            title="Target organization for imported forms"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <label className="secondary-button fb-import-button">
            <Upload size={16} /> Import
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importForm(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button
            className="primary-button"
            onClick={() => navigate("/admin/integration/form-builder/new")}
          >
            <FilePlus2 size={16} /> New Form
          </button>
        </div>
      </div>
      <section className="data-card">
        {!forms.length ? (
          <div className="fb-list-empty">
            <WandSparkles size={34} />
            <h3>No forms yet</h3>
            <p>Start the wizard to create your first form.</p>
          </div>
        ) : (
          <div className="fb-form-list">
            {forms.map((form) => (
              <article className="fb-form-row" key={form.id}>
                <div>
                  <div className="fb-row-title">
                    <strong>{form.name}</strong>
                    <span className={`fb-status ${form.status}`}>
                      {form.status}
                    </span>
                  </div>
                  <p>{form.description || "No description"}</p>
                  <small>
                    {form.organizationName} · {form.fields.length} components ·
                    Updated {new Date(form.updatedAt).toLocaleString()}
                  </small>
                </div>
                <div className="fb-row-actions">
                  <Link
                    title="Design"
                    to={`/admin/integration/form-builder/${form.id}/design`}
                  >
                    <Pencil size={16} />
                  </Link>
                  <Link
                    title="Preview"
                    to={`/admin/integration/form-builder/${form.id}/preview`}
                  >
                    <Eye size={16} />
                  </Link>
                  {form.status === "published" && (
                    <>
                      <Link title="User Form" to={`/forms/${form.id}`}>
                        <FilePlus2 size={16} />
                      </Link>
                      <button
                        title="Copy published link"
                        onClick={() => copy(form)}
                      >
                        <Copy size={16} />
                      </button>
                    </>
                  )}
                  <button
                    title="Promote to External View"
                    onClick={() => void promote(form)}
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button
                    title="Export form & workflow"
                    onClick={() => void exportForm(form)}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    title="Duplicate form"
                    onClick={() => void duplicate(form.id)}
                  >
                    <CopyPlus size={16} />
                  </button>
                  <Link
                    title="Submissions"
                    to={`/admin/integration/form-builder/${form.id}/submissions`}
                  >
                    <Inbox size={16} />
                  </Link>
                  <button title="Delete" onClick={() => remove(form.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
