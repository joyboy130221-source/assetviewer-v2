import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { Organization } from "../model/form.types";

type Props = {
  organizations: Organization[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  title?: string;
  className?: string;
};

export function TenantCombobox({
  organizations,
  value,
  onChange,
  placeholder = "Select organization / tenant",
  title,
  className = "",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = organizations.find((o) => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword.length < 3) return organizations;
    return organizations.filter((o) =>
      `${o.code} ${o.name}`.toLowerCase().includes(keyword),
    );
  }, [organizations, query]);

  return (
    <div ref={rootRef} className={`tenant-combobox ${className}`} title={title}>
      <button
        type="button"
        className="tenant-combobox-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "is-placeholder"}>
          {selected ? `${selected.code} — ${selected.name}` : placeholder}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="tenant-combobox-popover">
          <div className="tenant-combobox-search">
            <Search size={15} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tenant (min. 3 characters)"
              aria-label="Search organization or tenant"
            />
          </div>
          <div className="tenant-combobox-options" role="listbox">
            {query.trim().length > 0 && query.trim().length < 3 && (
              <div className="tenant-combobox-hint">
                Type at least 3 characters to filter.
              </div>
            )}
            {matches.map((org) => (
              <button
                type="button"
                role="option"
                aria-selected={org.id === value}
                className={org.id === value ? "is-selected" : ""}
                key={org.id}
                onClick={() => {
                  onChange(org.id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <strong>{org.name}</strong>
                <small>{org.code}</small>
              </button>
            ))}
            {!matches.length && (
              <div className="tenant-combobox-empty">No tenant found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
