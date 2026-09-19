import { useEffect, useState } from "react";
import {
  Copy,
  CopyPlus,
  FilePlus2,
  Pencil,
  Eye,
  Inbox,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { formApi } from "../../features/form-builder/services/formApi";
import type { FormDefinition } from "../../features/form-builder/model/form.types";
export default function FormBuilderListPage() {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const navigate = useNavigate(),
    ui = useAppUI();
  const load = () =>
    formApi
      .forms()
      .then(setForms)
      .catch((e) => ui.toast(e.message, "error"));
  useEffect(() => {
    void load();
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
        <button
          className="primary-button"
          onClick={() => navigate("/admin/integration/form-builder/new")}
        >
          <FilePlus2 size={16} /> New Form
        </button>
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
