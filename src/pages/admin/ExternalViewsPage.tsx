import { useEffect, useState, type FormEvent } from "react";
import {
  ExternalLink,
  KeyRound,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { LoadingOverlay, useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";
import { externalViewAccessApi } from "../../features/external-views/services/externalViewAccessApi";
import { GeneratedLinkBanner } from "../../features/external-views/components/GeneratedLinkBanner";

type ExternalView = {
  id: number;
  name: string;
  description?: string;
  url: string;
  active: boolean;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_code?: string | null;
  access_key_configured?: boolean;
  access_key_prefix?: string | null;
  access_key_created_at?: string | null;
  /** Maximo environments the key is limited to (from `env=` in the URL). */
  access_key_environments?: string[];
};

type Organization = { id: string; code: string; name: string; active: boolean };

export default function ExternalViewsPage() {
  const [data, setData] = useState<ExternalView[]>([]);
  const [edit, setEdit] = useState<ExternalView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [generated, setGenerated] = useState<{
    name: string;
    link: string;
  } | null>(null);
  const ui = useAppUI();

  const load = () =>
    api<{ data: ExternalView[] }>("/api/admin/external-views").then((body) =>
      setData(body.data),
    );

  useEffect(() => {
    load().catch((error) => ui.toast(error.message, "error"));
    api<{ data: Organization[] }>("/api/admin/organizations")
      .then((body) => setOrganizations(body.data.filter((org) => org.active)))
      .catch((error) => ui.toast(error.message, "error"));
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: any = Object.fromEntries(new FormData(event.currentTarget));
    body.active = body.active === "true";
    body.organizationId = body.organizationId || null;
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

  const generateKey = async (item: ExternalView) => {
    if (
      !(await ui.confirm({
        title: item.access_key_configured
          ? "Replace access key?"
          : "Generate access key?",
        message: item.access_key_configured
          ? `The current secure link for “${item.name}” will stop working immediately. Update BIC/BECS with the new link.`
          : `Create a secure link for “${item.name}” that BIC/BECS can use when External View authentication is enforced.`,
        confirmText: item.access_key_configured ? "Replace Key" : "Generate",
        danger: Boolean(item.access_key_configured),
      }))
    )
      return;
    setLoading(true);
    try {
      const result = await externalViewAccessApi.generate(item.id);
      setGenerated({ name: item.name, link: result.link });
      await load();
      ui.toast("Access key generated.");
    } catch (error: any) {
      ui.toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (item: ExternalView) => {
    if (
      !(await ui.confirm({
        title: "Revoke access key?",
        message: `Secure links for “${item.name}” will stop working when External View authentication is enforced.`,
        confirmText: "Revoke",
        danger: true,
      }))
    )
      return;
    setLoading(true);
    try {
      const result = await externalViewAccessApi.revoke(item.id);
      await load();
      ui.toast(result.message);
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
              <label>
                Organization / Tenant
                <select
                  name="organizationId"
                  defaultValue={edit?.organization_id || ""}
                >
                  <option value="">No tenant assigned</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.code} — {organization.name}
                    </option>
                  ))}
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
          {generated && (
            <GeneratedLinkBanner
              viewName={generated.name}
              link={generated.link}
              onClose={() => setGenerated(null)}
            />
          )}
          <div className="table-wrap admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Tenant</th>
                  <th>URL</th>
                  <th>Access Key</th>
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
                    <td>{item.organization_name || "—"}</td>
                    <td className="endpoint">
                      <span className="external-url-cell">
                        <ExternalLink size={14} />
                        {item.url}
                      </span>
                    </td>
                    <td>
                      {item.access_key_configured ? (
                        <span className="ev-key-status configured">
                          Configured <code>{item.access_key_prefix}…</code>
                          <small>
                            {item.access_key_environments?.length
                              ? `Env: ${item.access_key_environments.join(", ")}`
                              : "All environments"}
                          </small>
                        </span>
                      ) : (
                        <span className="ev-key-status missing">
                          Not configured
                        </span>
                      )}
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
                          className="icon-button table-action"
                          title={
                            item.access_key_configured
                              ? "Replace access key (new secure link)"
                              : "Generate access key (secure link)"
                          }
                          onClick={() => generateKey(item)}
                        >
                          <KeyRound size={16} />
                        </button>
                        {item.access_key_configured && (
                          <button
                            className="icon-button table-action"
                            title="Revoke access key"
                            onClick={() => revokeKey(item)}
                          >
                            <ShieldOff size={16} />
                          </button>
                        )}
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
