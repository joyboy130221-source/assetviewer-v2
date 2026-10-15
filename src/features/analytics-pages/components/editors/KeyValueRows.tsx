import { Plus, Trash2 } from "lucide-react";

export type KeyValue = { key: string; value: string };

/** Editable key/value rows (headers, query parameters). */
export function KeyValueRows({
  label,
  rows,
  onChange,
  keyPlaceholder = "Name",
  valuePlaceholder = "Value or {{parameter}}",
}: {
  label: string;
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const set = (index: number, patch: Partial<KeyValue>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <div className="ap-rows">
      <div className="an-section-title">
        <b>{label}</b>
        <button
          className="secondary-button"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {rows.map((row, index) => (
        <div className="ap-row two" key={index}>
          <input
            aria-label={`${label} name`}
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => set(index, { key: e.target.value })}
          />
          <input
            aria-label={`${label} value`}
            placeholder={valuePlaceholder}
            value={row.value}
            onChange={(e) => set(index, { value: e.target.value })}
          />
          <button
            className="an-icon-plain"
            title="Remove"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
