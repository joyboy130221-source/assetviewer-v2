import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { SearchableFieldCombo } from "../../features/api-watcher/components/SearchableFieldCombo";
import { apiWatcherApi } from "../../features/api-watcher/services/apiWatcherApi";
import type {
  ApiWatcherRow,
  WatcherExecution,
  WatcherStepLog,
} from "../../features/api-watcher/model/apiWatcher.types";

function pretty(value: string | undefined, contentType: string | undefined) {
  if (!value) return "—";
  if (
    contentType?.includes("json") ||
    value.trim().startsWith("{") ||
    value.trim().startsWith("[")
  ) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  if (contentType?.includes("xml") || value.trim().startsWith("<"))
    return value.replace(/>\s*</g, "><").replace(/(>)(<)(\/?)/g, "$1\n$2$3");
  return value;
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load API Watcher monitoring.";
}

export default function ApiWatcherMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [watchers, setWatchers] = useState<ApiWatcherRow[]>([]);
  const [watcherId, setWatcherId] = useState(
    searchParams.get("watcherId") || "",
  );
  const [executions, setExecutions] = useState<WatcherExecution[]>([]);
  const [selected, setSelected] = useState("");
  const [logs, setLogs] = useState<WatcherStepLog[]>([]);
  const [loading, setLoading] = useState(false);
  const ui = useAppUI();
  const watcherNames = useMemo(
    () => watchers.map((w) => `${w.name} · ${w.organization_name}`),
    [watchers],
  );
  const selectedWatcher = watchers.find((w) => w.id === watcherId);

  const loadWatchers = async () => {
    const list = await apiWatcherApi.list();
    setWatchers(list);
    if (!watcherId && list[0]) setWatcherId(list[0].id);
  };
  const loadWatcher = async (id: string) => {
    if (!id) {
      setExecutions([]);
      setLogs([]);
      setSelected("");
      return;
    }
    const rows = await apiWatcherApi.executions(id);
    setExecutions(rows);
    const executionId = rows[0]?.id || "";
    setSelected(executionId);
    setLogs(
      executionId ? await apiWatcherApi.executionLogs(id, executionId) : [],
    );
  };
  const refresh = async () => {
    setLoading(true);
    try {
      await loadWatchers();
      if (watcherId) await loadWatcher(watcherId);
    } catch (error: unknown) {
      ui.toast(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadWatchers().catch((error: unknown) =>
      ui.toast(errorMessage(error), "error"),
    );
  }, []);
  useEffect(() => {
    if (!watcherId) return;
    setSearchParams({ watcherId }, { replace: true });
    void loadWatcher(watcherId).catch((error: unknown) =>
      ui.toast(errorMessage(error), "error"),
    );
  }, [watcherId]);

  const chooseWatcher = (label: string) => {
    const watcher = watchers.find(
      (w) => `${w.name} · ${w.organization_name}` === label,
    );
    if (watcher) setWatcherId(watcher.id);
  };
  const chooseExecution = async (id: string) => {
    if (!watcherId) return;
    setSelected(id);
    try {
      setLogs(await apiWatcherApi.executionLogs(watcherId, id));
    } catch (error: unknown) {
      ui.toast(errorMessage(error), "error");
    }
  };

  return (
    <AdminLayout
      permission="apiWatchers"
      eyebrow="MONITORING"
      title="API Watcher Monitoring"
      subtitle="Inspect source, enrichment and event-action execution traces across API Watchers."
    >
      <section className="data-card aw-monitor-toolbar">
        <label>
          API Watcher
          <SearchableFieldCombo
            value={
              selectedWatcher
                ? `${selectedWatcher.name} · ${selectedWatcher.organization_name}`
                : ""
            }
            onChange={chooseWatcher}
            fields={watcherNames}
            placeholder="Search API Watcher"
          />
        </label>
        <div className="aw-monitor-summary">
          {selectedWatcher ? (
            <>
              <span
                className={`fb-status ${selectedWatcher.active ? "published" : "draft"}`}
              >
                {selectedWatcher.active ? "running" : "stopped"}
              </span>
              <small>
                {selectedWatcher.definition.performance?.intervalSeconds || 300}
                s interval · {selectedWatcher.last_status || "Never run"}
              </small>
            </>
          ) : (
            <small>Select an API Watcher to inspect.</small>
          )}
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </section>
      <div className="aw-monitor-layout">
        <section className="data-card aw-monitor-runs">
          <h3>Executions</h3>
          {!executions.length ? (
            <p>No executions yet.</p>
          ) : (
            executions.map((e) => (
              <button
                type="button"
                className={selected === e.id ? "active" : ""}
                key={e.id}
                onClick={() => void chooseExecution(e.id)}
              >
                <strong>{e.status}</strong>
                <span>{new Date(e.started_at).toLocaleString()}</span>
                <small>
                  {e.records_received} received · {e.new_records} new ·{" "}
                  {e.modified_records} modified · {e.failed_records} failed ·{" "}
                  {e.duration_ms} ms
                </small>
              </button>
            ))
          )}
        </section>
        <section className="data-card aw-monitor-detail">
          <h3>Process Trace</h3>
          {!logs.length ? (
            <p>No process logs for this execution.</p>
          ) : (
            logs.map((l) => (
              <details key={l.id} open={!l.success}>
                <summary>
                  <span
                    className={`aw-log-status ${l.success ? "success" : "failed"}`}
                  >
                    {l.status}
                  </span>
                  <strong>
                    {l.sequence}. {l.step_name || l.step_type}
                  </strong>
                  {l.action_type && l.action_type !== "api" && (
                    <span
                      className={`aw-step-type aw-step-type-${l.action_type}`}
                    >
                      {l.action_type === "browser"
                        ? "Browser RPA"
                        : "Message Bus"}
                    </span>
                  )}
                  <span>{l.source_record_id || "Watcher"}</span>
                  <span>{l.event_type || ""}</span>
                  <span>{l.duration_ms} ms</span>
                </summary>
                <div className="aw-log-grid">
                  <div>
                    <h4>Request</h4>
                    <p>
                      <b>{l.request_method}</b> {l.request_url}
                    </p>
                    <h5>Headers</h5>
                    <pre>
                      {JSON.stringify(l.request_headers || {}, null, 2)}
                    </pre>
                    <h5>
                      {l.action_type && l.action_type !== "api"
                        ? "Parameters"
                        : "Query Parameters"}
                    </h5>
                    <pre>{JSON.stringify(l.request_params || {}, null, 2)}</pre>
                    <h5>Body</h5>
                    <pre>{pretty(l.request_body, l.request_content_type)}</pre>
                  </div>
                  <div>
                    <h4>Response</h4>
                    <p>
                      {l.action_type && l.action_type !== "api"
                        ? l.status
                        : `HTTP ${l.response_status ?? "—"}`}
                    </p>
                    <pre>
                      {pretty(l.response_body, l.response_content_type)}
                    </pre>
                    {l.error_message && (
                      <>
                        <h5>Error</h5>
                        <pre>{l.error_message}</pre>
                      </>
                    )}
                  </div>
                </div>
              </details>
            ))
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
