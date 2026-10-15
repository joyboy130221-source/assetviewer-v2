import { useMemo } from "react";
import type {
  AnalyticsBuilderLimits,
  AnalyticsSourceMethod,
} from "../../../analytics/model/analytics.types";
import { JsonBodyEditor } from "../../../analytics/components/editors/JsonBodyEditor";
import { SourceTimeoutField } from "../../../analytics/components/editors/SourceTimeoutField";
import {
  compactQueryParameters,
  normalizeQueryParameters,
} from "../../../../shared/http/queryParams";
import type { RestDataSource } from "../../model/analyticsPage.types";
import { KeyValueRows, type KeyValue } from "./KeyValueRows";

export type AuthProfileOption = { id: string; name: string };

type Props = {
  value: RestDataSource;
  onChange: (value: RestDataSource) => void;
  profiles: AuthProfileOption[];
  /** {{parameter}} names available to templates (shown as hints). */
  parameters: string[];
  limits: AnalyticsBuilderLimits | null;
};

const toRows = (headers: Record<string, string>): KeyValue[] =>
  Object.entries(headers).map(([key, value]) => ({ key, value }));
const toObject = (rows: KeyValue[]) =>
  Object.fromEntries(
    rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
  );

/**
 * A REST request with the same options as an analytic's data source:
 * method, URL, headers, query parameters, JSON body (POST), Authentication
 * Profile, Records Path and timeout.
 */
export function RestSourceEditor({
  value,
  onChange,
  profiles,
  parameters,
  limits,
}: Props) {
  const action = value.action;
  const setAction = (patch: Partial<RestDataSource["action"]>) =>
    onChange({ ...value, action: { ...action, ...patch } });
  const headerRows = useMemo(
    () => toRows(action.headers ?? {}),
    [action.headers],
  );
  const paramRows = useMemo(
    () => normalizeQueryParameters(action.params),
    [action.params],
  );

  return (
    <div className="ap-rest">
      <div className="an-fields ap-method-url">
        <label>
          Method
          <select
            value={action.method}
            onChange={(e) =>
              setAction({ method: e.target.value as AnalyticsSourceMethod })
            }
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </label>
        <label>
          URL
          <input
            placeholder="https://…/api/items?code={{CODE}}"
            value={action.url}
            onChange={(e) => setAction({ url: e.target.value })}
          />
        </label>
      </div>
      <KeyValueRows
        label="Headers"
        rows={headerRows}
        onChange={(rows) => setAction({ headers: toObject(rows) })}
      />
      <KeyValueRows
        label="Query parameters"
        rows={paramRows}
        onChange={(rows) => setAction({ params: compactQueryParameters(rows) })}
      />
      {action.method === "POST" && (
        <JsonBodyEditor
          value={action.body}
          parameters={parameters}
          onChange={(body) => setAction({ body, bodyFormat: "json" })}
        />
      )}
      <div className="an-fields three">
        <label>
          Authentication profile
          <select
            value={action.authProfileId ?? ""}
            onChange={(e) =>
              setAction({ authProfileId: e.target.value || undefined })
            }
          >
            <option value="">None</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Records Path
          <input
            placeholder="DATA.Tab"
            value={value.arrayPath}
            onChange={(e) => onChange({ ...value, arrayPath: e.target.value })}
          />
        </label>
        <SourceTimeoutField
          value={action.timeoutMs}
          limits={limits?.sourceTimeoutMs ?? null}
          onChange={(timeoutMs) => setAction({ timeoutMs })}
        />
      </div>
      {parameters.length > 0 && (
        <small>
          Page parameters you can use:{" "}
          {parameters.map((p) => (
            <code key={p}>{`{{${p}}}`} </code>
          ))}
        </small>
      )}
    </div>
  );
}
