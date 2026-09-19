import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { LoadingOverlay, useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";

type ExternalView = {
  id: number;
  name: string;
  description?: string;
  url: string;
  active: boolean;
};

export default function ExternalViewsPage() {
  const [data, setData] = useState<ExternalView[]>([]);
  const [edit, setEdit] = useState<ExternalView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ui = useAppUI();

  const load = () =>
    api<{ data: ExternalView[] }>("/api/admin/external-views").then((body) =>
      setData(body.data),
    );

  useEffect(() => {
    load().catch((error) => ui.toast(error.message, "error"));
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: any = Object.fromEntries(new FormData(event.currentTarget));
    body.active = body.active === "true";
    const editing = Boolean(body.id);
    if (
      !(await ui.confirm({
        title: editing ? "Update external view?" : "Create external view?",
        message: `Save configuration for “${body.name}”?`,
        confirmText: editing ? "Update" : "Create",
      }))
    )
      return;

    setLoading(true);
    try {
      const response = await api<{ message: string }>(
        "/api/admin/external-views",
        jsonInit(editing ? "PUT" : "POST", body),
      );
      setEdit(null);
      setFormOpen(false);
      await load();
      ui.toast(response.message);
    } catch (error: any) {
      ui.toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (item: ExternalView) => {
    if (
      !(await ui.confirm({
        title: "Delete external view?",
        message: `Delete “${item.name}”?`,
        confirmText: "Delete",
        danger: true,
      }))
    )
      return;

    setLoading(true);
    try {
      const response = await api<{ message: string }>(
        "/api/admin/external-views",
        jsonInit("DELETE", { id: item.id }),
      );
      await load();
      ui.toast(response.message);
    } catch (error: any) {
      ui.toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdminLayout
        permission="externalViews"
        eyebrow="APPLICATION CONFIGURATION"
        title="External Views"
        subtitle="Register public application screens that administrators can launch against a selected Maximo environment."
      >
        <section className="data-card">
          <div className="card-toolbar">
            <div>
              <h2>Registered Views</h2>
              <p>Manage launchable public screens and their base URLs.</p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setEdit(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              Add New
            </button>
          </div>
          {formOpen && (
            <form
              key={edit?.id || "new"}
              className="admin-form"
              onSubmit={save}
            >
              <input type="hidden" name="id" defaultValue={edit?.id || ""} />
              <label>
                Name
                <input
                  name="name"
                  defaultValue={edit?.name || ""}
                  placeholder="Asset Viewer"
                  required
                />
              </label>
              <label>
                Active
                <select
                  name="active"
                  defaultValue={String(edit?.active ?? true)}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="wide">
                Description
                <input
                  name="description"
                  defaultValue={edit?.description || ""}
                  placeholder="View Maximo asset information"
                />
              </label>
              <label className="wide">
                URL
                <input
                  name="url"
                  defaultValue={edit?.url || ""}
                  placeholder="https://example.com/?assetId=V6-0401 or /?assetId=V6-0401"
                  required
                />
              </label>
              <div className="wide inline-actions">
                <button className="primary-button">
                  {edit ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setEdit(null);
                    setFormOpen(false);
                  }}
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="table-wrap admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.description || "—"}</td>
                    <td className="endpoint">
                      <span className="external-url-cell">
                        <ExternalLink size={14} />
                        {item.url}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          item.active ? "badge-active" : "badge-inactive"
                        }
                      >
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button
                          className="icon-button table-action"
                          title="Edit external view"
                          onClick={() => {
                            setEdit(item);
                            setFormOpen(true);
                            scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button table-action danger"
                          title="Delete external view"
                          onClick={() => remove(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.length && (
              <div className="empty-state">
                No external views have been registered.
              </div>
            )}
          </div>
        </section>
      </AdminLayout>
      <LoadingOverlay show={loading} />
    </>
  );
}
