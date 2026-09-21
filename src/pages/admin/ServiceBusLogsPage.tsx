import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, Filter, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { api, jsonInit } from "../../services/api";
import { MessageBodyViewer } from "../../components/messaging/MessageBodyViewer";

const prettyBody = (x: any) => {
  const v = x?.message_body;
  if (!v) return "—";
  if (x.message_format === "json") {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {}
  }
  return v;
};
export default function ServiceBusLogsPage() {
  const [logs, setLogs] = useState<any[]>([]),
    [connections, setConnections] = useState<string[]>([]),
    [detail, setDetail] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [checking, setChecking] = useState(false);
  const ui = useAppUI();
  const formRef = useRef<HTMLFormElement>(null);
  const load = async (form?: HTMLFormElement) => {
    setLoading(true);
    try {
      const p = form
        ? new URLSearchParams(new FormData(form) as any)
        : new URLSearchParams();
      [...p].forEach(([k, v]) => !v && p.delete(k));
      const b = await api<any>(`/api/admin/message-bus-logs?${p}`);
      setLogs(b.data);
      setConnections(b.connections || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load().catch((e) => ui.toast(e.message, "error"));
  }, []);
  const checkDelivery = async () => {
    if (!detail) return;
    setChecking(true);
    try {
      const r = await api<any>(
        `/api/admin/message-bus-logs?op=checkDelivery`,
        jsonInit("POST", { id: detail.id }),
      );
      const next = { ...detail, ...r.data };
      setDetail(next);
      setLogs((xs) =>
        xs.map((x) => (x.id === next.id ? { ...x, ...r.data } : x)),
      );
      ui.toast(
        r.data.delivery_status === "DEAD_LETTER"
          ? "Message found in the Dead Letter Queue."
          : "Message was not found in the inspected Dead Letter Queue(s).",
        "success",
      );
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setChecking(false);
    }
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    load(e.currentTarget).catch((x) => ui.toast(x.message, "error"));
  };
  const clear = () => {
    formRef.current?.reset();
    load().catch((e) => ui.toast(e.message, "error"));
  };
  return (
    <AdminLayout
      permission="messageBusLogs"
      eyebrow="MONITORING"
      title="Service Bus Logs"
      subtitle="Trace manual and workflow Service Bus sends, including destination, message metadata, duration and failures."
    >
      <section className="data-card">
        <div className="filter-panel">
          <div className="filter-panel-head">
            <div>
              <span className="filter-icon">
                <Filter size={17} />
              </span>
              <div>
                <h2>Filter Messages</h2>
                <p>
                  Narrow Service Bus history by source, connection, result,
                  format or keyword.
                </p>
              </div>
            </div>
            <button
              className="icon-button"
              title="Refresh logs"
              onClick={() =>
                load(formRef.current || undefined).catch((e) =>
                  ui.toast(e.message, "error"),
                )
              }
            >
              <RefreshCw size={17} className={loading ? "spin-icon" : ""} />
            </button>
          </div>
          <form ref={formRef} className="log-filters" onSubmit={submit}>
            <label>
              Source
              <select name="source">
                <option value="">All sources</option>
                <option>MANUAL</option>
                <option>WORKFLOW</option>
              </select>
            </label>
            <label>
              Connection
              <select name="connection">
                <option value="">All connections</option>
                {connections.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Result
              <select name="result">
                <option value="">All results</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </label>
            <label>
              Format
              <select name="format">
                <option value="">All formats</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="text">Text</option>
              </select>
            </label>
            <label>
              Delivery
              <select name="delivery">
                <option value="">All delivery states</option>
                <option value="NOT_CHECKED">Not checked</option>
                <option value="NOT_FOUND_IN_DLQ">Not found in DLQ</option>
                <option value="DEAD_LETTER">Dead letter</option>
              </select>
            </label>
            <label className="log-search">
              Search
              <div className="filter-search">
                <Search size={16} />
                <input
                  name="search"
                  placeholder="Destination, Message ID, error..."
                />
              </div>
            </label>
            <div className="inline-actions log-actions">
              <button className="primary-button">
                <Filter size={16} />
                Apply Filter
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={clear}
              >
                <RotateCcw size={16} />
                Clear
              </button>
            </div>
          </form>
        </div>
        <div className="table-wrap admin-table-scroll">
          <table className="admin-table log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Connection</th>
                <th>Destination</th>
                <th>Format</th>
                <th>Duration</th>
                <th>Send Result</th>
                <th>Delivery</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((x) => (
                <tr key={x.id}>
                  <td>{new Date(x.created_at).toLocaleString()}</td>
                  <td>
                    <span className="method-badge">{x.source}</span>
                  </td>
                  <td>{x.connection_name || "—"}</td>
                  <td>
                    <strong>{x.destination || "—"}</strong>
                    <br />
                    <small>{x.destination_type || ""}</small>
                  </td>
                  <td>{String(x.message_format || "—").toUpperCase()}</td>
                  <td>{x.duration_ms == null ? "—" : `${x.duration_ms} ms`}</td>
                  <td>
                    <span
                      className={x.success ? "result-success" : "result-error"}
                    >
                      {x.success ? "Success" : x.error_message || "Error"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        x.delivery_status === "DEAD_LETTER"
                          ? "result-error"
                          : x.delivery_status === "NOT_FOUND_IN_DLQ"
                            ? "result-success"
                            : "method-badge"
                      }
                    >
                      {x.delivery_status === "DEAD_LETTER"
                        ? "Dead Letter"
                        : x.delivery_status === "NOT_FOUND_IN_DLQ"
                          ? "Not in DLQ"
                          : "Not checked"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button table-action"
                      title="View message log"
                      onClick={() => setDetail(x)}
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!logs.length && (
          <div className="empty-state">
            No Service Bus logs match the current filter.
          </div>
        )}
      </section>
      {detail && (
        <div
          className="modal-backdrop log-modal"
          onMouseDown={(e) => e.target === e.currentTarget && setDetail(null)}
        >
          <div className="modal-card log-detail-card">
            <div className="log-detail-head">
              <div>
                <p className="eyebrow">SERVICE BUS TRACE</p>
                <h2>
                  {detail.operation} • {detail.destination}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="log-meta">
              {[
                ["Source", detail.source],
                ["Connection", detail.connection_name || "—"],
                ["Result", detail.success ? "Success" : "Failed"],
                [
                  "Duration",
                  detail.duration_ms == null ? "—" : `${detail.duration_ms} ms`,
                ],
                ["Created", new Date(detail.created_at).toLocaleString()],
                ["Format", String(detail.message_format || "—").toUpperCase()],
                [
                  "Delivery",
                  detail.delivery_status === "DEAD_LETTER"
                    ? "Dead Letter"
                    : detail.delivery_status === "NOT_FOUND_IN_DLQ"
                      ? "Not found in DLQ"
                      : "Not checked",
                ],
              ].map(([a, b]) => (
                <div key={a}>
                  <span>{a}</span>
                  <strong>{b}</strong>
                </div>
              ))}
            </div>
            {detail.success && (
              <div className="inline-actions" style={{ marginBottom: 16 }}>
                <button
                  className="secondary-button"
                  disabled={checking}
                  onClick={checkDelivery}
                >
                  <RefreshCw
                    size={16}
                    className={checking ? "spin-icon" : ""}
                  />
                  {checking ? "Checking DLQ..." : "Check Dead Letter Status"}
                </button>
                <small className="muted">
                  This non-destructively peeks the queue DLQ or all
                  subscriptions for the topic and correlates by Message ID.
                </small>
              </div>
            )}
            {[
              [
                "Destination",
                `${detail.destination_type || ""}: ${detail.destination || "—"}`,
              ],
              ["Message ID", detail.message_id || "—"],
              ["Correlation ID", detail.correlation_id || "—"],
              ["Content Type", detail.content_type || "—"],
              ["Application Properties", detail.application_properties || {}],
              ["Message Body", prettyBody(detail)],
              ...(detail.workflow_execution_id
                ? [["Workflow Execution ID", detail.workflow_execution_id]]
                : []),
              ...(detail.delivery_checked_at
                ? [
                    [
                      "Delivery Checked",
                      new Date(detail.delivery_checked_at).toLocaleString(),
                    ],
                  ]
                : []),
              ...(detail.dead_letter_subscription
                ? [
                    [
                      "Dead Letter Subscription",
                      detail.dead_letter_subscription,
                    ],
                  ]
                : []),
              ...(detail.dead_letter_reason
                ? [["Dead Letter Reason", detail.dead_letter_reason]]
                : []),
              ...(detail.dead_letter_description
                ? [["Dead Letter Description", detail.dead_letter_description]]
                : []),
              ...(detail.error_message
                ? [["Error Message", detail.error_message]]
                : []),
            ].map(([t, v]: any) => (
              <section
                className={`log-json-section${t === "Error Message" ? " log-error" : ""}`}
                key={t}
              >
                <div className="log-section-head">
                  <h3>{t}</h3>
                </div>
                {t === "Message Body" ? (
                  <MessageBodyViewer
                    body={detail.message_body}
                    contentType={detail.content_type}
                    format={detail.message_format}
                    onCopy={() =>
                      ui.toast("Message Body copied to clipboard.", "success")
                    }
                  />
                ) : (
                  <pre>
                    {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                  </pre>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
