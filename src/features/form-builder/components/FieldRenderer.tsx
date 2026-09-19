import type { FormField } from "../model/form.types";
export function FieldRenderer({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: FormField;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
}) {
  const common = {
    id: field.id,
    name: field.name,
    disabled: disabled || Boolean(field.readOnly),
    required: field.required,
  };
  return (
    <div className="fb-render-field">
      <label htmlFor={field.id}>
        {field.label}
        {field.required && <span className="required-mark"> *</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...common}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : field.type === "checkbox" ? (
        <label className="fb-check">
          <input
            {...common}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange?.(e.target.checked)}
          />{" "}
          <span>{field.placeholder || "Yes"}</span>
        </label>
      ) : field.type === "combobox" ? (
        <select
          {...common}
          value={String(value ?? "")}
          onChange={(e) => onChange?.(e.target.value)}
        >
          <option value="">{field.placeholder || "Select an option"}</option>
          {field.options
            ?.filter((option) => option.trim())
            .map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
        </select>
      ) : field.type === "radio" ? (
        <div className="fb-radio-group">
          {field.options
            ?.filter((option) => option.trim())
            .map((option) => (
              <label key={option}>
                <input
                  name={field.name}
                  disabled={disabled || Boolean(field.readOnly)}
                  required={field.required}
                  type="radio"
                  value={option}
                  checked={value === option}
                  onChange={() => onChange?.(option)}
                />{" "}
                {option}
              </label>
            ))}
        </div>
      ) : (
        <input
          {...common}
          type={field.type}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </div>
  );
}
