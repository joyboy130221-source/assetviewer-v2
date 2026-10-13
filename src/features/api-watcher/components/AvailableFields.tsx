import { useMemo, useState } from "react";
export function AvailableFields({
  templates,
  onInsert,
}: {
  templates: string[];
  onInsert?: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      templates
        .filter((x) => x.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 80),
    [templates, q],
  );
  return (
    <aside className="aw-fields-panel">
      <strong>Available Fields</strong>
      <small>
        Click a field to insert it into the active request template.
      </small>
      <input
        placeholder="Search fields..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div>
        {filtered.map((t) => (
          <button type="button" key={t} onClick={() => onInsert?.(t)}>
            {t}
          </button>
        ))}
      </div>
    </aside>
  );
}
