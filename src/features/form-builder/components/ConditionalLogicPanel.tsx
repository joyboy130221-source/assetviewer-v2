import { Plus, Trash2 } from "lucide-react";
import type { FormField, FormRule } from "../model/form.types";
export function ConditionalLogicPanel({
  rules,
  fields,
  onChange,
}: {
  rules: FormRule[];
  fields: FormField[];
  onChange: (r: FormRule[]) => void;
}) {
  const add = () =>
    onChange([
      ...rules,
      {
        id: crypto.randomUUID(),
        conditionMode: "AND",
        conditions: [
          { field: fields[0]?.name || "", operator: "equals", value: "" },
        ],
        actions: [{ type: "show", field: fields[0]?.name || "" }],
      },
    ]);
  return (
    <section className="fb-api-action">
      <div className="fb-api-title">
        <div>
          <strong>Conditional Logic</strong>
          <small>Configure WHEN / THEN behavior without custom code.</small>
        </div>
        <button type="button" className="secondary-button" onClick={add}>
          <Plus size={15} /> Add Rule
        </button>
      </div>
      <div className="fb-rule-list">
        {rules.map((r, ri) => (
          <div className="fb-rule-card" key={r.id}>
            <div className="fb-rule-head">
              <strong>Rule {ri + 1}</strong>
              <button
                className="fb-icon-button"
                onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="fb-rule-row">
              <b>WHEN</b>
              <select
                value={r.conditions[0]?.field}
                onChange={(e) =>
                  onChange(
                    rules.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            conditions: [
                              { ...x.conditions[0], field: e.target.value },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={r.conditions[0]?.operator}
                onChange={(e) =>
                  onChange(
                    rules.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            conditions: [
                              {
                                ...x.conditions[0],
                                operator: e.target.value as any,
                              },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              >
                {[
                  "equals",
                  "notEquals",
                  "contains",
                  "empty",
                  "notEmpty",
                  "greaterThan",
                  "lessThan",
                ].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <input
                value={r.conditions[0]?.value || ""}
                disabled={["empty", "notEmpty"].includes(
                  r.conditions[0]?.operator,
                )}
                onChange={(e) =>
                  onChange(
                    rules.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            conditions: [
                              { ...x.conditions[0], value: e.target.value },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              />
            </div>
            <div className="fb-rule-row">
              <b>THEN</b>
              <select
                value={r.actions[0]?.type}
                onChange={(e) =>
                  onChange(
                    rules.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            actions: [
                              { ...x.actions[0], type: e.target.value as any },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              >
                {[
                  "show",
                  "hide",
                  "enable",
                  "disable",
                  "required",
                  "setValue",
                ].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <select
                value={r.actions[0]?.field}
                onChange={(e) =>
                  onChange(
                    rules.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            actions: [
                              { ...x.actions[0], field: e.target.value },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.label}
                  </option>
                ))}
              </select>
              {r.actions[0]?.type === "setValue" && (
                <input
                  value={r.actions[0]?.value || ""}
                  placeholder="Value / {{template}}"
                  onChange={(e) =>
                    onChange(
                      rules.map((x) =>
                        x.id === r.id
                          ? {
                              ...x,
                              actions: [
                                { ...x.actions[0], value: e.target.value },
                              ],
                            }
                          : x,
                      ),
                    )
                  }
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
