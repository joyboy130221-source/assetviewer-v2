import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ApiAction, FormField } from "../model/form.types";
import { api } from "../../../services/api";
import { formApi } from "../services/formApi";

const DEFAULT_ACTION: ApiAction = {
  enabled: false,
  method: "POST",
  url: "",
  headers: {},
  params: {},
  body: {},
};

type KeyValueRow = { id: string; key: string; value: string };

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

export function ApiActionPanel({
  action,
  fields,
  onChange,
  title = "Submission API Action",
  description = "Optionally call an external API after the form submission is safely stored.",
}: {
  action?: ApiAction | null;
  fields: FormField[];
  onChange: (action: ApiAction) => void;
  title?: string;
  description?: string;
}) {
  const current = action || DEFAULT_ACTION;
  const [headers, setHeaders] = useState<KeyValueRow[]>(() =>
    toRows(current.headers),
  );
  const [params, setParams] = useState<KeyValueRow[]>(() =>
    toRows(current.params),
  );
  const [bodyText, setBodyText] = useState(() =>
    JSON.stringify(current.body || {}, null, 2),
  );
  const [bodyError, setBodyError] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [debug, setDebug] = useState<any>(null);
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const activeEditor = useRef<{
    kind: "url" | "body" | "header" | "param";
    rowId?: string;
    start: number;
    end: number;
  } | null>(null);

  const rememberCursor = (
    kind: "url" | "body" | "header" | "param",
    target: HTMLInputElement | HTMLTextAreaElement,
    rowId?: string,
  ) => {
    activeEditor.current = {
      kind,
      rowId,
      start: target.selectionStart ?? target.value.length,
      end: target.selectionEnd ?? target.value.length,
    };
  };

  useEffect(() => {
    const insertTemplate = (event: Event) => {
      const template = (event as CustomEvent<{ template?: string }>).detail
        ?.template;
      const editor = activeEditor.current;
      if (!template || !editor) return;

      const insertAt = (value: string) => {
        const start = Math.min(editor.start, value.length);
        const end = Math.min(editor.end, value.length);
        editor.start = editor.end = start + template.length;
        return `${value.slice(0, start)}${template}${value.slice(end)}`;
      };

      if (editor.kind === "url") {
        onChange({ ...current, url: insertAt(current.url || "") });
        return;
      }
      if (editor.kind === "body") {
        updateBody(insertAt(bodyText));
        return;
      }

      const kind = editor.kind === "header" ? "headers" : "params";
      const rows = kind === "headers" ? headers : params;
      updateRows(
        kind,
        rows.map((row) =>
          row.id === editor.rowId
            ? { ...row, value: insertAt(row.value) }
            : row,
        ),
      );
    };

    window.addEventListener("bib:insert-template", insertTemplate);
    return () =>
      window.removeEventListener("bib:insert-template", insertTemplate);
  });
  useEffect(() => {
    api<any>("/api/admin/authentication-profiles")
      .then((x) => setProfiles(x.data))
      .catch(() => setProfiles([]));
  }, []);

  const updateRows = (kind: "headers" | "params", rows: KeyValueRow[]) => {
    if (kind === "headers") setHeaders(rows);
    else setParams(rows);
    onChange({ ...current, [kind]: fromRows(rows) });
  };

  const updateBody = (text: string) => {
    setBodyText(text);
    try {
      const parsed = JSON.parse(text || "{}");
      setBodyError("");
      onChange({ ...current, body: parsed });
    } catch {
      setBodyError(
        "Body must be valid JSON. Templates such as {{assetNumber}} can be used as values.",
      );
    }
  };

  const renderRows = (kind: "headers" | "params", rows: KeyValueRow[]) => (
    <div className="fb-kv-list">
      {rows.map((row) => (
        <div className="fb-kv-row" key={row.id}>
          <input
            aria-label={`${kind} key`}
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
            aria-label={`${kind} value`}
            placeholder="Value"
            value={row.value}
            onFocus={(event) =>
              rememberCursor(
                kind === "headers" ? "header" : "param",
                event.currentTarget,
                row.id,
              )
            }
            onSelect={(event) =>
              rememberCursor(
                kind === "headers" ? "header" : "param",
                event.currentTarget,
                row.id,
              )
            }
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
            type="button"
            className="fb-icon-button"
            title="Remove row"
            onClick={() =>
              updateRows(
                kind,
                rows.length === 1
                  ? [{ ...rows[0], key: "", value: "" }]
                  : rows.filter((item) => item.id !== row.id),
              )
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="fb-add-row"
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

  return (
    <section className="fb-api-action">
      <div className="fb-api-title">
        <div>
          <strong>{title}</strong>
          <small>{description}</small>
        </div>
        <label className="fb-switch-row">
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(event) =>
              onChange({ ...current, enabled: event.target.checked })
            }
          />
          <span>Enabled</span>
        </label>
      </div>

      {current.enabled && (
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
                {["POST", "PUT", "PATCH", "DELETE", "GET"].map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <label>
              Endpoint URL
              <input
                placeholder="https://api.example.com/assets/{{assetNumber}}"
                value={current.url}
                onFocus={(event) => rememberCursor("url", event.currentTarget)}
                onSelect={(event) => rememberCursor("url", event.currentTarget)}
                onChange={(event) =>
                  onChange({ ...current, url: event.target.value })
                }
              />
            </label>
          </div>

          <div className="fb-api-section">
            <div className="fb-api-section-title">
              <strong>Authentication Profile</strong>
              <span>Reusable server-side credential</span>
            </div>
            <select
              value={current.authProfileId || ""}
              onChange={(e) =>
                onChange({
                  ...current,
                  authProfileId: e.target.value || undefined,
                })
              }
            >
              <option value="">None / use headers below</option>
              {profiles.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} · {p.auth_type}
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

          <div className="fb-api-section">
            <div className="fb-api-section-title">
              <strong>Body</strong>
              <span>JSON request body</span>
            </div>
            <textarea
              className="fb-api-body"
              rows={10}
              value={bodyText}
              onFocus={(event) => rememberCursor("body", event.currentTarget)}
              onSelect={(event) => rememberCursor("body", event.currentTarget)}
              onChange={(event) => updateBody(event.target.value)}
            />
            {bodyError && <div className="fb-inline-error">{bodyError}</div>}
          </div>

          <div className="fb-debug-panel">
            <div className="fb-api-section-title">
              <strong>Advanced Debugger</strong>
              <span>Preview the fully resolved request and response.</span>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={testing || !current.url}
              onClick={async () => {
                setTesting(true);
                setTestError("");
                try {
                  const context = Object.fromEntries(
                    fields.map((f) => [
                      f.name,
                      f.defaultValue || `sample_${f.name}`,
                    ]),
                  );
                  const r = await formApi.testIntegration(current, context);
                  setDebug({ ...r.debug, response: r.response });
                } catch (e: any) {
                  setTestError(e.message);
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? "Testing…" : "Test Submission API"}
            </button>
            {testError && <div className="fb-inline-error">{testError}</div>}
            {debug && (
              <pre className="fb-debug-output">
                {JSON.stringify(debug, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
