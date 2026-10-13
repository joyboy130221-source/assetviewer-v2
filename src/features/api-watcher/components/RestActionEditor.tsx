import { useEffect, useRef, useState } from "react";
import { KeyValueEditor } from "./KeyValueEditor";
import { TemplateFieldList } from "./TemplateFieldList";
import type {
  BodyFormat,
  KeyValue,
  RestAction,
} from "../model/apiWatcher.types";
import {
  compactQueryParameters,
  normalizeQueryParameters,
  type QueryParameters,
} from "../../../shared/http/queryParams";
import { useTemplateInsertion } from "../../../shared/workflow/useTemplateInsertion";

export type AuthProfileOption = { id: string; name: string };

export const kvRows = (
  o: Record<string, string> | QueryParameters,
): KeyValue[] => [
  ...normalizeQueryParameters(o as QueryParameters),
  { key: "", value: "" },
];
export const kvObject = (r: KeyValue[]) =>
  Object.fromEntries(
    r.filter((x) => x.key.trim()).map((x) => [x.key.trim(), x.value]),
  );
const queryList = (r: KeyValue[]) => compactQueryParameters(r);
const bodyText = (a: RestAction) =>
  typeof a.body === "string" ? a.body : JSON.stringify(a.body || {}, null, 2);
const parseBody = (text: string, format: BodyFormat): unknown =>
  format === "json" ? JSON.parse(text || "{}") : text;

/**
 * REST action editor with an Available Fields panel. Tokens are inserted into
 * the last focused parameter (URL, header value, query value or body); with
 * nothing selected they are inserted into the body, as before.
 */
export function RestActionEditor({
  value,
  onChange,
  profiles,
  templates,
  methods = ["GET", "POST", "PUT", "PATCH", "DELETE"],
}: {
  value: RestAction;
  onChange: (v: RestAction) => void;
  profiles: AuthProfileOption[];
  templates: string[];
  methods?: string[];
}) {
  const [headers, setHeaders] = useState<KeyValue[]>(kvRows(value.headers)),
    [params, setParams] = useState<KeyValue[]>(kvRows(value.params)),
    [body, setBody] = useState(bodyText(value));
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const templating = useTemplateInsertion();
  useEffect(() => {
    setHeaders(kvRows(value.headers));
    setParams(kvRows(value.params));
    setBody(bodyText(value));
  }, [value.url]);
  const patch = (p: Partial<RestAction>) =>
    onChange({
      ...value,
      headers: kvObject(headers),
      params: queryList(params),
      ...p,
    });
  const format = (value.bodyFormat || "json") as BodyFormat;
  const changeBody = (text: string) => {
    setBody(text);
    try {
      patch({ body: parseBody(text, format) });
    } catch {
      /* preserve invalid draft until corrected */
    }
  };
  const changeHeaders = (v: KeyValue[]) => {
    setHeaders(v);
    onChange({ ...value, headers: kvObject(v), params: queryList(params) });
  };
  const changeParams = (v: KeyValue[]) => {
    setParams(v);
    onChange({ ...value, headers: kvObject(headers), params: queryList(v) });
  };
  const insertIntoBody = (t: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length,
      end = el.selectionEnd ?? body.length;
    changeBody(`${body.slice(0, start)}${t}${body.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + t.length, start + t.length);
    });
  };
  const insert = (t: string) => {
    if (!templating.insert(t)) insertIntoBody(t);
  };
  const hasBody = !["GET", "HEAD"].includes(value.method.toUpperCase());
  return (
    <div className="aw-action-layout">
      <div className="aw-action-main">
        <div className="aw-grid three">
          <label>
            Method
            <select
              value={value.method}
              onChange={(e) => patch({ method: e.target.value })}
            >
              {(methods.includes(value.method)
                ? methods
                : [value.method, ...methods]
              ).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Authentication Profile
            <select
              value={value.authProfileId || ""}
              onChange={(e) => patch({ authProfileId: e.target.value })}
            >
              <option value="">None</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Endpoint URL
          <input
            value={value.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://example/api/records/{{sourceRecordId}}"
            {...templating.bind("url", (url) => patch({ url }))}
          />
        </label>
        <details>
          <summary>Headers</summary>
          <KeyValueEditor
            rows={headers}
            templates={templates}
            onChange={changeHeaders}
            bindTemplate={templating.bind}
            fieldPrefix="header"
          />
        </details>
        <details>
          <summary>Query Parameters</summary>
          <KeyValueEditor
            rows={params}
            templates={templates}
            onChange={changeParams}
            bindTemplate={templating.bind}
            fieldPrefix="param"
          />
        </details>
        {hasBody && (
          <>
            <div className="aw-grid three">
              <label>
                Body Format
                <select
                  value={format}
                  onChange={(e) => {
                    const f = e.target.value as BodyFormat;
                    patch({ bodyFormat: f, body: f === "json" ? {} : "" });
                    setBody(f === "json" ? "{}" : "");
                  }}
                >
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="text">Text</option>
                </select>
              </label>
            </div>
            <label>
              Request Body
              <textarea
                ref={bodyRef}
                className="aw-json"
                rows={10}
                value={body}
                onChange={(e) => changeBody(e.target.value)}
                {...templating.bind("body", changeBody)}
                placeholder={
                  format === "xml"
                    ? "<Request><Id>{{sourceRecordId}}</Id></Request>"
                    : '{\n  "id": "{{sourceRecordId}}"\n}'
                }
              />
            </label>
          </>
        )}
      </div>
      <div>
        <TemplateFieldList
          templates={templates}
          onInsert={insert}
          hint="Click a field to insert it into the selected URL, header, query parameter or body (body by default)."
        />
      </div>
    </div>
  );
}
