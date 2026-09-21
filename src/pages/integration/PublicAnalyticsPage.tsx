import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AnalyticsRenderer } from "../../features/analytics/components/AnalyticsRenderer";
import { analyticsApi } from "../../features/analytics/services/analyticsApi";
import type {
  AnalyticsDefinition,
  AnalyticsResult,
} from "../../features/analytics/model/analytics.types";
export default function PublicAnalyticsPage() {
  const { analyticsId } = useParams();
  const [d, setD] = useState<AnalyticsDefinition | null>(null),
    [r, setR] = useState<AnalyticsResult | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!analyticsId) return;
    const qs = new URLSearchParams(location.search);
    analyticsApi
      .publicGet(analyticsId)
      .then(setD)
      .then(() => analyticsApi.publicExecute(analyticsId, qs.toString()))
      .then(setR)
      .catch((e) => setError(e.message));
  }, [analyticsId]);
  if (error)
    return (
      <main className="an-public">
        <section className="state-card error">
          <h2>Unable to load analytics</h2>
          <p>{error}</p>
        </section>
      </main>
    );
  if (!d || !r)
    return (
      <main className="an-public">
        <section className="state-card">
          <span className="spinner" /> Loading analytics…
        </section>
      </main>
    );
  return (
    <main className="an-public">
      <section className="an-public-card">
        <header>
          <small>ANALYTICS</small>
          <h1>{d.visualization.title || d.name}</h1>
          {d.description && <p>{d.description}</p>}
        </header>
        <AnalyticsRenderer definition={d} result={r} />
      </section>
    </main>
  );
}
