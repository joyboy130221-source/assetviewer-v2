import type { ReactNode } from "react";
import {
  BROWSER_ACTION_GROUPS,
  BROWSER_SELECTOR_ACTIONS,
  type BrowserAction,
} from "../workflowStep.types";
import type { TemplateBinder } from "../useTemplateInsertion";

type Props = {
  action: BrowserAction;
  onChange: (action: BrowserAction) => void;
  /** Makes text parameters accept Available Fields template tokens. */
  bindTemplate?: TemplateBinder;
  /** Help text shown under the parameters. */
  footer?: ReactNode;
};

type TextKey =
  | "url"
  | "selector"
  | "frameSelector"
  | "value"
  | "attributeName"
  | "key"
  | "filePath"
  | "fileName";

/**
 * Parameter editor for one Browser RPA (Playwright) action. Shared by the
 * Form Builder workflow designer and API Watcher chains.
 */
export function BrowserActionFields({
  action,
  onChange,
  bindTemplate,
  footer,
}: Props) {
  const patch = (value: Partial<BrowserAction>) =>
    onChange({ ...action, ...value });
  const needsSelector = BROWSER_SELECTOR_ACTIONS.has(action.action);
  const supportsMatch = needsSelector && action.action !== "uploadFile";

  /** Controlled, template-aware text input bound to one action property. */
  const text = (key: TextKey, placeholder: string, fieldId: string = key) => ({
    value: action[key] || "",
    placeholder,
    onChange: (event: { target: { value: string } }) =>
      patch({ [key]: event.target.value }),
    ...(bindTemplate?.(`browser.${fieldId}`, (next) =>
      patch({ [key]: next }),
    ) ?? {}),
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
          {BROWSER_ACTION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.actions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {action.action === "openPage" && (
        <>
          <label>
            URL
            <input
              {...text("url", "https://legacy.example.com/{{sourceRecordId}}")}
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
            {...text(
              "selector",
              "#username, input[name='employeeId'], text=Save",
            )}
          />
        </label>
      )}

      {(needsSelector ||
        action.action === "screenshot" ||
        action.action === "pressKey") && (
        <label>
          Frame Selector <span className="fb-optional">(optional)</span>
          <input {...text("frameSelector", "#mainFrame")} />
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
          <input {...text("value", "{{employeeId}}")} />
        </label>
      )}

      {action.action === "readAttribute" && (
        <label>
          Attribute Name
          <input {...text("attributeName", "href or data-asset-id")} />
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
              {...text(
                "selector",
                "#employeeId; blank = active page",
                "keySelector",
              )}
            />
          </label>
          <label>
            Key
            <input
              {...text("key", "Enter, Tab, Escape, Control+A")}
              value={action.key || "Enter"}
            />
          </label>
        </>
      )}

      {action.action === "uploadFile" && (
        <label>
          Runner-local File Path
          <input {...text("filePath", "C:\\RPA\\files\\attachment.pdf")} />
        </label>
      )}

      {["downloadFile", "screenshot"].includes(action.action) && (
        <label>
          File Name <span className="fb-optional">(optional)</span>
          <input
            {...text(
              "fileName",
              action.action === "screenshot" ? "result.png" : "report.xlsx",
            )}
          />
        </label>
      )}

      {action.action === "screenshot" && (
        <>
          <label>
            Element Selector <span className="fb-optional">(optional)</span>
            <input
              {...text("selector", "Blank captures the page", "shotSelector")}
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

      {footer && <small className="fb-browser-wide">{footer}</small>}
    </div>
  );
}
