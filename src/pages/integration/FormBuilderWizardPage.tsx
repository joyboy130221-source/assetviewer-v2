import { ArrowLeft, Blocks, FileText, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { formApi } from "../../features/form-builder/services/formApi";
import { TenantCombobox } from "../../features/form-builder/components/TenantCombobox";
import type {
  FormTheme,
  Organization,
} from "../../features/form-builder/model/form.types";
export default function FormBuilderWizardPage() {
  const navigate = useNavigate(),
    ui = useAppUI();
  const [orgs, setOrgs] = useState<Organization[]>([]),
    [org, setOrg] = useState(""),
    [theme, setTheme] = useState<FormTheme>("current");
  useEffect(() => {
    formApi
      .organizations()
      .then((x) => {
        const a = x.filter((o) => o.active);
        setOrgs(a);
        setOrg(a[0]?.id || "");
      })
      .catch((e) => ui.toast(e.message, "error"));
  }, []);
  const create = async (mode: "empty" | "integrated") => {
    if (!org)
      return ui.toast("Create or select an organization first.", "error");
    try {
      const id = await formApi.createForm({
        organizationId: org,
        name: "Untitled Form",
        description: "",
        mode,
        status: "draft",
        fields: [],
        theme,
      });
      navigate(`/admin/integration/form-builder/${id}/design`);
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  return (
    <AdminLayout
      permission="formBuilder"
      eyebrow="FORM BUILDER · STEP 1"
      title="Choose how to start"
      subtitle="Select the tenant and foundation for your new form."
    >
      <button
        className="fb-back"
        onClick={() => navigate("/admin/integration/form-builder")}
      >
        <ArrowLeft size={16} /> Form List
      </button>
      <section className="data-card fb-wizard-tenant">
        <label>
          Organization / Tenant
          <TenantCombobox
            organizations={orgs}
            value={org}
            onChange={setOrg}
            placeholder="Select organization"
          />
        </label>
        <label className="fb-theme-picker">
          Form Theme
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as FormTheme)}
          >
            <option value="current">Default</option>
            <option value="sap">Classic ERP</option>
            <option value="maximo">Carbon</option>
            <option value="horizon">Horizon</option>
            <option value="operations">Operations</option>
          </select>
          <small>The theme can also be changed later in Form Properties.</small>
        </label>
      </section>
      <div className="fb-mode-grid">
        <button className="fb-mode-card" onClick={() => void create("empty")}>
          <span className="fb-mode-icon">
            <FileText />
          </span>
          <strong>Empty Form</strong>
          <p>Start with a blank canvas and drag components into your form.</p>
          <span>Start building →</span>
        </button>
        <button
          className="fb-mode-card"
          onClick={() => void create("integrated")}
        >
          <span className="fb-mode-icon">
            <PlugZap />
          </span>
          <strong>Integrated Form</strong>
          <p>Build a form backed by an external integration or data source.</p>
          <span>
            <Blocks size={14} /> Configure API →
          </span>
        </button>
      </div>
    </AdminLayout>
  );
}
