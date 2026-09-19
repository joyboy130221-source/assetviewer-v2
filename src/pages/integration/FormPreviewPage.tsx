import { ArrowLeft, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { FieldRenderer } from "../../features/form-builder/components/FieldRenderer";
import { formApi } from "../../features/form-builder/services/formApi";
import type { FormDefinition } from "../../features/form-builder/model/form.types";
export default function FormPreviewPage() {
  const { formId = "" } = useParams(),
    navigate = useNavigate();
  const [form, setForm] = useState<FormDefinition>();
  useEffect(() => {
    formApi.form(formId).then((x) => x && setForm(x));
  }, [formId]);
  if (!form) return null;
  return (
    <AdminLayout
      permission="formBuilder"
      eyebrow="FORM BUILDER · PREVIEW"
      title={form.name}
      subtitle={`Tenant: ${form.organizationName || "—"}`}
    >
      <div className="fb-preview-actions">
        <button
          className="fb-back"
          onClick={() => navigate("/admin/integration/form-builder")}
        >
          <ArrowLeft size={16} /> Form List
        </button>
        <button
          className="secondary-button"
          onClick={() =>
            navigate(`/admin/integration/form-builder/${form.id}/design`)
          }
        >
          <Pencil size={16} /> Back to Designer
        </button>
      </div>
      <section
        className={`fb-user-form-card form-theme-${form.theme || "current"}`}
      >
        <div className="fb-user-form-head">
          <h2>{form.name}</h2>
          <p>{form.description || "Complete the fields below."}</p>
          <span className={`fb-status ${form.status}`}>{form.status}</span>
        </div>
        <div className="fb-user-fields">
          {form.fields.map((field) => (
            <FieldRenderer key={field.id} field={field} disabled />
          ))}
        </div>
        {form.showSubmitButton !== false && (
          <button className="primary-button" disabled>
            {form.submitButtonLabel || "Submit Form"} (Preview)
          </button>
        )}
      </section>
    </AdminLayout>
  );
}
