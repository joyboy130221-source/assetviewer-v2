import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import type { FormField } from "../model/form.types";
import { FieldRenderer } from "./FieldRenderer";
function SortableField({
  field,
  selected,
  onSelect,
  onDelete,
}: {
  field: FormField;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`fb-canvas-field ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <button
        className="fb-grip"
        {...attributes}
        {...listeners}
        aria-label="Reorder field"
      >
        <GripVertical size={18} />
      </button>
      <div className="fb-field-preview">
        <FieldRenderer field={field} disabled />
      </div>
      <button
        className="fb-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete field"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
export function FormCanvas({
  fields,
  selectedId,
  onSelect,
  onDelete,
}: {
  fields: FormField[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "form-canvas" });
  return (
    <div ref={setNodeRef} className={`fb-canvas ${isOver ? "is-over" : ""}`}>
      {!fields.length && (
        <div className="fb-empty-canvas">
          <strong>Build your form</strong>
          <span>Drag components from the left panel and drop them here.</span>
        </div>
      )}
      <SortableContext
        items={fields.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        {fields.map((field) => (
          <SortableField
            key={field.id}
            field={field}
            selected={field.id === selectedId}
            onSelect={() => onSelect(field.id)}
            onDelete={() => onDelete(field.id)}
          />
        ))}
      </SortableContext>
    </div>
  );
}
