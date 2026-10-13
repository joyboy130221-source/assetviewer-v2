import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { WatcherStep } from "../model/apiWatcher.types";
import {
  newWatcherStep,
  precedingTemplates,
  stepTypeOf,
  withStepType,
} from "../model/watcherChain";
import {
  WORKFLOW_STEP_TYPE_LABELS,
  newBrowserAction,
  newMessageBusAction,
  type MessageConnectionOption,
  type WorkflowStepType,
} from "../../../shared/workflow/workflowStep.types";
import { useTemplateInsertion } from "../../../shared/workflow/useTemplateInsertion";
import { BrowserActionFields } from "../../../shared/workflow/components/BrowserActionFields";
import { MessageBusActionFields } from "../../../shared/workflow/components/MessageBusActionFields";
import { RestActionEditor, type AuthProfileOption } from "./RestActionEditor";
import { TemplateFieldList } from "./TemplateFieldList";

export type ChainEditorContext = {
  profiles: AuthProfileOption[];
  connections: MessageConnectionOption[];
  /** Templates available to every step (source fields + system values). */
  baseTemplates: string[];
  /** Templates of steps from earlier chains (e.g. enrichment for events). */
  upstreamTemplates?: string[];
  /** DLQ monitoring ceiling configured in Performance. */
  maxDlqWindowSeconds?: number;
};

const STEP_TYPES: WorkflowStepType[] = ["api", "browser", "message"];

/** Browser / Message Bus editor with its own Available Fields panel. */
function NonRestStepEditor({
  step,
  onChange,
  templates,
  context,
}: {
  step: WatcherStep;
  onChange: (step: WatcherStep) => void;
  templates: string[];
  context: ChainEditorContext;
}) {
  const templating = useTemplateInsertion();
  const type = stepTypeOf(step);
  return (
    <div className="aw-action-layout">
      <div className="aw-action-main">
        {type === "browser" ? (
          <BrowserActionFields
            action={step.browser || newBrowserAction()}
            onChange={(browser) => onChange({ ...step, browser })}
            bindTemplate={templating.bind}
            footer={
              <>
                All browser steps of one record share an isolated browser
                session (enrichment and event steps). Output is available to
                later steps as <code>{`{{steps.${step.key}.value}}`}</code>.
              </>
            }
          />
        ) : (
          <MessageBusActionFields
            action={step.message || newMessageBusAction()}
            onChange={(message) => onChange({ ...step, message })}
            connections={context.connections}
            bindTemplate={templating.bind}
            maxMonitoringWindowSeconds={context.maxDlqWindowSeconds}
            footer={
              <>
                On a record retry an already sent message is reused, not sent
                again. Output is available to later steps as{" "}
                <code>{`{{steps.${step.key}.messageId}}`}</code>.
              </>
            }
          />
        )}
      </div>
      <div>
        <TemplateFieldList
          templates={templates}
          onInsert={(t) => {
            templating.insert(t);
          }}
          hint="Select a parameter (URL, selector, value, destination, body…) then click a field to insert it at the cursor."
        />
      </div>
    </div>
  );
}

/**
 * Ordered, typed step chain (API / Browser RPA / Message Bus) used for the
 * enrichment chain and both event chains of an API Watcher.
 */
export function WatcherChainEditor({
  steps,
  onChange,
  context,
  keyPrefix,
  reservedKeys,
  restMethods,
  addLabel = "Add Step",
  emptyText,
  stepHint,
}: {
  steps: WatcherStep[];
  onChange: (steps: WatcherStep[]) => void;
  context: ChainEditorContext;
  keyPrefix: string;
  /** Keys used by other chains sharing the same {{steps.*}} scope. */
  reservedKeys?: ReadonlySet<string>;
  restMethods?: string[];
  addLabel?: string;
  emptyText: ReactNode;
  stepHint?: ReactNode;
}) {
  const update = (i: number, step: WatcherStep) =>
    onChange(steps.map((x, n) => (n === i ? step : x)));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const used = new Set([...(reservedKeys || []), ...steps.map((s) => s.key)]);
    onChange([
      ...steps,
      newWatcherStep(used, {
        prefix: keyPrefix,
        method: restMethods?.[0] || "GET",
      }),
    ]);
  };
  const duplicateKeys = new Set(
    steps
      .map((s) => s.key)
      .filter(
        (k, i, all) => all.indexOf(k) !== i || Boolean(reservedKeys?.has(k)),
      ),
  );

  return (
    <div className="aw-chain">
      {stepHint && <small className="aw-chain-hint">{stepHint}</small>}
      {!steps.length ? (
        <div className="fb-list-empty compact">
          <p>{emptyText}</p>
        </div>
      ) : (
        steps.map((s, i) => {
          const type = stepTypeOf(s);
          const templates = [
            ...context.baseTemplates,
            ...(context.upstreamTemplates || []),
            ...precedingTemplates(steps, i),
          ];
          return (
            <div
              className={`aw-chain-step${s.enabled ? "" : " is-disabled"}`}
              key={s.id}
            >
              <div className="aw-chain-head">
                <div>
                  <strong>
                    {i + 1}. {s.name}{" "}
                    <span className={`aw-step-type aw-step-type-${type}`}>
                      {WORKFLOW_STEP_TYPE_LABELS[type]}
                    </span>
                  </strong>
                  <small>
                    Output available to later steps as{" "}
                    <code>{`{{steps.${s.key}.*}}`}</code>
                  </small>
                </div>
                <div>
                  <button
                    type="button"
                    title="Move up"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    onClick={() => move(i, 1)}
                    disabled={i === steps.length - 1}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    title="Delete step"
                    onClick={() => onChange(steps.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="aw-grid three aw-step-meta">
                <label>
                  Step Name
                  <input
                    value={s.name}
                    onChange={(e) => update(i, { ...s, name: e.target.value })}
                  />
                </label>
                <label>
                  Step Key
                  <input
                    value={s.key}
                    aria-invalid={duplicateKeys.has(s.key) || undefined}
                    onChange={(e) =>
                      update(i, {
                        ...s,
                        key: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                      })
                    }
                  />
                  {duplicateKeys.has(s.key) && (
                    <small className="aw-field-error">
                      Key already used by another step.
                    </small>
                  )}
                </label>
                <label>
                  Step Type
                  <select
                    value={type}
                    onChange={(e) =>
                      update(
                        i,
                        withStepType(s, e.target.value as WorkflowStepType),
                      )
                    }
                  >
                    {STEP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {WORKFLOW_STEP_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) =>
                      update(i, { ...s, enabled: e.target.checked })
                    }
                  />{" "}
                  Enabled
                </label>
              </div>
              {type === "api" ? (
                <RestActionEditor
                  value={s.action || withStepType(s, "api").action!}
                  onChange={(action) => update(i, { ...s, action })}
                  profiles={context.profiles}
                  templates={templates}
                  methods={restMethods}
                />
              ) : (
                <NonRestStepEditor
                  step={s}
                  onChange={(step) => update(i, step)}
                  templates={templates}
                  context={context}
                />
              )}
            </div>
          );
        })
      )}
      <button
        className="secondary-button aw-chain-add"
        type="button"
        onClick={add}
      >
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  );
}
