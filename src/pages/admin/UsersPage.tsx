import { useEffect, useState, type FormEvent } from "react";
import { LockOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { LoadingOverlay, useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";
type UserRow = {
  id: number;
  username: string;
  name: string;
  email?: string | null;
  active: boolean;
  role_id: number;
  role_name: string;
  must_change_password?: boolean;
  locked_until?: string | null;
  last_login_at?: string | null;
};
type RoleOption = { id: number; name: string };
type PasswordPolicy = { minLength: number; minCharacterClasses: number };
type UsersResponse = {
  data: UserRow[];
  roles: RoleOption[];
  passwordPolicy?: PasswordPolicy;
};

const isLocked = (user: UserRow) =>
  Boolean(
    user.locked_until && new Date(user.locked_until).getTime() > Date.now(),
  );

export default function UsersPage() {
  const [data, setData] = useState<UserRow[]>([]),
    [roles, setRoles] = useState<RoleOption[]>([]),
    [policy, setPolicy] = useState<PasswordPolicy | null>(null),
    [edit, setEdit] = useState<UserRow | null>(null),
    [formOpen, setFormOpen] = useState(false),
    [loading, setLoading] = useState(false),
    ui = useAppUI();
  const load = () =>
    api<UsersResponse>("/api/admin/users").then((b) => {
      setData(b.data);
      setRoles(b.roles);
      setPolicy(b.passwordPolicy || null);
    });
  useEffect(() => {
    load().catch((e) => ui.toast(e.message, "error"));
  }, []);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const b: any = Object.fromEntries(new FormData(e.currentTarget));
    b.active = b.active === "true";
    b.mustChangePassword = b.mustChangePassword !== "false";
    const editing = !!b.id;
    if (!editing && !b.password) {
      ui.toast("Password is required for a new user.", "error");
      return;
    }
    if (
      !(await ui.confirm({
        title: editing ? "Update User?" : "Save User?",
        message: `Save user “${b.name}” with the selected role?`,
        confirmText: editing ? "Update" : "Create",
      }))
    )
      return;
    setLoading(true);
    try {
      const r = await api<any>(
        "/api/admin/users",
        jsonInit(editing ? "PUT" : "POST", b),
      );
      setEdit(null);
      setFormOpen(false);
      await load();
      ui.toast(r.message);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const unlock = async (x: UserRow) => {
    setLoading(true);
    try {
      const r = await api<{ message: string }>(
        "/api/admin/users?action=unlock",
        jsonInit("POST", { id: x.id }),
      );
      await load();
      ui.toast(r.message);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const del = async (x: UserRow) => {
    if (
      await ui.confirm({
        title: "Delete user?",
        message: `Delete user “${x.name}” (@${x.username})?`,
        confirmText: "Delete",
        danger: true,
      })
    ) {
      try {
        const r = await api<any>(
          "/api/admin/users",
          jsonInit("DELETE", { id: x.id }),
        );
        await load();
        ui.toast(r.message);
      } catch (e: any) {
        ui.toast(e.message, "error");
      }
    }
  };
  return (
    <>
      <AdminLayout permission="users" eyebrow="ACCESS CONTROL" title="Users">
        <section className="data-card">
          <div className="card-toolbar">
            <div>
              <h2>Users</h2>
              <p>Manage user records and access configuration.</p>
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
                Username
                <input
                  name="username"
                  defaultValue={edit?.username || ""}
                  required
                />
              </label>
              <label>
                Full Name
                <input name="name" defaultValue={edit?.name || ""} required />
              </label>
              <label>
                Email Address
                <input
                  name="email"
                  type="email"
                  defaultValue={edit?.email || ""}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    edit ? "Leave blank to keep current" : "Required for new"
                  }
                />
                {policy && (
                  <small>
                    Min. {policy.minLength} characters,{" "}
                    {policy.minCharacterClasses} of: lowercase, uppercase,
                    number, symbol.
                  </small>
                )}
              </label>
              <label>
                Change password at next sign-in
                <select name="mustChangePassword" defaultValue="true">
                  <option value="true">Yes (temporary password)</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Role
                <select
                  name="role_id"
                  defaultValue={String(edit?.role_id || "")}
                  required
                >
                  <option value="">Select role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
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
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong>{x.name}</strong>
                      <br />
                      <small>@{x.username}</small>
                    </td>
                    <td>{x.email || "—"}</td>
                    <td>{x.role_name}</td>
                    <td>
                      <span
                        className={x.active ? "badge-active" : "badge-inactive"}
                      >
                        {x.active ? "Active" : "Inactive"}
                      </span>
                      {isLocked(x) && (
                        <span className="badge-inactive user-flag">Locked</span>
                      )}
                      {x.must_change_password && (
                        <span className="badge-pending user-flag">
                          Password change required
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button
                          className="icon-button table-action"
                          title="Edit user"
                          aria-label="Edit user"
                          onClick={() => {
                            setEdit(x);
                            setFormOpen(true);
                            scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        {isLocked(x) && (
                          <button
                            className="icon-button table-action"
                            title="Unlock account"
                            aria-label="Unlock account"
                            onClick={() => unlock(x)}
                          >
                            <LockOpen size={16} />
                          </button>
                        )}
                        <button
                          className="icon-button table-action danger"
                          title="Delete user"
                          aria-label="Delete user"
                          onClick={() => del(x)}
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
