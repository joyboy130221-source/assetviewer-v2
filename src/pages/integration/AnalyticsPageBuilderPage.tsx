import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Play, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { api } from "../../services/api";
import { analyticsApi } from "../../features/analytics/services/analyticsApi";
import { useResolvedTheme } from "../../features/analytics/services/analyticsTheme";
import type {
  AnalyticsBuilderLimits,
  AnalyticsRuntimeInput,
  AnalyticsTheme,
  Organization,
} from "../../features/analytics/model/analytics.types";
import { AnalyticsPageViewer } from "../../features/analytics-pages/components/AnalyticsPageViewer";
import { ItemSelectorEditor } from "../../features/analytics-pages/components/editors/ItemSelectorEditor";
import { ParameterMappingsEditor } from "../../features/analytics-pages/components/editors/ParameterMappingsEditor";
import {
  RulesEditor,
  type AnalyticsOption,
} from "../../features/analytics-pages/components/editors/RulesEditor";
import type { AuthProfileOption } from "../../features/analytics-pages/components/editors/RestSourceEditor";
import {
  blankPage,
  withPageDefaults,
} from "../../features/analytics-pages/model/analyticsPageCatalog";
import type {
  AnalyticsPageDefinition,
  PageRoute,
  PreviewItems,
  SelectorView,
} from "../../features/analytics-pages/model/analyticsPage.types";
import { analyticsPagesApi } from "../../features/analytics-pages/services/analyticsPagesApi";
import { validatePage } from "../../features/analytics-pages/services/analyticsPageValidation";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export default function AnalyticsPageBuilderPage() {
  const { pageId } = useParams();
  const isNew = !pageId;
  const ui = useAppUI(),
    nav = useNavigate();
  const [page, setPage] = useState<AnalyticsPageDefinition>(blankPage());
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [profiles, setProfiles] = useState<AuthProfileOption[]>([]);
  const [allAnalytics, setAllAnalytics] = useState<
    (AnalyticsOption & { organizationId: string })[]
  >([]);
  const [limits, setLimits] = useState<AnalyticsBuilderLimits | null>(null);
  /** Builder-only sample values for page parameters (not saved). */
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewItems | null>(null);
  const [testingItems, setTestingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Incremented by Test & Preview; 0 = no preview yet. */
  const [reloadToken, setReloadToken] = useState(0);
  const theme = useResolvedTheme(page.theme);

  useEffect(() => {
    api<{ data: { id: string; name: string; active: boolean }[] }>(
      "/api/admin/authentication-profiles",
    )
      .then((x) => setProfiles(x.data.filter((p) => p.active)))
      .catch(() => setProfiles([]));
    analyticsApi
      .limits()
      .then(setLimits)
      .catch(() => setLimits(null));
    analyticsApi
      .list()
      .then((list) =>
        setAllAnalytics(
          list.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            organizationId: a.organizationId,
            queryParams: a.queryParams ?? [],
          })),
        ),
      )
      .catch((e) => ui.toast(errorMessage(e), "error"));
    analyticsApi
      .organizations()
      .then((o) => {
        setOrgs(o);
        if (isNew && o[0])
          setPage((x) => ({
            ...x,
            organizationId: x.organizationId || o[0].id,
          }));
      })
      .catch((e) => ui.toast(errorMessage(e), "error"));
    if (pageId)
      analyticsPagesApi
        .get(pageId)
        .then((x) => x && setPage(withPageDefaults(x)))
        .catch((e) => ui.toast(errorMessage(e), "error"));
  }, [pageId]);

  // Only analytics of the page's organization can be shown (server-enforced).
  const analytics = useMemo(
    () => allAnalytics.filter((a) => a.organizationId === page.organizationId),
    [allAnalytics, page.organizationId],
  );
  const published = useMemo(
    () =>
      new Set(
        analytics.filter((a) => a.status === "published").map((a) => a.id),
      ),
    [analytics],
  );
  const issues = useMemo(
    () => validatePage(page, published),
    [page, published],
  );
  const errors = issues.filter((i) => i.level === "error");

  const set = (patch: Partial<AnalyticsPageDefinition>) =>
    setPage((x) => ({ ...x, ...patch }));
  const context = useMemo(
    () =>
      Object.fromEntries(
        page.parameters
          .filter((p) => testValues[p])
          .map((p) => [p, testValues[p]]),
      ),
    [page.parameters, testValues],
  );

  // The preview reads the latest page through refs, so editing the form does
  // not reload it; only Test & Preview does.
  const pageRef = useRef(page);
  pageRef.current = page;
  const contextRef = useRef(context);
  contextRef.current = context;

  const testItems = useCallback(async () => {
    if (!pageRef.current.selector.enabled) return setPreview(null);
    setTestingItems(true);
    try {
      setPreview(
        await analyticsPagesApi.previewItems({
          page: pageRef.current,
          context: contextRef.current,
          fresh: true,
        }),
      );
    } catch (e) {
      setPreview(null);
      ui.toast(errorMessage(e), "error");
    } finally {
      setTestingItems(false);
    }
  }, []);

  const testAndPreview = async () => {
    await testItems();
    setReloadToken((t) => t + 1);
  };

  const resolve = useCallback(
    (item: string) =>
      analyticsPagesApi.previewResolve({
        page: pageRef.current,
        context: contextRef.current,
        item,
      }),
    [],
  );
  const execute = useCallback(
    (item: string, runtime: AnalyticsRuntimeInput) =>
      analyticsPagesApi.previewExecute({
        page: pageRef.current,
        context: contextRef.current,
        item,
        runtime,
      }),
    [],
  );

  const selectorView: SelectorView = useMemo(
    () =>
      page.selector.enabled
        ? {
            enabled: true,
            label: page.selector.label,
            rememberInLink: page.selector.rememberInLink,
            searchThreshold: page.selector.searchThreshold,
            defaultValue: page.selector.defaultValue,
            items: (preview?.items ?? []).map(({ label, value, route }) => ({
              label,
              value,
              available: !!route,
            })),
            truncated: preview?.truncated,
          }
        : { enabled: false },
    // Snapshot at Test & Preview time, like the chart itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadToken, preview],
  );

  const routeLabel = (route: PageRoute | null) => {
    if (!route) return "No chart";
    const chart =
      analytics.find((a) => a.id === route.analyticsId)?.name ??
      "Unknown chart";
    if (!route.ruleId) return `Default → ${chart}`;
    const index = page.rules.findIndex((r) => r.id === route.ruleId);
    return `Rule ${index + 1} → ${chart}`;
  };

  const save = async (status: "draft" | "published") => {
    if (!page.name.trim() || !page.organizationId)
      return ui.toast("Name and organization are required.", "error");
    if (status === "published" && errors.length)
      return ui.toast(`Fix before publishing: ${errors[0].message}`, "error");
    setBusy(true);
    try {
      if (isNew) {
        const created = await analyticsPagesApi.create(page);
        ui.toast("Page created.", "success");
        nav(`/admin/integration/analytics-pages/${created.id}/design`, {
          replace: true,
        });
      } else {
        await analyticsPagesApi.save({ ...page, status });
        set({ status });
        ui.toast(
          status === "published" ? "Page published." : "Draft saved.",
          "success",
        );
      }
    } catch (e) {
      ui.toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout
      permission="analyticsBuilder"
      eyebrow="BUILD / ANALYTICS PAGES"
      title={isNew ? "Create Analytics Page" : page.name || "Page Designer"}
      subtitle="Choose which analytics the page shows, and whether viewers pick one from a dropdown."
    >
      <div className="an-builder-actions">
        <button
          className="secondary-button"
          onClick={() => nav("/admin/integration/analytics-pages")}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={testAndPreview}
          >
            <Play size={16} /> Test & Preview
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void save("draft")}
          >
            <Save size={16} /> Save Draft
          </button>
          <button
            className="primary-button"
            disabled={busy || isNew}
            title={isNew ? "Save the page first" : undefined}
            onClick={() => void save("published")}
          >
            Publish
          </button>
        </div>
      </div>

      <div className="an-builder-grid">
        <div className="an-config">
          <section className="data-card an-section">
            <h3>General</h3>
            <div className="an-fields two">
              <label>
                Name
                <input
                  value={page.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </label>
              <label>
                Organization
                <select
                  value={page.organizationId}
                  onChange={(e) => set({ organizationId: e.target.value })}
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={2}
                value={page.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </label>
            <div className="an-fields two">
              <label>
                Page title
                <input
                  placeholder="Shown on the page (blank uses the name)"
                  value={page.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </label>
              <label>
                Theme
                <select
                  value={page.theme}
                  onChange={(e) =>
                    set({ theme: e.target.value as AnalyticsTheme })
                  }
                >
                  <option value="auto">Automatic (viewer's system)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
                <small>
                  Applies to every chart on the page. A host can override it
                  with <code>?darkTheme=true</code> or <code>?theme=dark</code>.
                </small>
              </label>
            </div>
          </section>

          <section className="data-card an-section">
            <h3>Page parameters</h3>
            <label>
              Parameters from the host link
              <input
                placeholder="CODE, EventType, organizationID, iModelID"
                value={page.parameters.join(", ")}
                onChange={(e) =>
                  set({
                    parameters: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
              <small>
                Only these are taken from the link and passed to the item API
                and the charts. Values mapped from the selected item always win,
                so they cannot be replaced through the link.
              </small>
            </label>
            {page.parameters.length > 0 && (
              <div className="an-test-values">
                <b>Test values</b>
                <small>Used by Test &amp; Preview only.</small>
                <div className="an-fields three">
                  {page.parameters.map((p) => (
                    <label key={p}>
                      {p}
                      <input
                        value={testValues[p] ?? ""}
                        placeholder={`{{${p}}}`}
                        onChange={(e) =>
                          setTestValues((v) => ({ ...v, [p]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="data-card an-section">
            <h3>Default chart</h3>
            <label>
              Chart
              <select
                value={page.defaultChart.analyticsId}
                onChange={(e) =>
                  set({
                    defaultChart: {
                      ...page.defaultChart,
                      analyticsId: e.target.value,
                    },
                  })
                }
              >
                <option value="">None</option>
                {analytics.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.status !== "published" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
              <small>
                Shown when the dropdown is off, and optionally for items no rule
                matches.
              </small>
            </label>
            <ParameterMappingsEditor
              value={page.defaultChart.parameters}
              onChange={(parameters) =>
                set({ defaultChart: { ...page.defaultChart, parameters } })
              }
              sources={["fixed"]}
              suggestions={
                analytics.find((a) => a.id === page.defaultChart.analyticsId)
                  ?.queryParams ?? []
              }
            />
          </section>

          <section className="data-card an-section">
            <h3>Dropdown</h3>
            <ItemSelectorEditor
              value={page.selector}
              onChange={(selector) => set({ selector })}
              profiles={profiles}
              parameters={page.parameters}
              limits={limits}
              preview={preview}
              testing={testingItems}
              onTest={() => void testItems()}
              routeLabel={routeLabel}
            />
          </section>

          {page.selector.enabled && (
            <section className="data-card an-section">
              <h3>Rules</h3>
              <RulesEditor
                value={page.rules}
                onChange={(rules) => set({ rules })}
                analytics={analytics}
                preview={preview?.items ?? null}
                maxRules={limits?.pages?.maxRules}
              />
            </section>
          )}

          {issues.length > 0 && (
            <section
              className="data-card an-section ap-issues"
              aria-live="polite"
            >
              <h3>
                <AlertTriangle size={16} /> Checks
              </h3>
              <ul>
                {issues.map((issue) => (
                  <li key={issue.message} className={issue.level}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className={`an-preview data-card an-theme-${theme}`}>
          <h3>Preview</h3>
          {reloadToken === 0 ? (
            <div className="state-card">
              Click <b>Test &amp; Preview</b> to load the page with the test
              values.
            </div>
          ) : (
            <AnalyticsPageViewer
              selector={selectorView}
              resolve={resolve}
              execute={execute}
              theme={theme}
              initialItem={page.selector.defaultValue}
              reloadToken={reloadToken}
              onRetryItems={() => void testItems()}
            />
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}
