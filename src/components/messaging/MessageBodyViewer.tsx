import { useMemo, useState } from "react";
import { Copy } from "lucide-react";

type Props = {
  body: unknown;
  contentType?: string | null;
  format?: string | null;
  onCopy?: (text: string) => void;
};

function bodyText(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
function detect(
  text: string,
  contentType?: string | null,
  format?: string | null,
) {
  const hint = `${format || ""} ${contentType || ""}`.toLowerCase();
  if (hint.includes("json")) return "JSON";
  if (hint.includes("xml")) return "XML";
  const s = text.trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      JSON.parse(s);
      return "JSON";
    } catch {}
  }
  if (s.startsWith("<") && s.endsWith(">")) return "XML";
  return "TEXT";
}
function prettyXml(xml: string) {
  const compact = xml.replace(/>\s*</g, "><").trim();
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(compact, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Invalid XML");
  }
  const tokens = compact.replace(/</g, "\n<").trim().split("\n");
  let depth = 0;
  return tokens
    .map((token) => {
      const t = token.trim();
      if (/^<\/(?!.*<\/)/.test(t)) depth = Math.max(0, depth - 1);
      const line = `${"  ".repeat(depth)}${t}`;
      if (/^<[^!?/][^>]*[^/]>(?!.*<\/)/.test(t) && !t.includes("</"))
        depth += 1;
      return line;
    })
    .join("\n");
}
function pretty(text: string, kind: string) {
  try {
    if (kind === "JSON") return JSON.stringify(JSON.parse(text), null, 2);
    if (kind === "XML") return prettyXml(text);
  } catch {}
  return text;
}

export function MessageBodyViewer({
  body,
  contentType,
  format,
  onCopy,
}: Props) {
  const raw = useMemo(() => bodyText(body), [body]);
  const kind = useMemo(
    () => detect(raw, contentType, format),
    [raw, contentType, format],
  );
  const formatted = useMemo(() => pretty(raw, kind), [raw, kind]);
  const [mode, setMode] = useState<"pretty" | "raw">("pretty");
  const shown = mode === "pretty" ? formatted : raw;
  const lines = shown.split("\n");
  const copy = async () => {
    await navigator.clipboard.writeText(shown);
    onCopy?.(shown);
  };
  return (
    <div className="message-body-viewer">
      <div className="message-body-toolbar">
        <div className="message-body-tabs">
          <button
            type="button"
            className={mode === "pretty" ? "active" : ""}
            onClick={() => setMode("pretty")}
          >
            Pretty
          </button>
          <button
            type="button"
            className={mode === "raw" ? "active" : ""}
            onClick={() => setMode("raw")}
          >
            Raw
          </button>
          <span className={`message-format-badge format-${kind.toLowerCase()}`}>
            {kind}
          </span>
        </div>
        <button type="button" className="secondary-button" onClick={copy}>
          <Copy size={14} /> Copy
        </button>
      </div>
      <div
        className="message-code-view"
        role="region"
        aria-label={`${kind} message body`}
      >
        {lines.map((line, i) => (
          <div className="message-code-line" key={i}>
            <span className="message-line-number">{i + 1}</span>
            <code>{line || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
