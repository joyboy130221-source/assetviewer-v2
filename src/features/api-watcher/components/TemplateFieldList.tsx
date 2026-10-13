import { useMemo, useState } from "react";
import { preserveFieldFocus } from "../../../shared/workflow/useTemplateInsertion";

/**
 * Searchable "Available Fields" panel. Clicking a token inserts it into the
 * last focused template-aware parameter of the adjacent editor.
 */
export function TemplateFieldList({
  templates,
  onInsert,
  hint,
}: {
  templates: string[];
  onInsert: (template: string) => void;
  hint?: string;
}) {
  const [q, setQ] = useState("");
  const normalizedQuery = q.trim().toLowerCase();
  const unique = useMemo(() => [...new Set(templates)], [templates]);
  const filtered = useMemo(
    () =>
      unique.filter(
        (x) => !normalizedQuery || x.toLowerCase().includes(normalizedQuery),
      ),
    [unique, normalizedQuery],
  );
  return (
    <aside className="aw-fields-panel">
      <div className="aw-fields-header">
        <strong>Available Fields</strong>
        <small>
          {hint ||
            "Click a field to insert it at the cursor of the last selected parameter."}{" "}
          For array responses, use a zero-based index such as{" "}
          <code>{"{{steps.step1.member[0].href}}"}</code>.
        </small>
        <input
          placeholder="Search available fields..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="aw-fields-list" role="list">
        {filtered.map((t) => (
          <button
            type="button"
            role="listitem"
            title={t}
            key={t}
            {...preserveFieldFocus}
            onClick={() => onInsert(t)}
          >
            {t}
          </button>
        ))}
        {!filtered.length && (
          <small className="aw-fields-empty">No matching fields.</small>
        )}
      </div>
    </aside>
  );
}
