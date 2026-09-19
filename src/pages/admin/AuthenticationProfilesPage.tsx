import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { LoadingOverlay, useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";

export default function AuthenticationProfilesPage() {
  const [data, setData] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ui = useAppUI();
  const load = () =>
    api<any>("/api/admin/authentication-profiles").then((x) => setData(x.data));
  useEffect(() => {
    load().catch((e) => ui.toast(e.message, "error"));
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: any = Object.fromEntries(new FormData(event.currentTarget));
    body.active = body.active === "true";
    const editing = Boolean(body.id);
    setLoading(true);
    try {
      const r = await api<any>(
        "/api/admin/authentication-profiles",
        jsonInit(editing ? "PUT" : "POST", body),
      );
      await load();
      setEdit(null);
      setOpen(false);
      ui.toast(r.message);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <AdminLayout
        permission="authenticationProfiles"
        eyebrow="INTEGRATION SECURITY"
        title="Authentication Profiles"
        subtitle="Store reusable API credentials securely."
      >
        <section className="data-card">
          <div className="card-toolbar">
            <div>
              <h2>Credential Profiles</h2>
              <p>
                Forms reference profiles without exposing secrets in form
                definitions.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              <Plus size={16} /> Add New
            </button>
          </div>
          {open && (
            <form
              className="admin-form"
              onSubmit={save}
              key={edit?.id || "new"}
            >
              <input type="hidden" name="id" defaultValue={edit?.id || ""} />
              <label>
                Name
                <input name="name" required defaultValue={edit?.name || ""} />
              </label>
              <label>
                Authentication Type
                <select
                  name="auth_type"
                  defaultValue={edit?.auth_type || "apiKey"}
                >
                  <option value="apiKey">API Key</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Authentication</option>
                  <option value="customHeader">Custom Header</option>
                </select>
              </label>
              <label>
                Header Name
                <input
                  name="header_name"
                  placeholder="apikey / X-API-Key"
                  defaultValue={edit?.header_name || ""}
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  placeholder="Basic auth only"
                  defaultValue={edit?.username || ""}
                />
              </label>
              <label>
                Credential
                <input
                  name="secret"
                  type="password"
                  required={!edit}
                  placeholder={
                    edit
                      ? "Leave blank to keep existing credential"
                      : "Credential / token / password"
                  }
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
                />
              </label>
              <div className="wide inline-actions">
                <button className="primary-button">
                  {edit ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setOpen(false)}
                >
                  <X size={16} /> Cancel
                </button>
              </div>
            </form>
          )}
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Header / User</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong>
                        <KeyRound size={14} /> {x.name}
                      </strong>
                      <small className="table-subtext">{x.description}</small>
                    </td>
                    <td>{x.auth_type}</td>
                    <td>{x.header_name || x.username || "—"}</td>
                    <td>
                      <span
                        className={x.active ? "badge-active" : "badge-inactive"}
                      >
                        {x.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button
                          className="icon-button table-action"
                          onClick={() => {
                            setEdit(x);
                            setOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button table-action danger"
                          onClick={async () => {
                            if (
                              await ui.confirm({
                                title: "Delete profile?",
                                message: `Delete “${x.name}”?`,
                                confirmText: "Delete",
                                danger: true,
                              })
                            ) {
                              await api(
                                "/api/admin/authentication-profiles",
                                jsonInit("DELETE", { id: x.id }),
                              );
                              await load();
                            }
                          }}
                        >
                          <Trash2 size={16} />
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
      <LoadingOverlay show={loading} />
    </>
  );
}
