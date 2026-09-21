import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, Plus, Save, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { AnalyticsRenderer } from "../../features/analytics/components/AnalyticsRenderer";
import { api } from "../../services/api";
import { analyticsApi } from "../../features/analytics/services/analyticsApi";
import type {
  AnalyticsAppearance,
  AnalyticsDefinition,
  AnalyticsFilter,
  AnalyticsResult,
  Organization,
} from "../../features/analytics/model/analytics.types";
import {
  ANALYTICS_PALETTES,
  DEFAULT_ANALYTICS_APPEARANCE,
  normalizeAppearance,
} from "../../features/analytics/services/analyticsAppearance";
const blank = (org = ""): AnalyticsDefinition => ({
  id: "",
  organizationId: org,
  name: "",
  description: "",
  status: "draft",
  dataSource: {
    type: "rest",
    action: { method: "GET", url: "", headers: {}, params: {} },
    arrayPath: "",
  },
  queryParams: [],
  filterMode: "bib",
  filters: [],
  dimension: "",
  measure: "",
  aggregation: "count",
  visualization: {
    type: "bar",
    title: "",
    showLegend: true,
    showLabels: true,
    appearance: { ...DEFAULT_ANALYTICS_APPEARANCE },
  },
  createdAt: "",
  updatedAt: "",
});
const pairs = (obj: Record<string, string>) =>
  Object.entries(obj).map(([key, value]) => ({ key, value }));
const object = (rows: { key: string; value: string }[]) =>
  Object.fromEntries(
    rows.filter((x) => x.key.trim()).map((x) => [x.key.trim(), x.value]),
  );
export default function AnalyticsBuilderPage() {
  const { analyticsId } = useParams();
  const isNew = !analyticsId;
  const [d, setD] = useState<AnalyticsDefinition>(blank());
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [profiles, setProfiles] = useState<
    { id: string; name: string; active: boolean }[]
  >([]);
  const [headers, setHeaders] = useState([{ key: "", value: "" }]);
  const [params, setParams] = useState([{ key: "", value: "" }]);
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const ui = useAppUI(),
    nav = useNavigate();
  useEffect(() => {
    api<{ data: { id: string; name: string; active: boolean }[] }>(
      "/api/admin/authentication-profiles",
    )
      .then((x) => setProfiles(x.data.filter((p) => p.active)))
      .catch(() => setProfiles([]));
    analyticsApi
      .organizations()
      .then((o) => {
        setOrgs(o);
        if (isNew && o[0]) setD((x) => ({ ...x, organizationId: o[0].id }));
      })
      .catch((e) => ui.toast(e.message, "error"));
    if (analyticsId)
      analyticsApi
        .get(analyticsId)
        .then((x) => {
          if (!x) return;
          setD(x);
          setHeaders([
            ...pairs(x.dataSource.action.headers),
            { key: "", value: "" },
          ]);
          setParams([
            ...pairs(x.dataSource.action.params),
            { key: "", value: "" },
          ]);
        })
        .catch((e) => ui.toast(e.message, "error"));
  }, [analyticsId]);
  const prepared = useMemo(
    () => ({
      ...d,
      dataSource: {
        ...d.dataSource,
        action: {
          ...d.dataSource.action,
          headers: object(headers),
          params: object(params),
        },
      },
    }),
    [d, headers, params],
  );
  const save = async (status = d.status) => {
    if (!prepared.name.trim() || !prepared.organizationId)
      return ui.toast("Name and organization are required.", "error");
    try {
      setBusy(true);
      if (isNew) {
        const id = await analyticsApi.create({ ...prepared, status });
        ui.toast("Analytics created.", "success");
        nav(`/admin/integration/analytics/${id}/design`);
      } else {
        await analyticsApi.save({ ...prepared, status });
        setD((x) => ({ ...x, status }));
        ui.toast(
          status === "published" ? "Analytics published." : "Analytics saved.",
          "success",
        );
      }
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    try {
      setBusy(true);
      const r = await analyticsApi.execute(
        prepared,
        Object.fromEntries((d.queryParams || []).map((p) => [p, `{{${p}}}`])),
      );
      setResult(r);
      if (!d.dataSource.arrayPath && r.recordsPath) {
        setD((x) => ({
          ...x,
          dataSource: { ...x.dataSource, arrayPath: r.recordsPath },
        }));
        ui.toast(
          `Loaded ${r.rawCount} source record(s). Auto-detected Records Path: ${r.recordsPath}.`,
          "success",
        );
      } else {
        ui.toast(`Loaded ${r.rawCount} source record(s).`, "success");
      }
    } catch (e: any) {
      ui.toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const addFilter = () =>
    setD((x) => ({
      ...x,
      filters: [
        ...x.filters,
        { id: crypto.randomUUID(), field: "", operator: "equals", value: "" },
      ],
    }));
  return (
    <AdminLayout
      permission="analyticsBuilder"
      eyebrow="BUILD / ANALYTICS"
      title={isNew ? "Create Analytics" : d.name || "Analytics Designer"}
      subtitle="Configure the source, transformation, and reusable visualization."
    >
      <div className="an-builder-actions">
        <button
          className="secondary-button"
          onClick={() => nav("/admin/integration/analytics")}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void test()}
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
                  value={d.name}
                  onChange={(e) => setD({ ...d, name: e.target.value })}
                />
              </label>
              <label>
                Organization
                <select
                  value={d.organizationId}
                  onChange={(e) =>
                    setD({ ...d, organizationId: e.target.value })
                  }
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
                value={d.description}
                onChange={(e) => setD({ ...d, description: e.target.value })}
              />
            </label>
            <label>
              Runtime query parameters{" "}
              <input
                placeholder="assetId, dateFrom, dateTo"
                value={(d.queryParams || []).join(", ")}
                onChange={(e) =>
                  setD({
                    ...d,
                    queryParams: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          </section>
          <section className="data-card an-section">
            <h3>REST Data Source</h3>
            <label>
              Endpoint URL
              <input
                placeholder="https://... or URL with {{parameter}}"
                value={d.dataSource.action.url}
                onChange={(e) =>
                  setD({
                    ...d,
                    dataSource: {
                      ...d.dataSource,
                      action: { ...d.dataSource.action, url: e.target.value },
                    },
                  })
                }
              />
            </label>
            <div className="an-fields two">
              <label>
                Records Path
                <input
                  list="analytics-record-paths"
                  placeholder="Leave blank to auto-detect, e.g. member or data.items"
                  value={d.dataSource.arrayPath}
                  onChange={(e) =>
                    setD({
                      ...d,
                      dataSource: {
                        ...d.dataSource,
                        arrayPath: e.target.value,
                      },
                    })
                  }
                />
                <datalist id="analytics-record-paths">
                  {result?.recordsPathCandidates.map((c) => (
                    <option key={c.path || "$root"} value={c.path}>
                      {c.path || "Root array"} ({c.count} records)
                    </option>
                  ))}
                </datalist>
                <small>
                  Path to the JSON array used as the analytics dataset. Leave
                  blank and Test & Preview to auto-detect it.
                </small>
              </label>
              <label>
                Authentication profile
                <select
                  value={d.dataSource.action.authProfileId || ""}
                  onChange={(e) =>
                    setD({
                      ...d,
                      dataSource: {
                        ...d.dataSource,
                        action: {
                          ...d.dataSource.action,
                          authProfileId: e.target.value || undefined,
                        },
                      },
                    })
                  }
                >
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <PairEditor title="Headers" rows={headers} setRows={setHeaders} />
            <PairEditor
              title="Query parameters"
              rows={params}
              setRows={setParams}
            />
          </section>
          <section className="data-card an-section">
            <div className="an-section-title">
              <h3>Filters</h3>
              <button className="secondary-button" onClick={addFilter}>
                <Plus size={14} /> Add
              </button>
            </div>
            <label>
              Processing
              <select
                value={d.filterMode}
                onChange={(e) =>
                  setD({ ...d, filterMode: e.target.value as any })
                }
              >
                <option value="source">
                  Source API (configure values in query parameters)
                </option>
                <option value="bib">BIB Engine</option>
              </select>
            </label>
            {d.filters.map((f, i) => (
              <FilterRow
                key={f.id}
                filter={f}
                onChange={(v) =>
                  setD({
                    ...d,
                    filters: d.filters.map((x, j) => (j === i ? v : x)),
                  })
                }
                onDelete={() =>
                  setD({ ...d, filters: d.filters.filter((_, j) => j !== i) })
                }
              />
            ))}
          </section>
          <section className="data-card an-section">
            <h3>Aggregation</h3>
            <datalist id="analytics-source-fields">
              {result?.fields.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <div className="an-fields three">
              <label>
                Dimension (Group By)
                <input
                  list="analytics-source-fields"
                  placeholder="status"
                  value={d.dimension}
                  onChange={(e) => setD({ ...d, dimension: e.target.value })}
                />
              </label>
              <label>
                Measure
                <input
                  list="analytics-source-fields"
                  placeholder="totalcost"
                  value={d.measure}
                  onChange={(e) => setD({ ...d, measure: e.target.value })}
                />
              </label>
              <label>
                Aggregation
                <select
                  value={d.aggregation}
                  onChange={(e) =>
                    setD({ ...d, aggregation: e.target.value as any })
                  }
                >
                  <option value="count">Count</option>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
              </label>
            </div>
          </section>
          <section className="data-card an-section">
            <h3>Visualization</h3>
            <div className="an-fields two">
              <label>
                Type
                <select
                  value={d.visualization.type}
                  onChange={(e) =>
                    setD({
                      ...d,
                      visualization: {
                        ...d.visualization,
                        type: e.target
                          .value as AnalyticsDefinition["visualization"]["type"],
                      },
                    })
                  }
                >
                  <option value="kpi">KPI Card</option>
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie / Donut</option>
                  <option value="table">Table</option>
                </select>
              </label>
              <label>
                Title
                <input
                  value={d.visualization.title}
                  onChange={(e) =>
                    setD({
                      ...d,
                      visualization: {
                        ...d.visualization,
                        title: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="an-visual-toggles">
              <label className="an-check">
                <input
                  type="checkbox"
                  checked={d.visualization.showLabels}
                  onChange={(e) =>
                    setD({
                      ...d,
                      visualization: {
                        ...d.visualization,
                        showLabels: e.target.checked,
                      },
                    })
                  }
                />{" "}
                Show value labels
              </label>
              {!["kpi", "table"].includes(d.visualization.type) && (
                <label className="an-check">
                  <input
                    type="checkbox"
                    checked={d.visualization.showLegend}
                    onChange={(e) =>
                      setD({
                        ...d,
                        visualization: {
                          ...d.visualization,
                          showLegend: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  Show legend
                </label>
              )}
            </div>
            {!["kpi", "table"].includes(d.visualization.type) && (
              <VisualizationAppearanceEditor
                appearance={normalizeAppearance(d.visualization.appearance)}
                categories={(result?.rows ?? [])
                  .map((r) => String(r.label ?? ""))
                  .filter(Boolean)}
                onChange={(appearance) =>
                  setD({
                    ...d,
                    visualization: { ...d.visualization, appearance },
                  })
                }
              />
            )}
          </section>
        </div>
        <aside className="data-card an-preview">
          <div>
            <small>LIVE PREVIEW</small>
            <h3>{d.visualization.title || d.name || "Untitled Analytics"}</h3>
            {result && (
              <p>
                {result.filteredCount} of {result.rawCount} source records used.
              </p>
            )}
          </div>
          {result ? (
            <AnalyticsRenderer definition={prepared} result={result} />
          ) : (
            <div className="an-empty">
              <Play size={30} />
              <p>
                Use <b>Test & Preview</b> to load source data and render the
                visualization.
              </p>
            </div>
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}
function PairEditor({
  title,
  rows,
  setRows,
}: {
  title: string;
  rows: { key: string; value: string }[];
  setRows: (r: { key: string; value: string }[]) => void;
}) {
  const change = (i: number, k: "key" | "value", v: string) => {
    const n = rows.map((r, j) => (j === i ? { ...r, [k]: v } : r));
    if (i === n.length - 1 && (n[i].key || n[i].value))
      n.push({ key: "", value: "" });
    setRows(n);
  };
  return (
    <div className="an-pairs">
      <b>{title}</b>
      {rows.map((r, i) => (
        <div key={i}>
          <input
            placeholder="Key"
            value={r.key}
            onChange={(e) => change(i, "key", e.target.value)}
          />
          <input
            placeholder="Value / {{parameter}}"
            value={r.value}
            onChange={(e) => change(i, "value", e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
function FilterRow({
  filter,
  onChange,
  onDelete,
}: {
  filter: AnalyticsFilter;
  onChange: (f: AnalyticsFilter) => void;
  onDelete: () => void;
}) {
  return (
    <div className="an-filter-row">
      <input
        placeholder="Field path"
        value={filter.field}
        onChange={(e) => onChange({ ...filter, field: e.target.value })}
      />
      <select
        value={filter.operator}
        onChange={(e) =>
          onChange({ ...filter, operator: e.target.value as any })
        }
      >
        <option value="equals">=</option>
        <option value="notEquals">≠</option>
        <option value="contains">contains</option>
        <option value="gt">&gt;</option>
        <option value="gte">≥</option>
        <option value="lt">&lt;</option>
        <option value="lte">≤</option>
      </select>
      <input
        placeholder="Value / {{parameter}}"
        value={filter.value}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
      />
      <button onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function VisualizationAppearanceEditor({
  appearance,
  categories,
  onChange,
}: {
  appearance: AnalyticsAppearance;
  categories: string[];
  onChange: (value: AnalyticsAppearance) => void;
}) {
  const unique = [...new Set(categories)];
  return (
    <div className="an-appearance">
      <div className="an-section-title">
        <div>
          <b>Appearance</b>
          <small>
            Colors are persisted with the analytics definition and reused in
            preview and published views.
          </small>
        </div>
      </div>
      <div className="an-fields two">
        <label>
          Color mode
          <select
            value={appearance.colorMode}
            onChange={(e) =>
              onChange({
                ...appearance,
                colorMode: e.target.value as AnalyticsAppearance["colorMode"],
              })
            }
          >
            <option value="palette">Automatic Palette</option>
            <option value="single">Single Color</option>
            <option value="category">Color by Category</option>
            <option value="custom">Custom Category Colors</option>
          </select>
        </label>
        {appearance.colorMode !== "single" && (
          <label>
            Palette
            <select
              value={appearance.palette}
              onChange={(e) =>
                onChange({
                  ...appearance,
                  palette: e.target.value as AnalyticsAppearance["palette"],
                })
              }
            >
              {Object.keys(ANALYTICS_PALETTES).map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
            <div className="an-palette-preview">
              {ANALYTICS_PALETTES[appearance.palette].map((color, index) => (
                <i
                  key={`${color}-${index}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </label>
        )}
      </div>
      {appearance.colorMode === "single" && (
        <label>
          Series color
          <div className="an-color-field">
            <input
              type="color"
              value={appearance.singleColor}
              onChange={(e) =>
                onChange({ ...appearance, singleColor: e.target.value })
              }
            />
            <input
              value={appearance.singleColor}
              pattern="#[0-9A-Fa-f]{6}"
              onChange={(e) =>
                /^#[0-9A-Fa-f]{6}$/.test(e.target.value) &&
                onChange({ ...appearance, singleColor: e.target.value })
              }
            />
          </div>
        </label>
      )}
      {appearance.colorMode === "custom" && (
        <div className="an-category-colors">
          <b>Category colors</b>
          {unique.length ? (
            unique.map((category, index) => {
              const fallback =
                ANALYTICS_PALETTES[appearance.palette][
                  index % ANALYTICS_PALETTES[appearance.palette].length
                ];
              const color = appearance.categoryColors[category] || fallback;
              return (
                <label key={category}>
                  <span>{category}</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) =>
                      onChange({
                        ...appearance,
                        categoryColors: {
                          ...appearance.categoryColors,
                          [category]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              );
            })
          ) : (
            <small>
              Run Test & Preview to load categories, then customize their
              colors.
            </small>
          )}
        </div>
      )}
    </div>
  );
}
