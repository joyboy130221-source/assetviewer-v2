import { useMemo, useState } from "react";
export function SearchableFieldCombo({
  value,
  onChange,
  fields,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  fields: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      fields
        .filter((f) => f.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 100),
    [fields, q],
  );
  return (
    <div className="aw-combo">
      <input
        value={open ? q : value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="aw-combo-menu">
          {filtered.length ? (
            filtered.map((f) => (
              <button
                type="button"
                key={f}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(f);
                  setQ("");
                  setOpen(false);
                }}
              >
                {f}
              </button>
            ))
          ) : (
            <span>No matching fields</span>
          )}
        </div>
      )}
    </div>
  );
}
