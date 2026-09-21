import type { FormField } from "../model/form.types";

interface AvailableFieldsPanelProps {
  fields: FormField[];
}

export function AvailableFieldsPanel({ fields }: AvailableFieldsPanelProps) {
  const insertTemplate = async (name: string) => {
    const template = `{{${name}}}`;

    // Let the last focused API editor insert the token at its saved cursor.
    // The custom event is intentionally global because Available Fields sits
    // outside individual API/workflow panels.
    window.dispatchEvent(
      new CustomEvent("bib:insert-template", { detail: { template } }),
    );

    // Keep clipboard behavior as a useful fallback.
    try {
      await navigator.clipboard.writeText(template);
    } catch {
      // Clipboard can be unavailable in non-secure/local browser contexts.
    }
  };

  return (
    <section className="fb-available-fields fb-available-fields-standalone">
      <div>
        <strong>Available Fields</strong>
        <span>
          Available for API, Service Bus, RPA and form templates. The system
          token {"{{uuid}}"} generates a UUID once per form request/execution.
          Click a token to insert it at the last active template editor cursor
          (and copy it to the clipboard).
        </span>
      </div>
      <div className="fb-field-tokens">
        <button
          type="button"
          title="Insert {{uuid}} (generated once per form request/execution)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => insertTemplate("uuid")}
        >
          {"{{uuid}}"}
        </button>
        {fields.map((field) => (
          <button
            key={field.id}
            type="button"
            title={`Insert {{${field.name}}}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertTemplate(field.name)}
          >
            {`{{${field.name}}}`}
          </button>
        ))}
        {!fields.length && (
          <small>Add fields to the form to make templates available.</small>
        )}
      </div>
    </section>
  );
}
