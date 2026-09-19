import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { ArrowLeft, Eye, GripVertical, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { ComponentPalette } from "../../features/form-builder/components/ComponentPalette";
import { FormCanvas } from "../../features/form-builder/components/FormCanvas";
import { PropertiesPanel } from "../../features/form-builder/components/PropertiesPanel";
import { ApiActionPanel } from "../../features/form-builder/components/ApiActionPanel";
import { IntegrationSourcePanel } from "../../features/form-builder/components/IntegrationSourcePanel";
import { AvailableFieldsPanel } from "../../features/form-builder/components/AvailableFieldsPanel";
import { ConditionalLogicPanel } from "../../features/form-builder/components/ConditionalLogicPanel";
import { WorkflowPanel } from "../../features/form-builder/components/WorkflowPanel";
import {
  createField,
  fieldCatalog,
} from "../../features/form-builder/model/fieldCatalog";
import type {
  FieldType,
  FormDefinition,
  FormField,
} from "../../features/form-builder/model/form.types";
import { formApi } from "../../features/form-builder/services/formApi";
export default function FormDesignerPage() {
  const { formId = "" } = useParams();
  const navigate = useNavigate();
  const ui = useAppUI();
  const [form, setForm] = useState<FormDefinition>();
  const [selectedId, setSelectedId] = useState<string>();
  const [activeType, setActiveType] = useState<FieldType>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  useEffect(() => {
    formApi
      .form(formId)
      .then((found) => {
        if (!found) navigate("/admin/integration/form-builder");
        else setForm(found);
      })
      .catch((e) => ui.toast(e.message, "error"));
  }, [formId]);
  if (!form) return null;
  const save = async (status = form.status) => {
    const names = form.fields.map((f) => f.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      ui.toast("Field name must be unique within this form.", "error");
      return false;
    }
    const next = { ...form, status, updatedAt: new Date().toISOString() };
    try {
      await formApi.saveForm(next);
      setForm(next);
      ui.toast(
        status === "published" ? "Form published successfully." : "Form saved.",
        "success",
      );
      return true;
    } catch (e: any) {
      ui.toast(e.message, "error");
      return false;
    }
  };
  const dragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("palette:")) setActiveType(id.split(":")[1] as FieldType);
  };
  const dragEnd = (e: DragEndEvent) => {
    setActiveType(undefined);
    const active = String(e.active.id);
    if (active.startsWith("palette:")) {
      if (!e.over) return;
      const field = createField(active.split(":")[1] as FieldType);
      setForm({ ...form, fields: [...form.fields, field] });
      setSelectedId(field.id);
      return;
    }
    if (e.over && active !== String(e.over.id)) {
      const oldIndex = form.fields.findIndex((f) => f.id === active);
      const newIndex = form.fields.findIndex(
        (f) => f.id === String(e.over?.id),
      );
      if (oldIndex >= 0 && newIndex >= 0)
        setForm({
          ...form,
          fields: arrayMove(form.fields, oldIndex, newIndex),
        });
    }
  };
  const updateField = (field: FormField) =>
    setForm({
      ...form,
      fields: form.fields.map((x) => (x.id === field.id ? field : x)),
    });
  return (
    <AdminLayout
      eyebrow="INTEGRATION · FORM DESIGNER"
      title={form.name}
      subtitle="Drag components, arrange the form, then configure each field."
    >
      <div className="fb-designer-toolbar">
        <button
          className="fb-back"
          onClick={() => navigate("/admin/integration/form-builder")}
        >
          <ArrowLeft size={16} /> Form List
        </button>
        <div className="fb-designer-meta">
          <input
            aria-label="Form name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            aria-label="Description"
            placeholder="Form description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="fb-toolbar-actions">
          <button className="secondary-button" onClick={() => void save()}>
            <Save size={16} /> Save
          </button>
          <button
            className="secondary-button"
            onClick={async () => {
              if (await save())
                navigate(`/admin/integration/form-builder/${form.id}/preview`);
            }}
          >
            <Eye size={16} /> Preview
          </button>
          <button
            className="primary-button"
            disabled={!form.fields.length}
            onClick={() => void save("published")}
          >
            <Send size={16} /> Publish
          </button>
        </div>
      </div>

      <section className="fb-form-settings">
        <div className="fb-form-settings-head">
          <div>
            <strong>Form Properties</strong>
            <small>Configure public form behavior and URL parameters.</small>
          </div>
        </div>
        <div className="fb-form-settings-grid">
          <label>
            Form Theme
            <select
              value={form.theme || "current"}
              onChange={(e) =>
                setForm({
                  ...form,
                  theme: e.target.value as "current" | "sap" | "maximo",
                })
              }
            >
              <option value="current">Default</option>
              <option value="sap">Classic ERP</option>
              <option value="maximo">Carbon</option>
            </select>
          </label>
          <label className="fb-required-row">
            <input
              type="checkbox"
              checked={form.showSubmitButton !== false}
              onChange={(e) =>
                setForm({ ...form, showSubmitButton: e.target.checked })
              }
            />
            <span>Show submit button</span>
          </label>
          <label>
            Submit button label
            <input
              value={form.submitButtonLabel || "Submit Form"}
              disabled={form.showSubmitButton === false}
              onChange={(e) =>
                setForm({ ...form, submitButtonLabel: e.target.value })
              }
            />
          </label>
          <label className="fb-query-param-editor">
            Form Query Parameters
            <textarea
              rows={3}
              placeholder={"assetId\nenv\nuserId"}
              value={(form.queryParams || []).join("\n")}
              onChange={(e) =>
                setForm({
                  ...form,
                  queryParams: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
            <small>
              One parameter per line. Use them as {"{{assetId}}"} in API URLs,
              headers, query values, bodies, and field default values.
            </small>
          </label>
        </div>
      </section>
      <ConditionalLogicPanel
        rules={form.rules || []}
        fields={form.fields}
        onChange={(rules) => setForm({ ...form, rules })}
      />
      <section className="fb-form-settings">
        <div className="fb-form-settings-head">
          <div>
            <strong>Response Action</strong>
            <small>Choose what happens after a successful submission.</small>
          </div>
        </div>
        <div className="fb-form-settings-grid">
          <label>
            Action
            <select
              value={form.responseAction?.type || "message"}
              onChange={(e) =>
                setForm({
                  ...form,
                  responseAction: {
                    type: e.target.value as "message" | "redirect",
                    value: form.responseAction?.value || "",
                  },
                })
              }
            >
              <option value="message">Success Message</option>
              <option value="redirect">Redirect URL</option>
            </select>
          </label>
          <label>
            Value / Template
            <input
              value={form.responseAction?.value || ""}
              placeholder={
                form.responseAction?.type === "redirect"
                  ? "/work-order/{{response.wonum}}"
                  : "Work Order {{response.wonum}} created"
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  responseAction: {
                    type: form.responseAction?.type || "message",
                    value: e.target.value,
                  },
                })
              }
            />
            <small>
              Supports form values, response fields and template functions.
            </small>
          </label>
        </div>
      </section>
      {form.mode === "integrated" && (
        <IntegrationSourcePanel
          action={form.sourceAction}
          fields={form.fields}
          onChange={(sourceAction) => setForm({ ...form, sourceAction })}
          onAddField={(path) => {
            const base =
              path
                .split(".")
                .pop()
                ?.replace(/[^a-zA-Z0-9_]/g, "_") || "field";
            let name = base;
            let i = 2;
            while (form.fields.some((f) => f.name === name))
              name = `${base}_${i++}`;
            const field: FormField = {
              id: crypto.randomUUID(),
              type: "text",
              name,
              label: base
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase()),
              placeholder: "",
              required: false,
              sourcePath: path,
            };
            setForm({ ...form, fields: [...form.fields, field] });
            setSelectedId(field.id);
          }}
        />
      )}
      <DndContext sensors={sensors} onDragStart={dragStart} onDragEnd={dragEnd}>
        <div className="fb-designer">
          <ComponentPalette />
          <main className="fb-canvas-wrap">
            <div className="fb-canvas-title">
              <span>Form canvas</span>
              <small>{form.fields.length} components</small>
            </div>
            <FormCanvas
              fields={form.fields}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={(id) => {
                setForm({
                  ...form,
                  fields: form.fields.filter((x) => x.id !== id),
                });
                if (selectedId === id) setSelectedId(undefined);
              }}
            />
          </main>
          <PropertiesPanel
            field={form.fields.find((x) => x.id === selectedId)}
            onChange={updateField}
          />
        </div>
        <AvailableFieldsPanel
          fields={[
            ...form.fields,
            ...(form.queryParams || [])
              .filter(
                (name) => !form.fields.some((field) => field.name === name),
              )
              .map((name) => ({
                id: `query:${name}`,
                type: "text" as const,
                name,
                label: `${name} (query parameter)`,
                required: false,
              })),
          ]}
        />
        <WorkflowPanel
          workflow={form.workflow}
          fields={[
            ...form.fields,
            ...(form.queryParams || [])
              .filter(
                (name) => !form.fields.some((field) => field.name === name),
              )
              .map((name) => ({
                id: `query:${name}`,
                type: "text" as const,
                name,
                label: `${name} (query parameter)`,
                required: false,
              })),
          ]}
          onChange={(workflow) => setForm({ ...form, workflow })}
        />
        {!form.workflow?.enabled && (
          <ApiActionPanel
            action={form.submitAction}
            fields={[
              ...form.fields,
              ...(form.queryParams || [])
                .filter(
                  (name) => !form.fields.some((field) => field.name === name),
                )
                .map((name) => ({
                  id: `query:${name}`,
                  type: "text" as const,
                  name,
                  label: `${name} (query parameter)`,
                  required: false,
                })),
            ]}
            onChange={(submitAction) => setForm({ ...form, submitAction })}
          />
        )}
        <DragOverlay>
          {activeType && (
            <div className="fb-drag-overlay">
              <GripVertical size={16} />
              {fieldCatalog.find((x) => x.type === activeType)?.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </AdminLayout>
  );
}
