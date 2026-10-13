import { Plus, Trash2 } from "lucide-react";
import type { KeyValue } from "../model/apiWatcher.types";
import type { TemplateBinder } from "../../../shared/workflow/useTemplateInsertion";
export function KeyValueEditor({
  rows,
  onChange,
  templates = [],
  bindTemplate,
  fieldPrefix = "kv",
}: {
  rows: KeyValue[];
  onChange: (v: KeyValue[]) => void;
  templates?: string[];
  /** Lets an Available Fields panel insert tokens into value inputs. */
  bindTemplate?: TemplateBinder;
  /** Distinguishes several editors registered on the same binder. */
  fieldPrefix?: string;
}) {
  const set = (i: number, k: keyof KeyValue, v: string) =>
    onChange(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  const addTemplate = (i: number, t: string) =>
    set(i, "value", `${rows[i]?.value || ""}${t}`);
  return (
    <div className="aw-kv">
      {rows.map((r, i) => (
        <div key={i} className="aw-kv-row">
          <input
            placeholder="Key"
            value={r.key}
            onChange={(e) => set(i, "key", e.target.value)}
          />
          <div className="aw-template-input">
            <input
              placeholder="Value — templates supported"
              value={r.value}
              onChange={(e) => set(i, "value", e.target.value)}
              {...(bindTemplate?.(`${fieldPrefix}.${i}`, (next) =>
                set(i, "value", next),
              ) ?? {})}
            />
            {templates.length > 0 && (
              <select
                aria-label="Insert available field"
                value=""
                onChange={(e) => {
                  if (e.target.value) addTemplate(i, e.target.value);
                }}
              >
                <option value="">+ Field</option>
                {templates.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            type="button"
            title="Remove"
            onClick={() => onChange(rows.filter((_, n) => n !== i))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary-button"
        onClick={() => onChange([...rows, { key: "", value: "" }])}
      >
        <Plus size={14} /> Add
      </button>
    </div>
  );
}
