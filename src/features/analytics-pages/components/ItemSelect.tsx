import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ViewerItem } from "../model/analyticsPage.types";

type Props = {
  label: string;
  items: ViewerItem[];
  value: string;
  onChange: (value: string) => void;
  /** Show a search box above this many items (0 = always). */
  searchThreshold: number;
  disabled?: boolean;
};

/**
 * Dropdown of page items. A search box filters long lists locally; the
 * selected item always stays in the list so the select never goes blank.
 */
export function ItemSelect({
  label,
  items,
  value,
  onChange,
  searchThreshold,
  disabled,
}: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const searchable = items.length > searchThreshold;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return items;
    return items.filter(
      (i) => i.value === value || i.label.toLowerCase().includes(q),
    );
  }, [items, query, searchable, value]);

  return (
    <div className="ap-select">
      <label htmlFor={id}>{label}</label>
      <div className="ap-select-controls">
        {searchable && (
          <span className="ap-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              placeholder="Search…"
              aria-label={`Search ${label}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        )}
        <select
          id={id}
          value={value}
          disabled={disabled || !items.length}
          onChange={(e) => onChange(e.target.value)}
        >
          {visible.map((item) => (
            <option key={item.value} value={item.value}>
              {item.available ? item.label : `${item.label} (no chart)`}
            </option>
          ))}
        </select>
        {searchable && query && (
          <small className="ap-select-count">
            {visible.length} of {items.length}
          </small>
        )}
      </div>
    </div>
  );
}
