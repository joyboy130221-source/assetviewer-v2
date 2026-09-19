import type { FormField } from "../model/form.types";
export function PropertiesPanel({
  field,
  onChange,
}: {
  field?: FormField;
  onChange: (field: FormField) => void;
}) {
  if (!field)
    return (
      <aside className="fb-panel">
        <div className="fb-panel-head">
          <strong>Properties</strong>
          <span>Select a component</span>
        </div>
        <div className="fb-properties-empty">
          Select a field on the canvas to configure its properties.
        </div>
      </aside>
    );
  const patch = (value: Partial<FormField>) => onChange({ ...field, ...value });
  return (
    <aside className="fb-panel">
      <div className="fb-panel-head">
        <strong>Properties</strong>
        <span>{field.type}</span>
      </div>
      <div className="fb-properties">
        <label>
          Component ID
          <input value={field.id} readOnly />
        </label>
        <label>
          Name
          <input
            value={field.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label>
          Label
          <input
            value={field.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
        {field.type !== "date" && field.type !== "radio" && (
          <label>
            Placeholder
            <input
              value={field.placeholder || ""}
              onChange={(e) => patch({ placeholder: e.target.value })}
            />
          </label>
        )}
        {["radio", "combobox"].includes(field.type) && (
          <label>
            Options
            <textarea
              rows={5}
              value={(field.options || []).join("\n")}
              onChange={(e) => patch({ options: e.target.value.split("\n") })}
            />
            <small>One option per line</small>
          </label>
        )}
        <label className="fb-required-row">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          <span>Required field</span>
        </label>
        <label>
          Default value / template
          <input
            value={field.defaultValue || ""}
            placeholder="Example: {{assetId}}"
            onChange={(e) => patch({ defaultValue: e.target.value })}
          />
          <small>
            Public form query parameters can be referenced with{" "}
            {"{{parameterName}}"}.
          </small>
        </label>
        <div className="fb-validation-box">
          <strong>Advanced Validation</strong>
          <div className="fb-mini-grid">
            <label>
              Min length
              <input
                type="number"
                value={field.validation?.minLength ?? ""}
                onChange={(e) =>
                  patch({
                    validation: {
                      ...field.validation,
                      minLength: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    },
                  })
                }
              />
            </label>
            <label>
              Max length
              <input
                type="number"
                value={field.validation?.maxLength ?? ""}
                onChange={(e) =>
                  patch({
                    validation: {
                      ...field.validation,
                      maxLength: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    },
                  })
                }
              />
            </label>
            <label>
              Minimum
              <input
                type="number"
                value={field.validation?.min ?? ""}
                onChange={(e) =>
                  patch({
                    validation: {
                      ...field.validation,
                      min: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </label>
            <label>
              Maximum
              <input
                type="number"
                value={field.validation?.max ?? ""}
                onChange={(e) =>
                  patch({
                    validation: {
                      ...field.validation,
                      max: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </label>
          </div>
          <label>
            Pattern (RegExp)
            <input
              value={field.validation?.pattern || ""}
              onChange={(e) =>
                patch({
                  validation: { ...field.validation, pattern: e.target.value },
                })
              }
            />
          </label>
          <label>
            Custom error message
            <input
              value={field.validation?.message || ""}
              onChange={(e) =>
                patch({
                  validation: { ...field.validation, message: e.target.value },
                })
              }
            />
          </label>
        </div>
        <label className="fb-required-row">
          <input
            type="checkbox"
            checked={Boolean(field.readOnly)}
            onChange={(e) => patch({ readOnly: e.target.checked })}
          />
          <span>Read only</span>
        </label>
      </div>
    </aside>
  );
}
