import type { ReactNode } from "react";
import {
  CalendarDays,
  CheckSquare,
  CircleDot,
  Hash,
  TextCursorInput,
  AlignLeft,
  ListFilter,
} from "lucide-react";
import type { FieldType, FormField } from "./form.types";

export const fieldCatalog: {
  type: FieldType;
  label: string;
  icon: ReactNode;
}[] = [
  { type: "text", label: "Text Box", icon: <TextCursorInput size={18} /> },
  { type: "date", label: "Date Picker", icon: <CalendarDays size={18} /> },
  { type: "number", label: "Number Picker", icon: <Hash size={18} /> },
  { type: "textarea", label: "Text Area", icon: <AlignLeft size={18} /> },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquare size={18} /> },
  { type: "radio", label: "Radio Button", icon: <CircleDot size={18} /> },
  { type: "combobox", label: "Combobox", icon: <ListFilter size={18} /> },
];

export function createField(type: FieldType): FormField {
  const sequence = Date.now().toString(36);
  const label =
    fieldCatalog.find((item) => item.type === type)?.label ?? "Field";
  return {
    id: crypto.randomUUID(),
    type,
    name: `${type}_${sequence}`,
    label,
    placeholder:
      type === "text" || type === "textarea" || type === "number"
        ? `Enter ${label.toLowerCase()}`
        : "",
    required: false,
    options: ["radio", "combobox"].includes(type)
      ? ["Option 1", "Option 2"]
      : undefined,
  };
}
