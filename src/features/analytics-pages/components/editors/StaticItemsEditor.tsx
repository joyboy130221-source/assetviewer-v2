import { Plus, Trash2 } from "lucide-react";
import type { PageItem } from "../../model/analyticsPage.types";

/** Fixed dropdown items: label shown to viewers, value passed to charts. */
export function StaticItemsEditor({
  value,
  onChange,
  maxItems,
}: {
  value: PageItem[];
  onChange: (value: PageItem[]) => void;
  maxItems?: number;
}) {
  const set = (index: number, patch: Partial<PageItem>) =>
    onChange(
      value.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const duplicates = new Set(
    value
      .map((i) => i.value.trim())
      .filter((v, i, all) => v && all.indexOf(v) !== i),
  );
  return (
    <div className="ap-rows">
      <div className="an-section-title">
        <b>Items</b>
        <button
          className="secondary-button"
          disabled={maxItems != null && value.length >= maxItems}
          onClick={() => onChange([...value, { label: "", value: "" }])}
        >
          <Plus size={14} /> Add item
        </button>
      </div>
      {!value.length && (
        <small className="an-hint">Add at least one item.</small>
      )}
      {value.map((item, index) => (
        <div className="ap-row two" key={index}>
          <input
            aria-label="Item label"
            placeholder="Label (shown)"
            value={item.label}
            onChange={(e) => set(index, { label: e.target.value })}
          />
          <input
            aria-label="Item value"
            placeholder="Value (passed to the chart)"
            aria-invalid={duplicates.has(item.value.trim()) || undefined}
            value={item.value}
            onChange={(e) => set(index, { value: e.target.value })}
          />
          <button
            className="an-icon-plain"
            title="Remove"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {duplicates.size > 0 && (
        <small className="an-hint">
          Duplicate values are merged when saved: {[...duplicates].join(", ")}.
        </small>
      )}
      {maxItems != null && (
        <small>Up to {maxItems} items (ANALYTICS_PAGE_MAX_ITEMS).</small>
      )}
    </div>
  );
}
