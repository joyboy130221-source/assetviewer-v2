import { useEffect, useState } from "react";
import { Pencil, Play, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { apiWatcherApi } from "../../features/api-watcher/services/apiWatcherApi";
import { ApiError } from "../../services/api";
import type { ApiWatcherRow } from "../../features/api-watcher/model/apiWatcher.types";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unexpected API Watcher error.";
}

export default function ApiWatcherListPage() {
  const [items, setItems] = useState<ApiWatcherRow[]>([]);
  const [busy, setBusy] = useState("");
  const nav = useNavigate();
  const ui = useAppUI();

  const load = () =>
    apiWatcherApi
      .list()
      .then(setItems)
      .catch((error: unknown) => ui.toast(errorMessage(error), "error"));
  useEffect(() => {
    void load();
  }, []);

  const run = async (id: string) => {
    try {
      setBusy(`run:${id}`);
      await apiWatcherApi.run(id);
      ui.toast("API Watcher execution completed.", "success");
      await load();
    } catch (error: unknown) {
      ui.toast(errorMessage(error), "error");
    } finally {
      setBusy("");
    }
  };

  const setActive = async (item: ApiWatcherRow, active: boolean) => {
    try {
      setBusy(`active:${item.id}`);
      await apiWatcherApi.setActive(item.id, active);
      ui.toast(`${item.name} ${active ? "started" : "stopped"}.`, "success");
      await load();
    } catch (error: unknown) {
      ui.toast(errorMessage(error), "error");
    } finally {
      setBusy("");
    }
  };

  const clearCache = async (item: ApiWatcherRow) => {
    const confirmed = await ui.confirm({
      title: "Clear successful processing cache?",
      message: `This removes successful source-record state for “${item.name}” and resets its checkpoint so previously returned source records can be processed again. Execution monitoring history is retained. Use this primarily for controlled testing.`,
      confirmText: "Clear Cache",
    });
    if (!confirmed) return;
    try {
      setBusy(`clear:${item.id}`);
      const result = await apiWatcherApi.clearSuccessCache(item.id);
      ui.toast(
        `Cache cleared (${result.clearedRecords} successful record state(s)).`,
        "success",
      );
      await load();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        await ui.alert({
          title: "Unable to clear cache",
          message:
            "This API Watcher is currently running. Please wait until the current execution has completed, then try again.",
          confirmText: "OK",
        });
      } else {
        ui.toast(errorMessage(error), "error");
      }
    } finally {
      setBusy("");
    }
  };

  const remove = async (item: ApiWatcherRow) => {
    if (
      !(await ui.confirm({
        title: "Delete API Watcher?",
        message:
          "The watcher configuration will be soft deleted. Synchronization and monitoring history remain available in the database.",
        confirmText: "Delete",
      }))
    )
      return;
    try {
      setBusy(`delete:${item.id}`);
      await apiWatcherApi.remove(item.id);
      await load();
    } catch (error: unknown) {
      ui.toast(errorMessage(error), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <AdminLayout
      permission="apiWatchers"
      eyebrow="AUTOMATE"
      title="API Watchers"
      subtitle="Monitor external APIs for new or modified records and trigger tenant-aware integration actions."
    >
      <div className="fb-page-actions">
        <div />
        <button
          className="primary-button"
          onClick={() => nav("/admin/automation/api-watchers/new")}
        >
          <Plus size={16} /> New API Watcher
        </button>
      </div>
      <section className="data-card">
        {!items.length ? (
          <div className="fb-list-empty">
            <h3>No API Watchers yet</h3>
            <p>
              Create a watcher to detect API changes without an end-user screen.
            </p>
          </div>
        ) : (
          <div className="fb-form-list">
            {items.map((item) => (
              <article className="fb-form-row" key={item.id}>
                <div>
                  <div className="fb-row-title">
                    <strong>{item.name}</strong>
                    <span
                      className={`fb-status ${item.active ? "published" : "draft"}`}
                    >
                      {item.active ? "running" : "stopped"}
                    </span>
                  </div>
                  <p>{item.description || "No description"}</p>
                  <small>
                    {item.organization_name} ·{" "}
                    {item.definition.performance?.intervalSeconds || 300}s ·
                    Last status {item.last_status || "Never run"}
                  </small>
                </div>
                <div className="fb-row-actions aw-card-actions">
                  {item.active ? (
                    <button
                      className="aw-action-button stop"
                      title="Stop watcher"
                      disabled={Boolean(busy)}
                      onClick={() => void setActive(item, false)}
                    >
                      <Square size={15} /> Stop
                    </button>
                  ) : (
                    <button
                      className="aw-action-button start"
                      title="Start watcher"
                      disabled={Boolean(busy)}
                      onClick={() => void setActive(item, true)}
                    >
                      <Play size={15} /> Start
                    </button>
                  )}
                  <button
                    className="aw-action-button"
                    title="Run once now"
                    disabled={Boolean(busy)}
                    onClick={() => void run(item.id)}
                  >
                    <Play size={15} /> Run Now
                  </button>
                  <button
                    className="aw-action-button"
                    title="Clear successful processing cache"
                    disabled={Boolean(busy)}
                    onClick={() => void clearCache(item)}
                  >
                    <RotateCcw size={15} /> Clear Cache
                  </button>
                  <button
                    title="Edit"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      nav(`/admin/automation/api-watchers/${item.id}`)
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    title="Delete"
                    disabled={Boolean(busy)}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
