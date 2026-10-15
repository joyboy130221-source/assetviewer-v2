import { useEffect, useState } from "react";
import { Copy, Eye, LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { analyticsPagesApi } from "../../features/analytics-pages/services/analyticsPagesApi";
import type { AnalyticsPageDefinition } from "../../features/analytics-pages/model/analyticsPage.types";

/** Published link with a {{placeholder}} for every page parameter. */
const publishedLink = (p: AnalyticsPageDefinition) => {
  const q = p.parameters
    .map((name) => `${encodeURIComponent(name)}={{${name}}}`)
    .join("&");
  return `${location.origin}/analytics-page/${p.id}${q ? `?${q}` : ""}`;
};

export default function AnalyticsPagesListPage() {
  const [items, setItems] = useState<AnalyticsPageDefinition[]>([]);
  const ui = useAppUI(),
    nav = useNavigate();
  const load = () =>
    analyticsPagesApi
      .list()
      .then(setItems)
      .catch((e) => ui.toast(e.message, "error"));
  useEffect(() => {
    void load();
  }, []);
  const remove = async (id: string) => {
    if (
      await ui.confirm({
        title: "Delete page?",
        message: "This analytics page will be deleted. Its charts are kept.",
        confirmText: "Delete",
      })
    ) {
      try {
        await analyticsPagesApi.remove(id);
        await load();
      } catch (e) {
        ui.toast(e instanceof Error ? e.message : String(e), "error");
      }
    }
  };
  return (
    <AdminLayout
      permission="analyticsBuilder"
      eyebrow="BUILD"
      title="Analytics Pages"
      subtitle="Show one of several analytics on a page, optionally chosen from a dropdown."
    >
      <div className="fb-page-actions">
        <div />
        <button
          className="primary-button"
          onClick={() => nav("/admin/integration/analytics-pages/new")}
        >
          <Plus size={16} /> New Page
        </button>
      </div>
      <section className="data-card">
        {!items.length ? (
          <div className="fb-list-empty">
            <LayoutDashboard size={36} />
            <h3>No analytics pages yet</h3>
            <p>
              Group published analytics behind one link, with an optional
              dropdown.
            </p>
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
                    {x.organizationName} ·{" "}
                    {x.selector.enabled
                      ? `Dropdown (${x.selector.source === "api" ? "API" : "fixed list"}) · ${x.rules.length} rule(s)`
                      : "Single chart"}{" "}
                    · Updated {new Date(x.updatedAt).toLocaleString()}
                  </small>
                </div>
                <div className="fb-row-actions">
                  <Link
                    title="Design"
                    to={`/admin/integration/analytics-pages/${x.id}/design`}
                  >
                    <Pencil size={16} />
                  </Link>
                  {x.status === "published" && (
                    <>
                      <Link
                        title="Open published page"
                        to={`/analytics-page/${x.id}`}
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        title="Copy published link"
                        onClick={async () => {
                          await navigator.clipboard.writeText(publishedLink(x));
                          ui.toast("Published page link copied.", "success");
                        }}
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
