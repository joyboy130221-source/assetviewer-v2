import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  ApiAction,
  FormField,
  WorkflowDefinition,
  WorkflowStep,
} from "../model/form.types";
import { ApiActionPanel } from "./ApiActionPanel";
import { api } from "../../../services/api";
import {
  newBrowserAction,
  newMessageBusAction,
  type MessageConnectionOption,
} from "../../../shared/workflow/workflowStep.types";
import { useTemplateInsertion } from "../../../shared/workflow/useTemplateInsertion";
import { BrowserActionFields } from "../../../shared/workflow/components/BrowserActionFields";
import { MessageBusActionFields } from "../../../shared/workflow/components/MessageBusActionFields";

const newAction = (): ApiAction => ({
  enabled: true,
  method: "POST",
  url: "",
  headers: {},
  params: [],
  body: {},
});

const newStep = (index: number): WorkflowStep => ({
  id: crypto.randomUUID(),
  key: `step${index + 1}`,
  name: `Step ${index + 1}`,
  type: "api",
  action: newAction(),
});

/** Loads Service Bus connections visible to the Messaging permission. */
function useMessageConnections(): MessageConnectionOption[] {
  const [connections, setConnections] = useState<MessageConnectionOption[]>([]);
  useEffect(() => {
    api<{
      data?: Array<{ id: number | string; name: string; active: boolean }>;
    }>("/api/admin/message-bus?op=connections")
      .then((x) =>
        setConnections(
          (x.data || [])
            .filter((c) => c.active)
            .map((c) => ({ id: String(c.id), name: c.name })),
        ),
      )
      .catch(() => setConnections([]));
  }, []);
  return connections;
}

/**
 * Browser / Message Bus step editor. Tokens from the Form Builder's global
 * Available Fields panel are inserted at the cursor of the focused parameter.
 */
function StepActionEditor({
  step,
  connections,
  onChange,
}: {
  step: WorkflowStep;
  connections: MessageConnectionOption[];
  onChange: (step: WorkflowStep) => void;
}) {
  const templating = useTemplateInsertion({
    globalEventName: "bib:insert-template",
    requireFocus: true,
  });
  if ((step.type || "api") === "browser")
    return (
      <BrowserActionFields
        action={step.browser || newBrowserAction()}
        onChange={(browser) => onChange({ ...step, browser })}
        bindTemplate={templating.bind}
        footer={
          <>
            Template values such as {"{{assetId}}"} and{" "}
            {"{{steps.readResult.response.value}}"} are resolved at runtime.
            Upload paths currently refer to files on the RPA runner.
          </>
        }
      />
    );
  return (
    <MessageBusActionFields
      action={step.message || newMessageBusAction()}
      onChange={(message) => onChange({ ...step, message })}
      connections={connections}
      bindTemplate={templating.bind}
    />
  );
}

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
  const connections = useMessageConnections();
  const updateSteps = (steps: WorkflowStep[]) =>
    onChange({ ...current, steps });

  return (
    <section className="fb-api-action fb-workflow-panel">
      <div className="fb-api-title">
        <div>
          <strong>Multi-Step Workflow</strong>
          <small>
            Combine API calls and Browser RPA actions sequentially and reuse
            outputs in later steps.
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
                <label>
                  Step type
                  <select
                    value={step.type || "api"}
                    onChange={(event) => {
                      const type = event.target.value as
                        "api" | "browser" | "message";
                      updateSteps(
                        current.steps.map((item) =>
                          item.id === step.id
                            ? {
                                ...item,
                                type,
                                action: item.action || newAction(),
                                browser: item.browser || newBrowserAction(),
                                message: item.message || newMessageBusAction(),
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    <option value="api">API</option>
                    <option value="browser">Browser RPA</option>
                    <option value="message">Message Bus</option>
                  </select>
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
              {(step.type || "api") === "api" ? (
                <ApiActionPanel
                  title="Step API Action"
                  description={`Configure ${step.name || `Step ${index + 1}`}.`}
                  action={step.action || newAction()}
                  fields={fields}
                  onChange={(action) =>
                    updateSteps(
                      current.steps.map((item) =>
                        item.id === step.id ? { ...item, action } : item,
                      ),
                    )
                  }
                />
              ) : (
                <StepActionEditor
                  step={step}
                  connections={connections}
                  onChange={(next) =>
                    updateSteps(
                      current.steps.map((item) =>
                        item.id === step.id ? next : item,
                      ),
                    )
                  }
                />
              )}
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
