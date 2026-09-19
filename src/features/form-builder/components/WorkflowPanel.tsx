import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  ApiAction,
  FormField,
  WorkflowDefinition,
  WorkflowStep,
  BrowserAction,
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
  type: "api",
  action: newAction(),
});

const selectorActions = new Set<BrowserAction["action"]>([
  "click",
  "fill",
  "select",
  "waitFor",
  "readText",
  "readAttribute",
  "check",
  "uncheck",
  "uploadFile",
  "downloadFile",
  "hover",
  "scrollIntoView",
]);

function BrowserActionEditor({
  action,
  onChange,
}: {
  action: BrowserAction;
  onChange: (action: BrowserAction) => void;
}) {
  const patch = (value: Partial<BrowserAction>) =>
    onChange({ ...action, ...value });
  const needsSelector = selectorActions.has(action.action);
  const supportsMatch = needsSelector && action.action !== "uploadFile";

  return (
    <div className="fb-browser-action">
      <div className="fb-browser-action-heading">
        <strong>Browser RPA Action</strong>
        <small>
          Playwright executes browser steps in the same isolated session. CSS
          and Playwright selectors are supported.
        </small>
      </div>

      <label>
        Action
        <select
          value={action.action}
          onChange={(event) =>
            patch({ action: event.target.value as BrowserAction["action"] })
          }
        >
          <optgroup label="Navigation">
            <option value="openPage">Open Page</option>
            <option value="switchToLatestPage">
              Switch to Latest Tab / Window
            </option>
          </optgroup>
          <optgroup label="Interaction">
            <option value="click">Click</option>
            <option value="fill">Enter Text</option>
            <option value="select">Select Option</option>
            <option value="check">Check</option>
            <option value="uncheck">Uncheck</option>
            <option value="pressKey">Press Key</option>
            <option value="hover">Hover</option>
            <option value="scrollIntoView">Scroll Into View</option>
          </optgroup>
          <optgroup label="Wait & Read">
            <option value="waitFor">Wait for Element</option>
            <option value="delay">Delay</option>
            <option value="readText">Read Text</option>
            <option value="readAttribute">Read Attribute</option>
          </optgroup>
          <optgroup label="Files & Diagnostics">
            <option value="uploadFile">Upload File</option>
            <option value="downloadFile">Download File</option>
            <option value="screenshot">Screenshot</option>
          </optgroup>
        </select>
      </label>

      {action.action === "openPage" && (
        <>
          <label>
            URL
            <input
              value={action.url || ""}
              placeholder="https://legacy.example.com"
              onChange={(event) => patch({ url: event.target.value })}
            />
          </label>
          <label>
            Page readiness
            <select
              value={action.waitUntil || "domcontentloaded"}
              onChange={(event) =>
                patch({
                  waitUntil: event.target.value as BrowserAction["waitUntil"],
                })
              }
            >
              <option value="domcontentloaded">DOM Content Loaded</option>
              <option value="load">Page Load</option>
              <option value="networkidle">Network Idle</option>
              <option value="commit">Navigation Committed</option>
            </select>
          </label>
        </>
      )}

      {needsSelector && (
        <label className="fb-browser-wide">
          Element Selector
          <input
            value={action.selector || ""}
            placeholder="#username, input[name='employeeId'], text=Save"
            onChange={(event) => patch({ selector: event.target.value })}
          />
        </label>
      )}

      {(needsSelector ||
        action.action === "screenshot" ||
        action.action === "pressKey") && (
        <label>
          Frame Selector <span className="fb-optional">(optional)</span>
          <input
            value={action.frameSelector || ""}
            placeholder="#mainFrame"
            onChange={(event) => patch({ frameSelector: event.target.value })}
          />
        </label>
      )}

      {supportsMatch && (
        <label>
          Selector Match
          <select
            value={action.match || "single"}
            onChange={(event) =>
              patch({ match: event.target.value as BrowserAction["match"] })
            }
          >
            <option value="single">Single (strict)</option>
            <option value="first">First</option>
            <option value="last">Last</option>
            <option value="nth">Nth</option>
          </select>
        </label>
      )}

      {supportsMatch && action.match === "nth" && (
        <label>
          Match Index (0-based)
          <input
            type="number"
            min="0"
            value={action.matchIndex ?? 0}
            onChange={(event) =>
              patch({ matchIndex: Number(event.target.value) || 0 })
            }
          />
        </label>
      )}

      {["fill", "select"].includes(action.action) && (
        <label>
          Value
          <input
            value={action.value || ""}
            placeholder="{{employeeId}}"
            onChange={(event) => patch({ value: event.target.value })}
          />
        </label>
      )}

      {action.action === "readAttribute" && (
        <label>
          Attribute Name
          <input
            value={action.attributeName || ""}
            placeholder="href or data-asset-id"
            onChange={(event) => patch({ attributeName: event.target.value })}
          />
        </label>
      )}

      {action.action === "waitFor" && (
        <label>
          Wait State
          <select
            value={action.waitState || "visible"}
            onChange={(event) =>
              patch({
                waitState: event.target.value as BrowserAction["waitState"],
              })
            }
          >
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="attached">Attached</option>
            <option value="detached">Detached</option>
          </select>
        </label>
      )}

      {action.action === "delay" && (
        <label>
          Delay (ms)
          <input
            type="number"
            min="0"
            max="60000"
            value={action.delayMs ?? 1000}
            onChange={(event) =>
              patch({ delayMs: Number(event.target.value) || 0 })
            }
          />
        </label>
      )}

      {action.action === "pressKey" && (
        <>
          <label>
            Selector <span className="fb-optional">(optional)</span>
            <input
              value={action.selector || ""}
              placeholder="#employeeId; blank = active page"
              onChange={(event) => patch({ selector: event.target.value })}
            />
          </label>
          <label>
            Key
            <input
              value={action.key || "Enter"}
              placeholder="Enter, Tab, Escape, Control+A"
              onChange={(event) => patch({ key: event.target.value })}
            />
          </label>
        </>
      )}

      {action.action === "uploadFile" && (
        <label>
          Runner-local File Path
          <input
            value={action.filePath || ""}
            placeholder="C:\\RPA\\files\\attachment.pdf"
            onChange={(event) => patch({ filePath: event.target.value })}
          />
        </label>
      )}

      {["downloadFile", "screenshot"].includes(action.action) && (
        <label>
          File Name <span className="fb-optional">(optional)</span>
          <input
            value={action.fileName || ""}
            placeholder={
              action.action === "screenshot" ? "result.png" : "report.xlsx"
            }
            onChange={(event) => patch({ fileName: event.target.value })}
          />
        </label>
      )}

      {action.action === "screenshot" && (
        <>
          <label>
            Element Selector <span className="fb-optional">(optional)</span>
            <input
              value={action.selector || ""}
              placeholder="Blank captures the page"
              onChange={(event) => patch({ selector: event.target.value })}
            />
          </label>
          <label className="fb-browser-checkbox">
            <input
              type="checkbox"
              checked={action.fullPage !== false}
              onChange={(event) => patch({ fullPage: event.target.checked })}
            />
            Capture full page
          </label>
        </>
      )}

      {action.action !== "delay" && (
        <label>
          Timeout (ms)
          <input
            type="number"
            min="1000"
            max="120000"
            value={action.timeoutMs || 15000}
            onChange={(event) =>
              patch({ timeoutMs: Number(event.target.value) || 15000 })
            }
          />
        </label>
      )}

      <small className="fb-browser-wide">
        Template values such as {"{{assetId}}"} and{" "}
        {"{{steps.readResult.response.value}}"}
        are resolved at runtime. Upload paths currently refer to files on the
        RPA runner.
      </small>
    </div>
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
                      const type = event.target.value as "api" | "browser";
                      updateSteps(
                        current.steps.map((item) =>
                          item.id === step.id
                            ? {
                                ...item,
                                type,
                                action: item.action || newAction(),
                                browser:
                                  item.browser ||
                                  ({
                                    action: "openPage",
                                    timeoutMs: 15000,
                                  } as BrowserAction),
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    <option value="api">API</option>
                    <option value="browser">Browser RPA</option>
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
                <BrowserActionEditor
                  action={
                    step.browser || { action: "openPage", timeoutMs: 15000 }
                  }
                  onChange={(browser) =>
                    updateSteps(
                      current.steps.map((item) =>
                        item.id === step.id ? { ...item, browser } : item,
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
