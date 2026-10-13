import type { ReactNode } from "react";
import type {
  MessageBusAction,
  MessageConnectionOption,
  MessageFormat,
} from "../workflowStep.types";
import type { TemplateBinder } from "../useTemplateInsertion";

type Props = {
  action: MessageBusAction;
  onChange: (action: MessageBusAction) => void;
  /** Connections the current tenant may use (loaded by the caller). */
  connections: MessageConnectionOption[];
  /** Makes text parameters accept Available Fields template tokens. */
  bindTemplate?: TemplateBinder;
  /** Upper bound shown for the DLQ monitoring window input. */
  maxMonitoringWindowSeconds?: number;
  footer?: ReactNode;
};

type TextKey =
  | "destination"
  | "subscription"
  | "messageId"
  | "correlationId"
  | "body"
  | "applicationProperties";

const CONTENT_TYPES: Record<MessageFormat, string> = {
  json: "application/json",
  xml: "application/xml",
  text: "text/plain",
};

export function messageFormatOf(action: MessageBusAction): MessageFormat {
  if (action.messageFormat) return action.messageFormat;
  if (action.contentType?.includes("xml")) return "xml";
  if (action.contentType?.includes("text/plain")) return "text";
  return "json";
}

/**
 * Parameter editor for one Azure Service Bus action (send or DLQ check).
 * Shared by the Form Builder workflow designer and API Watcher chains.
 */
export function MessageBusActionFields({
  action,
  onChange,
  connections,
  bindTemplate,
  maxMonitoringWindowSeconds = 600,
  footer,
}: Props) {
  const patch = (value: Partial<MessageBusAction>) =>
    onChange({ ...action, ...value });
  const operation = action.operation || "send";
  const format = messageFormatOf(action);
  const knownConnection = connections.some(
    (x) => x.id === String(action.connectionId || ""),
  );

  const text = (key: TextKey, placeholder: string) => ({
    value: action[key] || "",
    placeholder,
    onChange: (event: { target: { value: string } }) =>
      patch({ [key]: event.target.value }),
    ...(bindTemplate?.(`message.${key}`, (next) => patch({ [key]: next })) ??
      {}),
  });

  return (
    <div className="fb-browser-action">
      <div className="fb-browser-action-heading">
        <strong>Message Bus Action</strong>
        <small>
          {operation === "dlqCheck"
            ? "Monitor the Dead Letter Queue for a previously sent Message ID. If found, the step fails; otherwise it continues after the monitoring window."
            : "Publish a message to an Azure Service Bus queue or topic. Template values are resolved at runtime."}
        </small>
      </div>
      <label>
        Action
        <select
          value={operation}
          onChange={(e) =>
            patch({
              operation: e.target.value as MessageBusAction["operation"],
            })
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
          {action.connectionId && !knownConnection && (
            <option value={action.connectionId}>
              Unavailable connection #{action.connectionId}
            </option>
          )}
          {connections.map((x) => (
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
        <input {...text("destination", "work-orders or {{queueName}}")} />
      </label>
      {operation === "dlqCheck" ? (
        <>
          {action.destinationType === "topic" && (
            <label className="fb-browser-wide">
              Subscription <span className="fb-optional">(recommended)</span>
              <input {...text("subscription", "BentleyInterop")} />
              <small>
                When blank, all subscriptions for the topic are checked.
              </small>
            </label>
          )}
          <label className="fb-browser-wide">
            Message ID
            <input
              {...text("messageId", "{{steps.sendWorkRequest.messageId}}")}
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
              max={maxMonitoringWindowSeconds}
              value={action.monitoringWindowSeconds ?? 30}
              onChange={(e) =>
                patch({ monitoringWindowSeconds: Number(e.target.value) })
              }
            />
          </label>
          <small className="fb-browser-wide">
            Rule: if the Message ID is found in DLQ, this step fails and stops
            the chain. If it is not found during the full monitoring window,
            this step succeeds and the next step runs.
          </small>
        </>
      ) : (
        <>
          <label>
            Message Format
            <select
              value={format}
              onChange={(e) => {
                const messageFormat = e.target.value as MessageFormat;
                patch({
                  messageFormat,
                  contentType: CONTENT_TYPES[messageFormat],
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
            <input
              value={action.contentType || CONTENT_TYPES[format]}
              readOnly
            />
          </label>
          <label>
            Message ID <span className="fb-optional">(optional)</span>
            <input {...text("messageId", "{{uuid}}")} />
          </label>
          <label>
            Correlation ID <span className="fb-optional">(optional)</span>
            <input {...text("correlationId", "{{sourceRecordId}}")} />
          </label>
          <label className="fb-browser-wide">
            Message Body
            <textarea
              rows={7}
              {...text(
                "body",
                format === "xml"
                  ? "<Asset>\n  <AssetId>{{assetId}}</AssetId>\n</Asset>"
                  : format === "text"
                    ? "Asset {{assetId}} updated."
                    : '{\n  "assetId": "{{assetId}}"\n}',
              )}
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
              {...text("applicationProperties", '{\n  "source": "BIC"\n}')}
            />
          </label>
        </>
      )}
      {footer && <small className="fb-browser-wide">{footer}</small>}
    </div>
  );
}
