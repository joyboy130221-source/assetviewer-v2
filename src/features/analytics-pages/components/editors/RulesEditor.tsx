import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  PageRule,
  PreviewItem,
  RuleField,
  RuleOperator,
} from "../../model/analyticsPage.types";
import { RULE_OPERATORS, newRule } from "../../model/analyticsPageCatalog";
import { ParameterMappingsEditor } from "./ParameterMappingsEditor";

export type AnalyticsOption = {
  id: string;
  name: string;
  status: string;
  /** {{parameter}} names the analytic declares (suggestions). */
  queryParams: string[];
};

type Props = {
  value: PageRule[];
  onChange: (value: PageRule[]) => void;
  analytics: AnalyticsOption[];
  /** Last tested items with their route, to show what each rule matches. */
  preview: PreviewItem[] | null;
  maxRules?: number;
};

/**
 * Routing rules, checked top to bottom (first match wins): which analytic
 * an item opens and which parameters it receives.
 */
export function RulesEditor({
  value,
  onChange,
  analytics,
  preview,
  maxRules,
}: Props) {
  const set = (index: number, patch: Partial<PageRule>) =>
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) => {
    const next = [...value];
    const [rule] = next.splice(index, 1);
    next.splice(index + delta, 0, rule);
    onChange(next);
  };
  const matchedBy = (ruleId: string) =>
    preview?.filter((i) => i.route?.ruleId === ruleId) ?? [];

  return (
    <div className="ap-rules">
      <div className="an-section-title">
        <b>Rules</b>
        <button
          className="secondary-button"
          disabled={maxRules != null && value.length >= maxRules}
          onClick={() => onChange([...value, newRule()])}
        >
          <Plus size={14} /> Add rule
        </button>
      </div>
      <small>
        Checked top to bottom; the first matching rule decides the chart.
      </small>
      {value.map((rule, index) => {
        const target = analytics.find((a) => a.id === rule.analyticsId);
        const matched = matchedBy(rule.id);
        return (
          <article className="ap-rule" key={rule.id}>
            <header>
              <b>Rule {index + 1}</b>
              <div>
                <button
                  className="an-icon-plain"
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="an-icon-plain"
                  title="Move down"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  className="an-icon-plain"
                  title="Remove rule"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </header>
            <div className="ap-rule-when">
              <span>When item</span>
              <select
                aria-label="Field"
                value={rule.match.field}
                onChange={(e) =>
                  set(index, {
                    match: {
                      ...rule.match,
                      field: e.target.value as RuleField,
                    },
                  })
                }
              >
                <option value="label">label</option>
                <option value="value">value</option>
              </select>
              <select
                aria-label="Operator"
                value={rule.match.operator}
                onChange={(e) =>
                  set(index, {
                    match: {
                      ...rule.match,
                      operator: e.target.value as RuleOperator,
                    },
                  })
                }
              >
                {RULE_OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Text"
                placeholder="MS Azure IoT"
                value={rule.match.text}
                onChange={(e) =>
                  set(index, { match: { ...rule.match, text: e.target.value } })
                }
              />
              <label className="an-check">
                <input
                  type="checkbox"
                  checked={rule.match.ignoreCase}
                  onChange={(e) =>
                    set(index, {
                      match: { ...rule.match, ignoreCase: e.target.checked },
                    })
                  }
                />{" "}
                Ignore case
              </label>
            </div>
            <label>
              Show chart
              <select
                value={rule.analyticsId}
                onChange={(e) => set(index, { analyticsId: e.target.value })}
              >
                <option value="">Choose an analytic…</option>
                {analytics.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.status !== "published" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {target && target.status !== "published" && (
              <small className="an-hint">
                This analytic is a draft: it works in the preview, but published
                pages only open published analytics.
              </small>
            )}
            <ParameterMappingsEditor
              value={rule.parameters}
              onChange={(parameters) => set(index, { parameters })}
              suggestions={target?.queryParams ?? []}
            />
            {preview && (
              <small className={matched.length ? "" : "an-hint"}>
                {matched.length
                  ? `Matches ${matched.length} item(s): ${matched
                      .slice(0, 5)
                      .map((i) => i.label)
                      .join(", ")}${matched.length > 5 ? "…" : ""}`
                  : "Matches no tested item."}
              </small>
            )}
          </article>
        );
      })}
    </div>
  );
}
