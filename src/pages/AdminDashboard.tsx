import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2, Play, ServerCog } from "lucide-react";
import { AdminLayout } from "../components/AdminLayout";
import { useAppUI } from "../components/AppUI";
import { api } from "../services/api";

type ExternalView = {
  id: number;
  name: string;
  description?: string;
  url: string;
  active: boolean;
  organization_name?: string | null;
  organization_code?: string | null;
};
type Environment = {
  id: number;
  env_name: string;
  description?: string;
  active: boolean;
};

type LaunchCardProps = { view: ExternalView; environments: Environment[] };
function LaunchCard({ view, environments }: LaunchCardProps) {
  const [environment, setEnvironment] = useState(
    environments[0]?.env_name || "",
  );
  const [url, setUrl] = useState(view.url);

  useEffect(() => {
    if (!environment && environments[0]?.env_name)
      setEnvironment(environments[0].env_name);
  }, [environments, environment]);

  const launchUrl = useMemo(() => {
    const raw = url.trim();
    if (!raw) return "";
    try {
      const target = new URL(raw, window.location.origin);
      if (environment) target.searchParams.set("env", environment);
      return target.toString();
    } catch {
      return raw;
    }
  }, [url, environment]);

  const launch = () => {
    if (!launchUrl) return;
    window.open(launchUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <article className="external-view-card">
      <div className="external-view-card-head">
        <span className="external-view-icon">
          <Globe2 size={19} />
        </span>
        <div>
          <h3>{view.name}</h3>
          <p>{view.description || "Registered external application view."}</p>
          <small className="tenant-label">
            Tenant: {view.organization_name || "Shared / not assigned"}
          </small>
        </div>
      </div>
      <div className="external-view-fields">
        <label>
          Environment
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="">Select environment</option>
            {environments.map((env) => (
              <option key={env.id} value={env.env_name}>
                {env.env_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Launch URL
          <textarea
            rows={3}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      </div>
      <div className="launch-preview">
        <ExternalLink size={14} />
        <span title={launchUrl}>{launchUrl || "Enter a URL to launch"}</span>
      </div>
      <div className="external-view-actions">
        <button
          className="primary-button"
          disabled={!launchUrl || !environment}
          onClick={launch}
        >
          <Play size={16} />
          Launch
        </button>
      </div>
    </article>
  );
}

export default function AdminDashboard() {
  const [views, setViews] = useState<ExternalView[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const ui = useAppUI();

  useEffect(() => {
    api<{ views: ExternalView[]; environments: Environment[] }>(
      "/api/admin/dashboard",
    )
      .then((result) => {
        setViews(result.views);
        setEnvironments(result.environments);
      })
      .catch((error) => ui.toast(error.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout
      eyebrow="ADMINISTRATION"
      title="Configuration"
      subtitle="Launch registered external views or manage application configuration from the navigation menu."
    >
      <section className="dashboard-section-head">
        <div>
          <p className="eyebrow">EXTERNAL APPLICATIONS</p>
          <h2>External Views</h2>
          <p>
            Choose a Maximo environment, adjust the URL parameters when needed,
            then launch the application in a new window.
          </p>
        </div>
        <span className="dashboard-section-icon">
          <ServerCog size={20} />
        </span>
      </section>
      {loading ? (
        <section className="data-card">
          <div className="empty-state">Loading external views…</div>
        </section>
      ) : views.length ? (
        <section className="external-view-grid">
          {views.map((view) => (
            <LaunchCard key={view.id} view={view} environments={environments} />
          ))}
        </section>
      ) : (
        <section className="data-card">
          <div className="empty-state">
            No active external views are registered. Add one from{" "}
            <strong>Setup → External View</strong>.
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
