import { useEffect, useRef, useState, type FocusEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  ApiAction,
  FormField,
  WorkflowDefinition,
  WorkflowStep,
  BrowserAction,
  MessageBusAction,
} from "../model/form.types";
import { ApiActionPanel } from "./ApiActionPanel";
import { api } from "../../../services/api";

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
  const activeTemplateField = useRef<{
    key: keyof BrowserAction;
    element: HTMLInputElement;
  } | null>(null);

  const rememberTemplateField = (
    key: keyof BrowserAction,
    element: HTMLInputElement,
  ) => {
    activeTemplateField.current = { key, element };
  };

  useEffect(() => {
    const insertTemplate = (event: Event) => {
      const template = (event as CustomEvent<{ template?: string }>).detail
        ?.template;
      const editor = activeTemplateField.current;
      if (!template || !editor || document.activeElement !== editor.element)
        return;
      const currentValue = String(action[editor.key] ?? "");
      const start = editor.element.selectionStart ?? currentValue.length;
      const end = editor.element.selectionEnd ?? currentValue.length;
      patch({
        [editor.key]: `${currentValue.slice(0, start)}${template}${currentValue.slice(end)}`,
      });
      requestAnimationFrame(() => {
        const position = start + template.length;
        editor.element.focus();
        editor.element.setSelectionRange(position, position);
      });
    };
    window.addEventListener("bib:insert-template", insertTemplate);
    return () =>
      window.removeEventListener("bib:insert-template", insertTemplate);
  }, [action]);

  const templateFocus = (key: keyof BrowserAction) => ({
    onFocus: (event: FocusEvent<HTMLInputElement>) =>
      rememberTemplateField(key, event.currentTarget),
  });

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
              {...templateFocus("url")}
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
            {...templateFocus("selector")}
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
            {...templateFocus("frameSelector")}
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
            {...templateFocus("value")}
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
            {...templateFocus("attributeName")}
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
              {...templateFocus("key")}
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
            {...templateFocus("filePath")}
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
            {...templateFocus("fileName")}
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

function MessageBusActionEditor({
  action,
  onChange,
}: {
  action: MessageBusAction;
  onChange: (action: MessageBusAction) => void;
}) {
  const [connections, setConnections] = useState<
    Array<{ id: number; name: string; active: boolean }>
  >([]);
  useEffect(() => {
    api<any>("/api/admin/message-bus?op=connections")
      .then((x) => setConnections(x.data || []))
      .catch(() => setConnections([]));
  }, []);
  const patch = (value: Partial<MessageBusAction>) =>
    onChange({ ...action, ...value });
  const operation = action.operation || "send";
  return (
    <div className="fb-browser-action">
      <div className="fb-browser-action-heading">
        <strong>Message Bus Action</strong>
        <small>
          {operation === "dlqCheck"
            ? "Monitor the Dead Letter Queue for a previously sent Message ID. If found, the workflow fails; otherwise it continues after the monitoring window."
            : "Publish a message to an Azure Service Bus queue or topic. Template values are resolved at runtime."}
        </small>
      </div>
      <label>
        Action
        <select
          value={operation}
          onChange={(e) =>
            patch({ operation: e.target.value as "send" | "dlqCheck" })
          }
        >
          <option value="send">Send Message</option>
          <option value="dlqCheck">Check Dead Letter</option>
        </select>
      </label>
      <label>
        Connection
        <select
          value={action.connectionId || ""}
          onChange={(e) => patch({ connectionId: e.target.value })}
        >
          <option value="">Select connection</option>
          {connections
            .filter((x) => x.active)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Destination Type
        <select
          value={action.destinationType || "queue"}
          onChange={(e) =>
            patch({ destinationType: e.target.value as "queue" | "topic" })
          }
        >
          <option value="queue">Queue</option>
          <option value="topic">Topic</option>
        </select>
      </label>
      <label className="fb-browser-wide">
        Destination
        <input
          value={action.destination || ""}
          placeholder="work-orders or {{queueName}}"
          onChange={(e) => patch({ destination: e.target.value })}
        />
      </label>
      {operation === "dlqCheck" ? (
        <>
          {action.destinationType === "topic" && (
            <label className="fb-browser-wide">
              Subscription <span className="fb-optional">(recommended)</span>
              <input
                value={action.subscription || ""}
                placeholder="BentleyInterop"
                onChange={(e) => patch({ subscription: e.target.value })}
              />
              <small>
                When blank, all subscriptions for the topic are checked.
              </small>
            </label>
          )}
          <label className="fb-browser-wide">
            Message ID
            <input
              value={action.messageId || ""}
              placeholder="{{steps.sendWorkRequest.response.messageId}}"
              onChange={(e) => patch({ messageId: e.target.value })}
            />
            <small>
              Normally reference the Message ID returned by an earlier Send
              Message step.
            </small>
          </label>
          <label>
            Initial Wait (seconds)
            <input
              type="number"
              min={0}
              max={300}
              value={action.initialWaitSeconds ?? 5}
              onChange={(e) =>
                patch({ initialWaitSeconds: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Check Interval (seconds)
            <input
              type="number"
              min={1}
              max={300}
              value={action.checkIntervalSeconds ?? 5}
              onChange={(e) =>
                patch({ checkIntervalSeconds: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Monitoring Window (seconds)
            <input
              type="number"
              min={1}
              max={600}
              value={action.monitoringWindowSeconds ?? 30}
              onChange={(e) =>
                patch({ monitoringWindowSeconds: Number(e.target.value) })
              }
            />
          </label>
          <small className="fb-browser-wide">
            Rule: if the Message ID is found in DLQ, this step fails and stops
            the workflow. If it is not found during the full monitoring window,
            this step succeeds and the next workflow step runs.
          </small>
        </>
      ) : (
        <>
          <label>
            Message Format
            <select
              value={
                action.messageFormat ||
                (action.contentType?.includes("xml")
                  ? "xml"
                  : action.contentType?.includes("text/plain")
                    ? "text"
                    : "json")
              }
              onChange={(e) => {
                const messageFormat = e.target.value as "json" | "xml" | "text";
                patch({
                  messageFormat,
                  contentType:
                    messageFormat === "json"
                      ? "application/json"
                      : messageFormat === "xml"
                        ? "application/xml"
                        : "text/plain",
                });
              }}
            >
              <option value="json">JSON</option>
              <option value="xml">XML</option>
              <option value="text">Text</option>
            </select>
          </label>
          <label>
            Content Type
            <input value={action.contentType || "application/json"} readOnly />
          </label>
          <label>
            Message ID <span className="fb-optional">(optional)</span>
            <input
              value={action.messageId || ""}
              placeholder="{{requestId}}"
              onChange={(e) => patch({ messageId: e.target.value })}
            />
          </label>
          <label className="fb-browser-wide">
            Message Body
            <textarea
              rows={7}
              value={action.body || ""}
              placeholder={
                action.messageFormat === "xml"
                  ? "<Asset>\n  <AssetId>{{assetId}}</AssetId>\n</Asset>"
                  : action.messageFormat === "text"
                    ? "Asset {{assetId}} updated."
                    : '{\n  "assetId": "{{assetId}}"\n}'
              }
              onChange={(e) => patch({ body: e.target.value })}
            />
            <small>
              JSON is validated before sending. XML and Text are sent as UTF-8
              payloads.
            </small>
          </label>
          <label className="fb-browser-wide">
            Application Properties (JSON){" "}
            <span className="fb-optional">(optional)</span>
            <textarea
              rows={4}
              value={action.applicationProperties || ""}
              placeholder={'{\n  "source": "BIC"\n}'}
              onChange={(e) => patch({ applicationProperties: e.target.value })}
            />
          </label>
        </>
      )}
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
                      const type = event.target.value as
                        "api" | "browser" | "message";
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
                                message: item.message || {
                                  destinationType: "queue",
                                  destination: "",
                                  body: "{}",
                                  messageFormat: "json",
                                  contentType: "application/json",
                                },
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
              ) : (step.type || "api") === "browser" ? (
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
              ) : (
                <MessageBusActionEditor
                  action={
                    step.message || {
                      destinationType: "queue",
                      destination: "",
                      body: "{}",
                      messageFormat: "json",
                      contentType: "application/json",
                    }
                  }
                  onChange={(message) =>
                    updateSteps(
                      current.steps.map((item) =>
                        item.id === step.id ? { ...item, message } : item,
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
