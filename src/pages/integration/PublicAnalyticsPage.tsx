import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnalyticsViewer } from "../../features/analytics/components/AnalyticsViewer";
import { analyticsApi } from "../../features/analytics/services/analyticsApi";
import {
  themeOverride,
  useResolvedTheme,
} from "../../features/analytics/services/analyticsTheme";
import { callerParameters } from "../../features/analytics/services/analyticsViewState";
import type {
  AnalyticsDefinition,
  AnalyticsRuntimeInput,
} from "../../features/analytics/model/analytics.types";

export default function PublicAnalyticsPage() {
  const { analyticsId } = useParams();
  const [d, setD] = useState<AnalyticsDefinition | null>(null),
    [error, setError] = useState("");
  // Read once: the viewer rewrites its own keys in the URL afterwards.
  const initialSearch = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const theme = useResolvedTheme(
    d?.visualization.theme,
    themeOverride(initialSearch),
  );

  useEffect(() => {
    if (!analyticsId) return;
    analyticsApi
      .publicGet(analyticsId)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [analyticsId]);

  const execute = useCallback(
    (input: AnalyticsRuntimeInput) =>
      analyticsApi.publicRun(
        analyticsId ?? "",
        callerParameters(new URLSearchParams(window.location.search)),
        input,
      ),
    [analyticsId],
  );

  if (error && !d)
    return (
      <main className={`an-public an-theme-${theme}`}>
        <section className="state-card error">
          <h2>Unable to load analytics</h2>
          <p>{error}</p>
        </section>
      </main>
    );
  if (!d)
    return (
      <main className={`an-public an-theme-${theme}`}>
        <section className="state-card">
          <span className="spinner" /> Loading analytics…
        </section>
      </main>
    );
  return (
    <main className={`an-public an-theme-${theme}`}>
      <section className="an-public-card">
        <header>
          <small>ANALYTICS</small>
          <h1>{d.visualization.title || d.name}</h1>
          {d.description && <p>{d.description}</p>}
        </header>
        <AnalyticsViewer
          definition={d}
          execute={execute}
          theme={theme}
          syncUrl
        />
      </section>
    </main>
  );
}
