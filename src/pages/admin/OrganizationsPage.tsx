import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { formApi } from "../../features/form-builder/services/formApi";
import type { Organization } from "../../features/form-builder/model/form.types";
const blank = { code: "", name: "", description: "", active: true };
export default function OrganizationsPage() {
  const ui = useAppUI();
  const [rows, setRows] = useState<Organization[]>([]);
  const [edit, setEdit] = useState<Partial<Organization> | null>(null);
  const load = () =>
    formApi
      .organizations()
      .then(setRows)
      .catch((e) => ui.toast(e.message, "error"));
  useEffect(() => {
    void load();
  }, []);
  const save = async () => {
    try {
      if (edit?.id) await formApi.updateOrganization(edit);
      else await formApi.createOrganization(edit || blank);
      setEdit(null);
      load();
      ui.toast("Organization saved.", "success");
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  const remove = async (id: string) => {
    if (
      await ui.confirm({
        title: "Delete organization?",
        message: "Organizations already used by forms cannot be deleted.",
        confirmText: "Delete",
      })
    ) {
      try {
        await formApi.deleteOrganization(id);
        load();
      } catch (e: any) {
        ui.toast(e.message, "error");
      }
    }
  };
  return (
    <AdminLayout
      permission="organizations"
      eyebrow="SETUP"
      title="Organizations / Tenants"
      subtitle="Manage customer tenants used to isolate form definitions and submissions."
    >
      <div className="fb-page-actions">
        <div>
          <h2>Organizations</h2>
          <p>Each form and submission belongs to one tenant.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setEdit({ ...blank })}
        >
          <Plus size={16} /> New Organization
        </button>
      </div>
      {edit && (
        <section className="data-card fb-org-editor">
          <label>
            Code
            <input
              value={edit.code || ""}
              onChange={(e) => setEdit({ ...edit, code: e.target.value })}
            />
          </label>
          <label>
            Name
            <input
              value={edit.name || ""}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <label>
            Description
            <input
              value={edit.description || ""}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
            />
          </label>
          <label className="fb-toggle">
            <input
              type="checkbox"
              checked={edit.active !== false}
              onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
            />{" "}
            Active
          </label>
          <div>
            <button className="primary-button" onClick={save}>
              Save
            </button>{" "}
            <button className="secondary-button" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
      <section className="data-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Organization</th>
                <th>Description</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.code}</strong>
                  </td>
                  <td>
                    <Building2 size={14} /> {r.name}
                  </td>
                  <td>{r.description}</td>
                  <td>{r.active ? "Active" : "Inactive"}</td>
                  <td>
                    <div className="fb-row-actions">
                      <button onClick={() => setEdit(r)}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(r.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
