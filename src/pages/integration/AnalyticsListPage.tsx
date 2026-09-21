import { useEffect, useState } from "react";
import { BarChart3, Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { analyticsApi } from "../../features/analytics/services/analyticsApi";
import type { AnalyticsDefinition } from "../../features/analytics/model/analytics.types";
export default function AnalyticsListPage() {
  const [items, setItems] = useState<AnalyticsDefinition[]>([]);
  const ui = useAppUI(),
    nav = useNavigate();
  const load = () =>
    analyticsApi
      .list()
      .then(setItems)
      .catch((e) => ui.toast(e.message, "error"));
  useEffect(() => {
    void load();
  }, []);
  const remove = async (id: string) => {
    if (
      await ui.confirm({
        title: "Delete analytics?",
        message: "This analytics definition will be permanently deleted.",
        confirmText: "Delete",
      })
    ) {
      try {
        await analyticsApi.remove(id);
        await load();
      } catch (e: any) {
        ui.toast(e.message, "error");
      }
    }
  };
  const copy = async (x: AnalyticsDefinition) => {
    const q = (x.queryParams || [])
      .map((p) => `${encodeURIComponent(p)}={{${p}}}`)
      .join("&");
    await navigator.clipboard.writeText(
      `${location.origin}/analytics/${x.id}${q ? `?${q}` : ""}`,
    );
    ui.toast("Published analytics link copied.", "success");
  };
  return (
    <AdminLayout
      permission="analyticsBuilder"
      eyebrow="BUILD"
      title="Analytics Builder"
      subtitle="Create reusable, tenant-aware operational analytics from REST APIs."
    >
      <div className="fb-page-actions">
        <div />
        <button
          className="primary-button"
          onClick={() => nav("/admin/integration/analytics/new")}
        >
          <Plus size={16} /> New Analytics
        </button>
      </div>
      <section className="data-card">
        {!items.length ? (
          <div className="fb-list-empty">
            <BarChart3 size={36} />
            <h3>No analytics yet</h3>
            <p>Create your first reusable KPI, chart, or table.</p>
          </div>
        ) : (
          <div className="fb-form-list">
            {items.map((x) => (
              <article className="fb-form-row" key={x.id}>
                <div>
                  <div className="fb-row-title">
                    <strong>{x.name}</strong>
                    <span className={`fb-status ${x.status}`}>{x.status}</span>
                  </div>
                  <p>{x.description || "No description"}</p>
                  <small>
                    {x.organizationName} · {x.visualization.type.toUpperCase()}{" "}
                    · Updated {new Date(x.updatedAt).toLocaleString()}
                  </small>
                </div>
                <div className="fb-row-actions">
                  <Link
                    title="Design"
                    to={`/admin/integration/analytics/${x.id}/design`}
                  >
                    <Pencil size={16} />
                  </Link>
                  {x.status === "published" && (
                    <>
                      <Link
                        title="Open published analytics"
                        to={`/analytics/${x.id}`}
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        title="Copy published link"
                        onClick={() => void copy(x)}
                      >
                        <Copy size={16} />
                      </button>
                    </>
                  )}
                  <button title="Delete" onClick={() => void remove(x.id)}>
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
