import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  ApiAction,
  FormField,
  WorkflowDefinition,
  WorkflowStep,
} from "../model/form.types";
import { ApiActionPanel } from "./ApiActionPanel";

const newAction = (): ApiAction => ({
  enabled: true,
  method: "POST",
  url: "",
  headers: {},
  params: {},
  body: {},
});

const newStep = (index: number): WorkflowStep => ({
  id: crypto.randomUUID(),
  key: `step${index + 1}`,
  name: `Step ${index + 1}`,
  action: newAction(),
});

export function WorkflowPanel({
  workflow,
  fields,
  onChange,
}: {
  workflow?: WorkflowDefinition | null;
  fields: FormField[];
  onChange: (workflow: WorkflowDefinition) => void;
}) {
  const current: WorkflowDefinition = workflow || { enabled: false, steps: [] };
  const updateSteps = (steps: WorkflowStep[]) =>
    onChange({ ...current, steps });

  return (
    <section className="fb-api-action fb-workflow-panel">
      <div className="fb-api-title">
        <div>
          <strong>Multi-Step API Workflow</strong>
          <small>
            Chain API calls sequentially and reuse responses in later steps.
          </small>
        </div>
        <label className="fb-switch-row">
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(event) =>
              onChange({ ...current, enabled: event.target.checked })
            }
          />
          <span>Enabled</span>
        </label>
      </div>

      {current.enabled && (
        <div className="fb-api-content">
          <div className="fb-workflow-help">
            Later steps can use values such as{" "}
            <code>{"{{steps.createWO.response.wonum}}"}</code>. The workflow
            stops when a required step fails.
          </div>

          {current.steps.map((step, index) => (
            <article className="fb-workflow-step" key={step.id}>
              <div className="fb-workflow-step-head">
                <span className="fb-workflow-number">{index + 1}</span>
                <label>
                  Step name
                  <input
                    value={step.name}
                    onChange={(event) =>
                      updateSteps(
                        current.steps.map((item) =>
                          item.id === step.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Step key
                  <input
                    value={step.key}
                    placeholder="createWO"
                    onChange={(event) =>
                      updateSteps(
                        current.steps.map((item) =>
                          item.id === step.id
                            ? {
                                ...item,
                                key: event.target.value.replace(
                                  /[^a-zA-Z0-9_-]/g,
                                  "",
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <div className="fb-workflow-step-actions">
                  <button
                    type="button"
                    className="fb-icon-button"
                    disabled={index === 0}
                    title="Move up"
                    onClick={() => {
                      const next = [...current.steps];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      updateSteps(next);
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="fb-icon-button"
                    disabled={index === current.steps.length - 1}
                    title="Move down"
                    onClick={() => {
                      const next = [...current.steps];
                      [next[index], next[index + 1]] = [
                        next[index + 1],
                        next[index],
                      ];
                      updateSteps(next);
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="fb-icon-button danger"
                    title="Delete step"
                    onClick={() =>
                      updateSteps(
                        current.steps.filter((item) => item.id !== step.id),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <ApiActionPanel
                title="Step API Action"
                description={`Configure ${step.name || `Step ${index + 1}`}.`}
                action={step.action}
                fields={fields}
                onChange={(action) =>
                  updateSteps(
                    current.steps.map((item) =>
                      item.id === step.id ? { ...item, action } : item,
                    ),
                  )
                }
              />
            </article>
          ))}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              updateSteps([...current.steps, newStep(current.steps.length)])
            }
          >
            <Plus size={16} /> Add Workflow Step
          </button>
        </div>
      )}
    </section>
  );
}
