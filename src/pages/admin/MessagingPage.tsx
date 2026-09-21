import { useEffect, useState, type FormEvent } from "react";
import {
  Cable,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { LoadingOverlay, useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";
import { MessageBodyViewer } from "../../components/messaging/MessageBodyViewer";

type Connection = {
  id: number;
  name: string;
  description?: string;
  provider: string;
  active: boolean;
  credentialConfigured: boolean;
};
type Entity = {
  name: string;
  status?: string;
  activeMessageCount?: number;
  deadLetterMessageCount?: number;
  scheduledMessageCount?: number;
  totalMessageCount?: number;
  subscriptionCount?: number | null;
  lockDuration?: string | null;
  defaultMessageTimeToLive?: string | null;
  maxDeliveryCount?: number | null;
  requiresSession?: boolean;
  requiresDuplicateDetection?: boolean;
};
type Subscription = Entity;
type PropertyType = "String" | "Number" | "Boolean";
type ApplicationProperty = {
  id: number;
  key: string;
  type: PropertyType;
  value: string;
};

export default function MessagingPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [edit, setEdit] = useState<Connection | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [queues, setQueues] = useState<Entity[]>([]);
  const [topics, setTopics] = useState<Entity[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [explorerTitle, setExplorerTitle] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageFormat, setMessageFormat] = useState<"json" | "xml" | "text">(
    "json",
  );
  const [destinationType, setDestinationType] = useState<"queue" | "topic">(
    "queue",
  );
  const [destination, setDestination] = useState("");
  const [applicationProperties, setApplicationProperties] = useState<
    ApplicationProperty[]
  >([{ id: 1, key: "source", type: "String", value: "Integration Hub" }]);
  const [nextPropertyId, setNextPropertyId] = useState(2);
  const ui = useAppUI();

  const load = async () => {
    const result = await api<{ data: Connection[] }>(
      "/api/admin/message-bus?op=connections",
    );
    setConnections(result.data);
    if (!selectedId && result.data[0]) setSelectedId(String(result.data[0].id));
  };
  useEffect(() => {
    load().catch((e) => ui.toast(e.message, "error"));
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: any = Object.fromEntries(new FormData(event.currentTarget));
    body.active = body.active === "true";
    setLoading(true);
    try {
      const result = await api<any>(
        "/api/admin/message-bus?op=connections",
        jsonInit(body.id ? "PUT" : "POST", body),
      );
      ui.toast(result.message);
      setOpen(false);
      setEdit(null);
      await load();
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const test = async (id: number) => {
    setLoading(true);
    try {
      const result = await api<any>(
        "/api/admin/message-bus?op=test",
        jsonInit("POST", { connectionId: id }),
      );
      ui.toast(`${result.message} (${result.durationMs} ms)`);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const browse = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const result = await api<any>(
        `/api/admin/message-bus?op=entities&connectionId=${encodeURIComponent(selectedId)}`,
      );
      setQueues(result.queues || []);
      setTopics(result.topics || []);
      setMessages([]);
      setExplorerTitle("");
      setSelectedTopic("");
      setSubscriptions([]);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: any = Object.fromEntries(new FormData(event.currentTarget));
    body.connectionId = selectedId;
    body.messageFormat = messageFormat;
    body.contentType =
      messageFormat === "json"
        ? "application/json"
        : messageFormat === "xml"
          ? "application/xml"
          : "text/plain";
    body.destinationType = destinationType;
    body.destination = destination;
    if (!destination.trim()) {
      return ui.toast("Select a queue/topic or enter a destination.", "error");
    }

    try {
      body.applicationProperties = applicationProperties.reduce(
        (result: Record<string, string | number | boolean>, property) => {
          const key = property.key.trim();
          if (!key) return result;

          if (property.type === "Number") {
            const numericValue = Number(property.value);
            if (!Number.isFinite(numericValue)) {
              throw new Error(`Property “${key}” must contain a valid number.`);
            }
            result[key] = numericValue;
          } else if (property.type === "Boolean") {
            if (!["true", "false"].includes(property.value.toLowerCase())) {
              throw new Error(`Property “${key}” must be true or false.`);
            }
            result[key] = property.value.toLowerCase() === "true";
          } else {
            result[key] = property.value;
          }
          return result;
        },
        {},
      );
    } catch (error: any) {
      return ui.toast(error.message, "error");
    }
    setLoading(true);
    try {
      const result = await api<any>(
        "/api/admin/message-bus?op=send",
        jsonInit("POST", body),
      );
      ui.toast(`${result.message} (${result.durationMs} ms)`);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const peek = async (queue: string) => {
    setLoading(true);
    try {
      const result = await api<any>(
        `/api/admin/message-bus?op=peek&connectionId=${encodeURIComponent(selectedId)}&queue=${encodeURIComponent(queue)}&maxCount=10`,
      );
      const data = result.data || [];
      setMessages(data);
      setExplorerTitle(`${queue} / Active Messages`);
      ui.toast(
        data.length
          ? `Peek returned ${data.length} message(s).`
          : "No active messages found.",
      );
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const openTopic = async (topic: string) => {
    setLoading(true);
    try {
      const result = await api<any>(
        `/api/admin/message-bus?op=topicDetails&connectionId=${encodeURIComponent(selectedId)}&topic=${encodeURIComponent(topic)}`,
      );
      setSelectedTopic(topic);
      setSubscriptions(result.subscriptions || []);
      setMessages([]);
      setExplorerTitle("");
      setDestinationType("topic");
      setDestination(topic);
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const peekSubscription = async (topic: string, subscription: string) => {
    setLoading(true);
    try {
      const result = await api<any>(
        `/api/admin/message-bus?op=peekSubscription&connectionId=${encodeURIComponent(selectedId)}&topic=${encodeURIComponent(topic)}&subscription=${encodeURIComponent(subscription)}&maxCount=20`,
      );
      const data = result.data || [];
      setMessages(data);
      setExplorerTitle(`${topic} / ${subscription} / Active Messages`);
      ui.toast(
        data.length
          ? `Peek returned ${data.length} message(s).`
          : "No active messages found.",
      );
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const viewDlq = async (
    destinationType: "queue" | "topic",
    destination: string,
    subscription?: string,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        op: "deadLetters",
        connectionId: selectedId,
        destinationType,
        destination,
        maxCount: "50",
      });
      if (subscription) params.set("subscription", subscription);
      const result = await api<any>(
        `/api/admin/message-bus?${params.toString()}`,
      );
      setMessages(result.data || []);
      setExplorerTitle(
        subscription
          ? `${destination} / ${subscription} / Dead Letter`
          : `${destination} / Dead Letter`,
      );
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdminLayout
        permission="messaging"
        eyebrow="INTEGRATION"
        title="Service Bus Messaging"
        subtitle="Connect to Azure Service Bus, inspect entities, send messages, and safely peek queue messages."
      >
        <section className="data-card">
          <div className="card-toolbar">
            <div>
              <h2>
                <Cable size={18} /> Service Bus Connections
              </h2>
              <p>
                Connection strings are encrypted at rest and never returned to
                the browser.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              <Plus size={16} /> Add Connection
            </button>
          </div>
          {open && (
            <form
              className="admin-form"
              onSubmit={save}
              key={edit?.id || "new"}
            >
              <input type="hidden" name="id" defaultValue={edit?.id || ""} />
              <label>
                Name
                <input
                  name="name"
                  required
                  defaultValue={edit?.name || ""}
                  placeholder="Azure Integration Bus"
                />
              </label>
              <label>
                Provider
                <select name="provider" defaultValue="azureServiceBus" disabled>
                  <option value="azureServiceBus">Azure Service Bus</option>
                </select>
              </label>
              <label className="wide">
                Connection String
                <textarea
                  name="connectionString"
                  rows={3}
                  required={!edit}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    edit
                      ? "Leave blank to keep existing credential"
                      : "Endpoint=sb://..."
                  }
                />
              </label>
              <label>
                Active
                <select
                  name="active"
                  defaultValue={String(edit?.active ?? true)}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Description
                <input
                  name="description"
                  defaultValue={edit?.description || ""}
                />
              </label>
              <div className="wide inline-actions">
                <button className="primary-button">
                  {edit ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setOpen(false)}
                >
                  <X size={16} /> Cancel
                </button>
              </div>
            </form>
          )}
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Credential</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small className="table-subtext">
                        {item.description}
                      </small>
                    </td>
                    <td>Azure Service Bus</td>
                    <td>
                      {item.credentialConfigured ? "Configured" : "Missing"}
                    </td>
                    <td>
                      <span
                        className={
                          item.active ? "badge-active" : "badge-inactive"
                        }
                      >
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button
                          className="secondary-button"
                          onClick={() => test(item.id)}
                        >
                          <Zap size={14} /> Test
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => {
                            setEdit(item);
                            setOpen(true);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={async () => {
                            if (
                              !(await ui.confirm({
                                title: "Delete connection?",
                                message: `Delete “${item.name}”?`,
                                confirmText: "Delete",
                              }))
                            )
                              return;
                            await api(
                              "/api/admin/message-bus?op=connections",
                              jsonInit("DELETE", { id: item.id }),
                            );
                            await load();
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="data-card messaging-workbench">
          <div className="card-toolbar">
            <div>
              <h2>Message Explorer & Runtime Monitoring</h2>
              <p>
                Entity badges show queue/topic counts. Runtime counters show
                messages currently held by queues and subscriptions.
              </p>
            </div>
            <div className="inline-actions">
              <select
                className="app-combobox messaging-connection-select"
                aria-label="Service Bus connection"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
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
              <button
                className="secondary-button"
                disabled={!selectedId}
                onClick={browse}
              >
                <RefreshCw size={15} /> Browse / Refresh
              </button>
            </div>
          </div>
          <div className="messaging-grid">
            <div>
              <h3>
                Queues <span className="messaging-count">{queues.length}</span>
              </h3>
              {queues.map((q) => (
                <div className="runtime-card" key={q.name}>
                  <div className="runtime-head">
                    <strong>{q.name}</strong>
                    <span className="badge-active">{q.status || "Active"}</span>
                  </div>
                  <div className="runtime-stats">
                    <div>
                      <span>Active</span>
                      <strong>{q.activeMessageCount ?? 0}</strong>
                    </div>
                    <div>
                      <span>Scheduled</span>
                      <strong>{q.scheduledMessageCount ?? 0}</strong>
                    </div>
                    <div>
                      <span>Dead Letter</span>
                      <strong>{q.deadLetterMessageCount ?? 0}</strong>
                    </div>
                  </div>
                  <details className="runtime-config">
                    <summary>Configuration</summary>
                    <small>
                      Lock: {q.lockDuration || "—"} · Max delivery:{" "}
                      {q.maxDeliveryCount ?? "—"} · TTL:{" "}
                      {q.defaultMessageTimeToLive || "—"} · Sessions:{" "}
                      {q.requiresSession ? "Yes" : "No"}
                    </small>
                  </details>
                  <div className="inline-actions">
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setDestinationType("queue");
                        setDestination(q.name);
                      }}
                    >
                      Use Queue
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => peek(q.name)}
                    >
                      <Eye size={14} /> Peek
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => viewDlq("queue", q.name)}
                    >
                      View DLQ
                    </button>
                  </div>
                </div>
              ))}
              {!queues.length && (
                <p className="muted">
                  No queue entities were returned for this connection.
                </p>
              )}
            </div>
            <div>
              <h3>
                Topics <span className="messaging-count">{topics.length}</span>
              </h3>
              <div
                className="messaging-entity-scroll"
                aria-label="Available topics"
              >
                {topics.map((t) => (
                  <button
                    type="button"
                    className={`messaging-entity messaging-topic ${selectedTopic === t.name ? "selected" : ""}`}
                    key={t.name}
                    onClick={() => openTopic(t.name)}
                  >
                    <span>{t.name}</span>
                    <small>
                      {t.subscriptionCount != null
                        ? `${t.subscriptionCount} subscription(s)`
                        : "View subscriptions"}
                    </small>
                  </button>
                ))}
                {!topics.length && (
                  <p className="muted">
                    No topic entities were returned for this connection.
                  </p>
                )}
              </div>
            </div>
          </div>
          {selectedTopic && (
            <div className="subscription-panel">
              <div className="card-toolbar">
                <div>
                  <h3>Topic: {selectedTopic}</h3>
                  <p>Runtime state is shown per subscription.</p>
                </div>
              </div>
              {subscriptions.length ? (
                <div className="subscription-grid">
                  {subscriptions.map((su) => (
                    <div className="runtime-card" key={su.name}>
                      <div className="runtime-head">
                        <strong>{su.name}</strong>
                        <span className="badge-active">
                          {su.status || "Active"}
                        </span>
                      </div>
                      <div className="runtime-stats">
                        <div>
                          <span>Active</span>
                          <strong>{su.activeMessageCount ?? 0}</strong>
                        </div>
                        <div>
                          <span>Dead Letter</span>
                          <strong>{su.deadLetterMessageCount ?? 0}</strong>
                        </div>
                        <div>
                          <span>Total</span>
                          <strong>{su.totalMessageCount ?? 0}</strong>
                        </div>
                      </div>
                      <div className="inline-actions">
                        <button
                          className="secondary-button"
                          onClick={() =>
                            peekSubscription(selectedTopic, su.name)
                          }
                        >
                          <Eye size={14} /> Peek
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() =>
                            viewDlq("topic", selectedTopic, su.name)
                          }
                        >
                          View DLQ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">This topic has no subscriptions.</p>
              )}
            </div>
          )}
          {explorerTitle && (
            <div
              className="modal-backdrop message-explorer-modal"
              role="dialog"
              aria-modal="true"
              aria-label={explorerTitle}
            >
              <div className="modal-card message-explorer-card">
                <div className="runtime-head message-explorer-head">
                  <div>
                    <h3>{explorerTitle}</h3>
                    <p className="muted">
                      Read-only peek. Messages are not consumed, locked, or
                      deleted.
                    </p>
                  </div>
                  <div className="inline-actions">
                    <span className="messaging-count">{messages.length}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Close message explorer"
                      onClick={() => {
                        setExplorerTitle("");
                        setMessages([]);
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="message-peek message-explorer-body">
                  {messages.length ? (
                    messages.map((m, i) => (
                      <details key={`${m.sequenceNumber || "message"}-${i}`}>
                        <summary>
                          {m.messageId || `Message ${i + 1}`}{" "}
                          <small>
                            {m.enqueuedTimeUtc
                              ? new Date(m.enqueuedTimeUtc).toLocaleString()
                              : ""}
                          </small>
                          {m.deadLetterReason && (
                            <span className="result-error">
                              {" "}
                              · {m.deadLetterReason}
                            </span>
                          )}
                        </summary>
                        <div className="message-detail-grid">
                          <div>
                            <span>Message ID</span>
                            <strong>{m.messageId || "—"}</strong>
                          </div>
                          <div>
                            <span>Correlation ID</span>
                            <strong>{m.correlationId || "—"}</strong>
                          </div>
                          <div>
                            <span>Content Type</span>
                            <strong>{m.contentType || "—"}</strong>
                          </div>
                          <div>
                            <span>Sequence</span>
                            <strong>{m.sequenceNumber || "—"}</strong>
                          </div>
                          {m.subscription && (
                            <div>
                              <span>Subscription</span>
                              <strong>{m.subscription}</strong>
                            </div>
                          )}
                          {m.deadLetterReason && (
                            <div>
                              <span>Dead Letter Reason</span>
                              <strong className="result-error">
                                {m.deadLetterReason}
                              </strong>
                            </div>
                          )}
                        </div>
                        {m.deadLetterErrorDescription && (
                          <div className="dead-letter-description">
                            <strong>Dead Letter Description</strong>
                            <p>{m.deadLetterErrorDescription}</p>
                          </div>
                        )}
                        <div className="message-properties-block">
                          <strong>Application Properties</strong>
                          <pre>
                            {JSON.stringify(
                              m.applicationProperties || {},
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                        <div className="message-body-block">
                          <strong>Message Body</strong>
                          <MessageBodyViewer
                            body={m.body}
                            contentType={m.contentType}
                            onCopy={() =>
                              ui.toast(
                                "Message Body copied to clipboard.",
                                "success",
                              )
                            }
                          />
                        </div>
                      </details>
                    ))
                  ) : (
                    <div className="message-explorer-empty">
                      <Eye size={28} />
                      <strong>No messages found</strong>
                      <span>
                        There are currently no messages available in this view.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="data-card">
          <div className="card-toolbar">
            <div>
              <h2>
                <Send size={18} /> Send Message
              </h2>
              <p>Publish a test or operational message to a queue or topic.</p>
            </div>
          </div>
          <form className="admin-form" onSubmit={send}>
            <label>
              Destination Type
              <select
                name="destinationType"
                value={destinationType}
                onChange={(event) =>
                  setDestinationType(event.target.value as "queue" | "topic")
                }
              >
                <option value="queue">Queue</option>
                <option value="topic">Topic</option>
              </select>
            </label>
            <label>
              Destination
              <input
                name="destination"
                required
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Select a topic above or enter a destination"
              />
            </label>
            <label>
              Message Format
              <select
                name="messageFormat"
                value={messageFormat}
                onChange={(event) =>
                  setMessageFormat(
                    event.target.value as "json" | "xml" | "text",
                  )
                }
              >
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="text">Text</option>
              </select>
            </label>
            <label>
              Content Type
              <input
                name="contentType"
                value={
                  messageFormat === "json"
                    ? "application/json"
                    : messageFormat === "xml"
                      ? "application/xml"
                      : "text/plain"
                }
                readOnly
              />
            </label>
            <label>
              Message ID <span className="fb-optional">(optional)</span>
              <input name="messageId" />
            </label>
            <label className="wide">
              Message Body
              <textarea
                name="body"
                rows={7}
                defaultValue={
                  '{\n  "assetId": "V6-0401",\n  "action": "UPDATE"\n}'
                }
              />
              <small className="table-subtext">
                JSON is validated before sending. XML and Text are sent as text
                payloads.
              </small>
            </label>
            <div className="wide messaging-properties">
              <div className="messaging-properties-header">
                <div>
                  <strong>Application Properties</strong>
                  <small>Custom Service Bus message metadata.</small>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setApplicationProperties((items) => [
                      ...items,
                      {
                        id: nextPropertyId,
                        key: "",
                        type: "String",
                        value: "",
                      },
                    ]);
                    setNextPropertyId((value) => value + 1);
                  }}
                >
                  <Plus size={14} /> Add Property
                </button>
              </div>
              <div className="messaging-properties-table-wrap">
                <table className="messaging-properties-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Type</th>
                      <th>Value</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {applicationProperties.map((property) => (
                      <tr key={property.id}>
                        <td>
                          <input
                            aria-label="Property key"
                            value={property.key}
                            placeholder="MachineName"
                            onChange={(event) =>
                              setApplicationProperties((items) =>
                                items.map((item) =>
                                  item.id === property.id
                                    ? { ...item, key: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label="Property type"
                            value={property.type}
                            onChange={(event) =>
                              setApplicationProperties((items) =>
                                items.map((item) =>
                                  item.id === property.id
                                    ? {
                                        ...item,
                                        type: event.target
                                          .value as PropertyType,
                                        value:
                                          event.target.value === "Boolean"
                                            ? "false"
                                            : item.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="String">String</option>
                            <option value="Number">Number</option>
                            <option value="Boolean">Boolean</option>
                          </select>
                        </td>
                        <td>
                          {property.type === "Boolean" ? (
                            <select
                              aria-label="Property value"
                              value={
                                property.value.toLowerCase() === "true"
                                  ? "true"
                                  : "false"
                              }
                              onChange={(event) =>
                                setApplicationProperties((items) =>
                                  items.map((item) =>
                                    item.id === property.id
                                      ? { ...item, value: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              aria-label="Property value"
                              value={property.value}
                              placeholder={
                                property.type === "Number" ? "1" : "Value"
                              }
                              onChange={(event) =>
                                setApplicationProperties((items) =>
                                  items.map((item) =>
                                    item.id === property.id
                                      ? { ...item, value: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button danger"
                            aria-label="Remove property"
                            onClick={() =>
                              setApplicationProperties((items) =>
                                items.filter((item) => item.id !== property.id),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!applicationProperties.length && (
                      <tr>
                        <td colSpan={4} className="messaging-properties-empty">
                          No application properties. Click Add Property to add
                          one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="wide messaging-send-actions">
              <button className="primary-button" disabled={!selectedId}>
                <Send size={16} /> Send Message
              </button>
            </div>
          </form>
        </section>
      </AdminLayout>
      {loading && (
        <LoadingOverlay show={loading} text="Working with Azure Service Bus…" />
      )}
    </>
  );
}
