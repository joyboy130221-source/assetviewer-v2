import { useEffect, useState } from "react";
import type { JsonValue } from "../../model/analytics.types";

type Props = {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  /** Runtime parameter names, shown as insertable {{templates}}. */
  parameters: string[];
};

const pretty = (value: JsonValue | undefined) =>
  JSON.stringify(value ?? {}, null, 2);

/**
 * JSON request-body editor. Text is edited freely; the definition only
 * receives a value when the text parses, so an invalid draft never reaches
 * Test & Preview or Save.
 */
export function JsonBodyEditor({ value, onChange, parameters }: Props) {
  const [text, setText] = useState(() => pretty(value));
  const [error, setError] = useState("");

  // Follow external changes (e.g. loading a saved definition) unless the
  // current draft already represents the same value.
  useEffect(() => {
    try {
      if (JSON.stringify(JSON.parse(text)) === JSON.stringify(value ?? {}))
        return;
    } catch {
      /* draft is invalid: replace it with the external value */
    }
    setText(pretty(value));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const change = (next: string) => {
    setText(next);
    try {
      const parsed = next.trim() ? (JSON.parse(next) as JsonValue) : {};
      if (parsed === null || typeof parsed !== "object") {
        setError("The body must be a JSON object or array.");
        return;
      }
      setError("");
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON.");
    }
  };

  return (
    <label className="an-json-body">
      Request body (JSON)
      <textarea
        rows={12}
        spellCheck={false}
        value={text}
        aria-invalid={!!error}
        onChange={(e) => change(e.target.value)}
        onBlur={() =>
          !error && setText(pretty(JSON.parse(text || "{}") as JsonValue))
        }
      />
      {error ? (
        <small className="an-json-error">{error}</small>
      ) : (
        <small>
          Use templates in string values, e.g.{" "}
          <code>{'"value": "{{CODE}}"'}</code>
          {parameters.length > 0 && (
            <>
              . Available:{" "}
              {parameters.map((p) => (
                <code key={p}>{`{{${p}}}`}</code>
              ))}
            </>
          )}
          .
        </small>
      )}
    </label>
  );
}
