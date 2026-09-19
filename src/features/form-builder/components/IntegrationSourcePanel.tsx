import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { ApiAction, FormField } from "../model/form.types";
import { api } from "../../../services/api";
import { formApi } from "../services/formApi";

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

type AuthenticationProfileOption = {
  id: string | number;
  name: string;
  auth_type: string;
};

const EMPTY_ACTION: ApiAction = {
  enabled: true,
  method: "GET",
  url: "",
  headers: {},
  params: {},
  body: {},
};

const toRows = (value: Record<string, string>): KeyValueRow[] => {
  const rows = Object.entries(value || {}).map(([key, rowValue]) => ({
    id: crypto.randomUUID(),
    key,
    value: rowValue,
  }));

  return rows.length ? rows : [{ id: crypto.randomUUID(), key: "", value: "" }];
};

const fromRows = (rows: KeyValueRow[]): Record<string, string> =>
  Object.fromEntries(
    rows
      .map((row) => [row.key.trim(), row.value] as const)
      .filter(([key]) => Boolean(key)),
  );

interface IntegrationSourcePanelProps {
  action?: ApiAction | null;
  fields: FormField[];
  onChange: (action: ApiAction) => void;
  onAddField: (path: string) => void;
}

export function IntegrationSourcePanel({
  action,
  fields,
  onChange,
  onAddField,
}: IntegrationSourcePanelProps) {
  const current = action || EMPTY_ACTION;
  const [headers, setHeaders] = useState<KeyValueRow[]>(() =>
    toRows(current.headers),
  );
  const [params, setParams] = useState<KeyValueRow[]>(() =>
    toRows(current.params),
  );
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<unknown>();
  const [paths, setPaths] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<AuthenticationProfileOption[]>([]);

  useEffect(() => {
    api<{ data: AuthenticationProfileOption[] }>(
      "/api/admin/authentication-profiles",
    )
      .then((result) => setProfiles(result.data || []))
      .catch(() => setProfiles([]));
  }, []);

  // Keep empty/new editor rows in local UI state. They are intentionally not
  // persisted until a key is entered, otherwise a parent rerender would remove
  // the newly-added blank row before the user can type into it.
  const updateRows = (kind: "headers" | "params", nextRows: KeyValueRow[]) => {
    if (kind === "headers") {
      setHeaders(nextRows);
    } else {
      setParams(nextRows);
    }

    onChange({ ...current, [kind]: fromRows(nextRows) });
  };

  const renderRows = (kind: "headers" | "params", rows: KeyValueRow[]) => (
    <div className="fb-kv-list">
      {rows.map((row) => (
        <div className="fb-kv-row" key={row.id}>
          <input
            placeholder={kind === "headers" ? "Header name" : "Parameter name"}
            value={row.key}
            onChange={(event) =>
              updateRows(
                kind,
                rows.map((item) =>
                  item.id === row.id
                    ? { ...item, key: event.target.value }
                    : item,
                ),
              )
            }
          />
          <input
            placeholder="Value"
            value={row.value}
            onChange={(event) =>
              updateRows(
                kind,
                rows.map((item) =>
                  item.id === row.id
                    ? { ...item, value: event.target.value }
                    : item,
                ),
              )
            }
          />
          <button
            className="fb-icon-button"
            type="button"
            title="Remove row"
            onClick={() =>
              updateRows(
                kind,
                rows.length === 1
                  ? [{ ...row, key: "", value: "" }]
                  : rows.filter((item) => item.id !== row.id),
              )
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        className="fb-add-row"
        type="button"
        onClick={() =>
          updateRows(kind, [
            ...rows,
            { id: crypto.randomUUID(), key: "", value: "" },
          ])
        }
      >
        <Plus size={15} /> Add row
      </button>
    </div>
  );

  const testRequest = async () => {
    setTesting(true);
    setError("");

    try {
      const result = await formApi.testIntegration(current);
      setResponse(result.response);
      setPaths(result.fields);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to test the integration request.",
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="fb-api-action fb-integration-source">
      <div className="fb-api-title">
        <div>
          <strong>Integrated Form · Data Source</strong>
          <small>
            Configure and test the API used to populate this form. Select
            response attributes to add them to the canvas.
          </small>
        </div>
      </div>

      <div className="fb-api-content">
        <div className="fb-api-grid">
          <label>
            Method
            <select
              value={current.method}
              onChange={(event) =>
                onChange({
                  ...current,
                  method: event.target.value as ApiAction["method"],
                })
              }
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
          <label>
            Endpoint URL
            <input
              placeholder="https://api.example.com/assets"
              value={current.url}
              onChange={(event) =>
                onChange({ ...current, url: event.target.value })
              }
            />
          </label>
        </div>

        <div className="fb-api-section">
          <div className="fb-api-section-title">
            <strong>Authentication Profile</strong>
            <span>Reusable server-side credential for loading form data</span>
          </div>
          <select
            value={current.authProfileId || ""}
            onChange={(event) =>
              onChange({
                ...current,
                authProfileId: event.target.value || undefined,
              })
            }
          >
            <option value="">None / use headers below</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={String(profile.id)}>
                {profile.name} · {profile.auth_type}
              </option>
            ))}
          </select>
        </div>

        <div className="fb-api-section">
          <div className="fb-api-section-title">
            <strong>Headers</strong>
            <span>One header per row</span>
          </div>
          {renderRows("headers", headers)}
        </div>

        <div className="fb-api-section">
          <div className="fb-api-section-title">
            <strong>Query parameters</strong>
            <span>One parameter per row</span>
          </div>
          {renderRows("params", params)}
        </div>

        <div className="fb-integration-testbar">
          <button
            className="secondary-button"
            type="button"
            disabled={testing || !current.url}
            onClick={testRequest}
          >
            {testing ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            Test Request
          </button>
          {error && <span className="fb-inline-error">{error}</span>}
        </div>

        {paths.length > 0 && (
          <div className="fb-available-fields">
            <div>
              <strong>Response attributes</strong>
              <span>Click an attribute to add it as a form component.</span>
            </div>
            <div className="fb-field-tokens">
              {paths.map((path) => (
                <button
                  key={path}
                  type="button"
                  disabled={fields.some((field) => field.sourcePath === path)}
                  onClick={() => onAddField(path)}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>
        )}

        {response !== undefined && (
          <details className="fb-api-response">
            <summary>Test response</summary>
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </details>
        )}
      </div>
    </section>
  );
}
