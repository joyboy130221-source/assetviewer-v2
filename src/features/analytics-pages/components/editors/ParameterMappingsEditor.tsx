import { Plus, Trash2 } from "lucide-react";
import type {
  ParameterMapping,
  ParameterSource,
} from "../../model/analyticsPage.types";
import { PARAMETER_SOURCES } from "../../model/analyticsPageCatalog";

/**
 * {{parameters}} a chart receives, e.g. TabName ← selected item value.
 * They override host-link parameters of the same name.
 */
export function ParameterMappingsEditor({
  value,
  onChange,
  sources = PARAMETER_SOURCES.map((s) => s.value),
  suggestions = [],
}: {
  value: ParameterMapping[];
  onChange: (value: ParameterMapping[]) => void;
  /** Allowed sources (the default chart only allows fixed values). */
  sources?: ParameterSource[];
  /** Parameter names the target chart uses, offered as suggestions. */
  suggestions?: string[];
}) {
  const listId = `ap-param-suggestions-${suggestions.join("-")}`;
  const options = PARAMETER_SOURCES.filter((s) => sources.includes(s.value));
  const set = (index: number, patch: Partial<ParameterMapping>) =>
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  return (
    <div className="ap-rows">
      <div className="an-section-title">
        <b>Chart parameters</b>
        <button
          className="secondary-button"
          onClick={() =>
            onChange([...value, { name: "", source: sources[0], value: "" }])
          }
        >
          <Plus size={14} /> Add parameter
        </button>
      </div>
      {!value.length && (
        <small className="an-hint">
          No parameters: the chart only receives the page parameters.
        </small>
      )}
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {value.map((m, index) => (
        <div className="ap-row three" key={index}>
          <input
            aria-label="Parameter name"
            placeholder="TabName"
            list={suggestions.length ? listId : undefined}
            value={m.name}
            onChange={(e) => set(index, { name: e.target.value })}
          />
          <select
            aria-label="Value from"
            value={m.source}
            disabled={options.length < 2}
            onChange={(e) =>
              set(index, { source: e.target.value as ParameterSource })
            }
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Fixed value"
            placeholder={
              m.source === "fixed" ? "Value" : "From the selected item"
            }
            disabled={m.source !== "fixed"}
            value={m.source === "fixed" ? m.value : ""}
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
    </div>
  );
}
