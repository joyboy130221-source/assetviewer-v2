import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { LoadingOverlay, useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";

type AuthType =
  "apiKey" | "bearer" | "basic" | "customHeader" | "managedBearer";
type AuthProfile = {
  id: string;
  organization_id?: string | null;
  organization_name?: string | null;
  name: string;
  description: string;
  auth_type: AuthType;
  header_name?: string;
  username?: string;
  active: boolean;
  token_url?: string | null;
  token_client_auth?: "body" | "basic";
  token_grant_type?: string | null;
  token_scope?: string | null;
  token_audience?: string | null;
  token_response_path?: string;
  token_expiry_response_path?: string;
  token_refresh_before_seconds?: number;
  token_timeout_ms?: number;
};
type Organization = { id: string; name: string; active: boolean };
type ProfileResponse = { data: AuthProfile[]; organizations: Organization[] };
type TokenTestResult = {
  message: string;
  success: boolean;
  status: number;
  durationMs: number;
  expiresIn: number;
  contentType?: string | null;
  responseKeys?: string[];
};

export default function AuthenticationProfilesPage() {
  const [data, setData] = useState<AuthProfile[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [edit, setEdit] = useState<AuthProfile | null>(null);
  const [authType, setAuthType] = useState<AuthType>("apiKey");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testingToken, setTestingToken] = useState(false);
  const [tokenTest, setTokenTest] = useState<TokenTestResult | null>(null);
  const ui = useAppUI();
  const load = async () => {
    const response = await api<ProfileResponse>(
      "/api/admin/authentication-profiles",
    );
    setData(response.data);
    setOrganizations(response.organizations.filter((x) => x.active));
  };
  useEffect(() => {
    load().catch((e: Error) => ui.toast(e.message, "error"));
  }, []);
  const openForm = (profile: AuthProfile | null) => {
    setEdit(profile);
    setAuthType(profile?.auth_type || "apiKey");
    setTokenTest(null);
    setOpen(true);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    const payload = {
      ...body,
      organizationId: body.organizationId || null,
      active: body.active === "true",
    };
    const editing = Boolean(body.id);
    setLoading(true);
    try {
      const result = await api<{ message: string }>(
        "/api/admin/authentication-profiles",
        jsonInit(editing ? "PUT" : "POST", payload),
      );
      await load();
      setEdit(null);
      setOpen(false);
      ui.toast(result.message);
    } catch (error) {
      ui.toast(
        error instanceof Error
          ? error.message
          : "Unable to save authentication profile.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };
  const testToken = async (form: HTMLFormElement) => {
    const body = Object.fromEntries(new FormData(form)) as Record<
      string,
      string
    >;
    const payload = {
      ...body,
      action: "testToken",
      organizationId: body.organizationId || null,
      active: body.active === "true",
    };
    setTestingToken(true);
    setTokenTest(null);
    try {
      const result = await api<TokenTestResult>(
        "/api/admin/authentication-profiles",
        jsonInit("POST", payload),
      );
      setTokenTest(result);
      ui.toast(`Token request succeeded in ${result.durationMs} ms.`);
    } catch (error) {
      ui.toast(
        error instanceof Error ? error.message : "Token request failed.",
        "error",
      );
    } finally {
      setTestingToken(false);
    }
  };
  const managed = authType === "managedBearer";
  return (
    <>
      <AdminLayout
        permission="authenticationProfiles"
        eyebrow="INTEGRATION SECURITY"
        title="Authentication Profiles"
        subtitle="Centralize reusable credentials and managed bearer-token lifecycles for integrations."
      >
        <section className="data-card">
          <div className="card-toolbar">
            <div>
              <h2>Credential Profiles</h2>
              <p>
                Profiles can be shared or scoped to an organization. Managed
                tokens are cached securely and refreshed before expiry.
              </p>
            </div>
            <button className="primary-button" onClick={() => openForm(null)}>
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
                Organization
                <select
                  name="organizationId"
                  defaultValue={edit?.organization_id || ""}
                >
                  <option value="">Shared / All Organizations</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Authentication Type
                <select
                  name="auth_type"
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                >
                  <option value="apiKey">API Key</option>
                  <option value="bearer">Static Bearer Token</option>
                  <option value="managedBearer">
                    Managed Bearer Token (Client Credentials)
                  </option>
                  <option value="basic">Basic Authentication</option>
                  <option value="customHeader">Custom Header</option>
                </select>
              </label>
              {!managed && (
                <label>
                  Header Name
                  <input
                    name="header_name"
                    placeholder="apikey / X-API-Key"
                    defaultValue={edit?.header_name || ""}
                  />
                </label>
              )}
              <label>
                {managed ? "Client ID" : "Username"}
                <input
                  name="username"
                  placeholder={managed ? "OAuth client_id" : "Basic auth only"}
                  defaultValue={edit?.username || ""}
                />
              </label>
              <label>
                {managed ? "Client Secret" : "Credential"}
                <input
                  name="secret"
                  type="password"
                  required={!edit}
                  placeholder={
                    edit
                      ? "Leave blank to keep existing credential"
                      : managed
                        ? "OAuth client_secret"
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
              {managed && (
                <>
                  <label className="wide">
                    Token Endpoint
                    <input
                      name="token_url"
                      type="url"
                      required
                      defaultValue={edit?.token_url || ""}
                      placeholder="https://identity.example.com/oauth/token"
                    />
                  </label>
                  <label>
                    Client Authentication
                    <select
                      name="token_client_auth"
                      defaultValue={edit?.token_client_auth || "body"}
                    >
                      <option value="body">Credentials in Form Body</option>
                      <option value="basic">HTTP Basic</option>
                    </select>
                  </label>
                  <label>
                    Grant Type
                    <input
                      name="token_grant_type"
                      required
                      defaultValue={
                        edit?.token_grant_type || "client_credentials"
                      }
                      placeholder="client_credentials"
                    />
                  </label>
                  <label>
                    Scope
                    <input
                      name="token_scope"
                      defaultValue={edit?.token_scope || ""}
                      placeholder="Optional OAuth scope"
                    />
                  </label>
                  <label>
                    Audience
                    <input
                      name="token_audience"
                      defaultValue={edit?.token_audience || ""}
                      placeholder="Optional audience"
                    />
                  </label>
                  <label>
                    Access Token Response Path
                    <input
                      name="token_response_path"
                      defaultValue={edit?.token_response_path || "access_token"}
                    />
                  </label>
                  <label>
                    Expiry Response Path
                    <input
                      name="token_expiry_response_path"
                      defaultValue={
                        edit?.token_expiry_response_path || "expires_in"
                      }
                    />
                  </label>
                  <label>
                    Refresh Before Expiry (seconds)
                    <input
                      name="token_refresh_before_seconds"
                      type="number"
                      min="0"
                      max="3600"
                      defaultValue={edit?.token_refresh_before_seconds ?? 60}
                    />
                  </label>
                  <label>
                    Token Request Timeout (ms)
                    <input
                      name="token_timeout_ms"
                      type="number"
                      min="1000"
                      max="120000"
                      step="1000"
                      defaultValue={edit?.token_timeout_ms ?? 15000}
                    />
                  </label>
                </>
              )}
              {managed && (
                <div className="wide auth-token-test-panel">
                  <div>
                    <strong>Token Request Test</strong>
                    <small>
                      Requests a token using the values above without saving or
                      caching the token. Secrets and access tokens are never
                      returned to the browser.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={testingToken}
                    onClick={(e) => {
                      const form = e.currentTarget.form;
                      if (form) void testToken(form);
                    }}
                  >
                    {testingToken ? "Testing…" : "Test Token"}
                  </button>
                  {tokenTest && (
                    <div className="auth-token-test-result">
                      <span className="badge-active">
                        HTTP {tokenTest.status}
                      </span>
                      <span>{tokenTest.durationMs} ms</span>
                      <span>Expires in {tokenTest.expiresIn}s</span>
                      {tokenTest.responseKeys?.length ? (
                        <span>
                          Response fields: {tokenTest.responseKeys.join(", ")}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
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
                  <th>Organization</th>
                  <th>Type</th>
                  <th>Identity / Header</th>
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
                    <td>{x.organization_name || "Shared"}</td>
                    <td>
                      {x.auth_type === "managedBearer"
                        ? "Managed Bearer"
                        : x.auth_type}
                    </td>
                    <td>{x.username || x.header_name || "—"}</td>
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
                          title="Edit"
                          onClick={() => openForm(x)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button table-action danger"
                          title="Delete"
                          onClick={async () => {
                            if (
                              await ui.confirm({
                                title: "Delete profile?",
                                message: `Delete “${x.name}”?`,
                                confirmText: "Delete",
                                danger: true,
                              })
                            ) {
                              try {
                                await api(
                                  "/api/admin/authentication-profiles",
                                  jsonInit("DELETE", { id: x.id }),
                                );
                                await load();
                                ui.toast("Authentication profile deleted.");
                              } catch (error) {
                                ui.toast(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to delete profile.",
                                  "error",
                                );
                              }
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
