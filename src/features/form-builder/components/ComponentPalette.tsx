import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { fieldCatalog } from "../model/fieldCatalog";
import type { FieldType } from "../model/form.types";
function PaletteItem({
  type,
  label,
  icon,
}: {
  type: FieldType;
  label: string;
  icon: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `palette:${type}`,
    data: { type },
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
          : undefined
      }
      className="fb-palette-item"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
export function ComponentPalette() {
  return (
    <aside className="fb-panel">
      <div className="fb-panel-head">
        <strong>Components</strong>
        <span>Drag to canvas</span>
      </div>
      <div className="fb-palette-grid">
        {fieldCatalog.map((item) => (
          <PaletteItem key={item.type} {...item} />
        ))}
      </div>
    </aside>
  );
}
