import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Play, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { api } from "../../services/api";
import { apiWatcherApi } from "../../features/api-watcher/services/apiWatcherApi";
import { SearchableFieldCombo } from "../../features/api-watcher/components/SearchableFieldCombo";
import { KeyValueEditor } from "../../features/api-watcher/components/KeyValueEditor";
import {
  kvObject,
  kvRows,
} from "../../features/api-watcher/components/RestActionEditor";
import {
  WatcherChainEditor,
  type ChainEditorContext,
} from "../../features/api-watcher/components/WatcherChainEditor";
import {
  chainProblem,
  newRestAction,
  precedingTemplates,
  toEditableEvent,
  toPersistedDefinition,
} from "../../features/api-watcher/model/watcherChain";
import type {
  ApiWatcherDefinition,
  EventAction,
  KeyValue,
  RestAction,
  SourceTestResult,
  WatcherStep,
} from "../../features/api-watcher/model/apiWatcher.types";
import { compactQueryParameters } from "../../shared/http/queryParams";
import { createId } from "../../shared/workflow/createId";
import type { MessageConnectionOption } from "../../shared/workflow/workflowStep.types";

type Org = { id: string; name: string; active: boolean };
type Profile = {
  id: string;
  name: string;
  active: boolean;
  organization_id?: string | null;
};
type Performance = ApiWatcherDefinition["performance"];

/** Defaults for new watchers; the server clamps every value again. */
const DEFAULT_PERFORMANCE: Performance = {
  intervalSeconds: 300,
  maxRecordsPerRun: 1000,
  concurrency: 5,
  timeoutMs: 15000,
  retryCount: 2,
  overlapSeconds: 5,
  maxEnrichmentSteps: 10,
  maxEventSteps: 10,
  browserConcurrency: 2,
  browserTimeoutMs: 30000,
  maxDlqWindowSeconds: 30,
};
const EVENT_METHODS = ["POST", "PUT", "PATCH", "DELETE", "GET"];
const ENRICHMENT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const blank = (org = ""): ApiWatcherDefinition => ({
  organizationId: org,
  name: "",
  description: "",
  active: false,
  source: {
    action: newRestAction("GET"),
    recordsPath: "",
    checkpointParam: "",
  },
  changeDetection: {
    recordIdField: "",
    lastUpdatedField: "",
    sourceTimezone: "UTC",
    initialMode: "startNow",
    initialStartAt: "",
  },
  enrichmentSteps: [],
  events: {
    onNew: {
      enabled: true,
      targetRecordIdPath: "",
      steps: [
        {
          id: createId(),
          key: "createTarget",
          name: "Create target record",
          enabled: true,
          type: "api",
          action: newRestAction("POST"),
        },
      ],
    },
    onModified: {
      enabled: true,
      targetRecordIdPath: "",
      steps: [
        {
          id: createId(),
          key: "updateTarget",
          name: "Update target record",
          enabled: true,
          type: "api",
          action: newRestAction("PATCH"),
        },
      ],
    },
  },
  performance: { ...DEFAULT_PERFORMANCE },
});
const queryList = (r: KeyValue[]) => compactQueryParameters(r);
const sourceTemplates = (fields: string[]) => [
  ...fields.map((f) => `{{source.${f}}}`),
  "{{sourceRecordId}}",
  "{{targetRecordId}}",
  "{{eventType}}",
  "{{watcherId}}",
  "{{checkpoint}}",
  "{{uuid}}",
  "{{timestamp}}",
];

/** Numeric performance input bound to one setting. */
function PerfNumber({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: ReactNode;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function EventChainSection({
  title,
  kind,
  value,
  onChange,
  context,
  reservedKeys,
}: {
  title: string;
  kind: "NEW" | "MODIFIED";
  value: EventAction;
  onChange: (v: EventAction) => void;
  context: ChainEditorContext;
  reservedKeys: ReadonlySet<string>;
}) {
  const steps = value.steps || [];
  return (
    <section className="data-card aw-section">
      <div className="aw-section-title">
        <div>
          <h3>{title}</h3>
          <small>
            Runs after all enabled enrichment steps complete successfully. Steps
            run in order; the first failing step stops the chain and the record
            is retried according to Retry Count.
          </small>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />{" "}
          Enabled
        </label>
      </div>
      <WatcherChainEditor
        steps={steps}
        onChange={(next) => onChange({ ...value, steps: next })}
        context={context}
        keyPrefix={kind === "NEW" ? "newStep" : "modifiedStep"}
        reservedKeys={reservedKeys}
        restMethods={EVENT_METHODS}
        addLabel="Add Event Step"
        emptyText={
          value.enabled
            ? "No steps yet. Records for this event are skipped until a step is added."
            : "Event disabled."
        }
      />
      <div className="aw-grid three aw-target-settings">
        <label>
          Target Record ID Step
          <select
            value={value.targetRecordIdStepKey || ""}
            onChange={(e) =>
              onChange({
                ...value,
                targetRecordIdStepKey: e.target.value || undefined,
              })
            }
          >
            <option value="">Last step in chain</option>
            {steps
              .filter((s) => s.key)
              .map((s) => (
                <option key={s.id} value={s.key}>
                  {s.name} ({s.key})
                </option>
              ))}
          </select>
        </label>
        <label>
          Target Record ID Response Path
          <input
            value={value.targetRecordIdPath || ""}
            onChange={(e) =>
              onChange({ ...value, targetRecordIdPath: e.target.value })
            }
            placeholder="id, workOrderId or messageId"
          />
          <small>
            Stored as <code>{"{{targetRecordId}}"}</code> for later MODIFIED
            events of the same source record.
          </small>
        </label>
      </div>
    </section>
  );
}

/** First client-side chain problem, mirroring the server validation. */
function chainProblems(d: ApiWatcherDefinition): string | null {
  const enrichment = d.enrichmentSteps || [];
  const reserved = new Set(enrichment.map((s) => s.key));
  return (
    chainProblem("Enrichment", enrichment) ||
    chainProblem("New Record event", d.events.onNew.steps || [], reserved) ||
    chainProblem(
      "Modified Record event",
      d.events.onModified.steps || [],
      reserved,
    )
  );
}

export default function ApiWatcherDesignerPage() {
  const { watcherId } = useParams(),
    isNew = !watcherId;
  const [d, setD] = useState<ApiWatcherDefinition>(blank()),
    [orgs, setOrgs] = useState<Org[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [test, setTest] = useState<SourceTestResult | null>(null),
    [busy, setBusy] = useState(false);
  const [sourceHeaders, setSourceHeaders] = useState<KeyValue[]>([
      { key: "", value: "" },
    ]),
    [sourceParams, setSourceParams] = useState<KeyValue[]>([
      { key: "", value: "" },
    ]);
  const nav = useNavigate(),
    ui = useAppUI();
  useEffect(() => {
    api<{ data: Org[] }>("/api/admin/organizations").then((x) => {
      const active = x.data.filter((o) => o.active);
      setOrgs(active);
      if (isNew && active[0])
        setD((v) => ({ ...v, organizationId: active[0].id }));
    });
    api<{ data: Profile[] }>("/api/admin/authentication-profiles").then((x) =>
      setProfiles(x.data.filter((p) => p.active)),
    );
    if (watcherId) {
      apiWatcherApi.get(watcherId).then((x) => {
        const base = blank();
        const def: ApiWatcherDefinition = {
          ...base,
          ...x.definition,
          id: x.id,
          enrichmentSteps: x.definition.enrichmentSteps || [],
          // Legacy single-action events are upgraded to editable chains.
          events: {
            onNew: toEditableEvent(x.definition.events?.onNew, "NEW"),
            onModified: toEditableEvent(
              x.definition.events?.onModified,
              "MODIFIED",
            ),
          },
          performance: { ...DEFAULT_PERFORMANCE, ...x.definition.performance },
        };
        setD(def);
        setSourceHeaders(kvRows(def.source.action.headers));
        setSourceParams(kvRows(def.source.action.params));
      });
    }
  }, [watcherId]);
  const [connections, setConnections] = useState<MessageConnectionOption[]>([]);
  // Message Bus connections are tenant scoped: reload when the organization
  // changes so a step can only pick connections that tenant may use.
  useEffect(() => {
    if (!d.organizationId) return setConnections([]);
    let cancelled = false;
    apiWatcherApi
      .messageConnections(d.organizationId)
      .then((x) => !cancelled && setConnections(x))
      .catch(() => !cancelled && setConnections([]));
    return () => {
      cancelled = true;
    };
  }, [d.organizationId]);
  const prepared = useMemo(
    () => ({
      ...d,
      source: {
        ...d.source,
        action: {
          ...d.source.action,
          headers: kvObject(sourceHeaders),
          params: queryList(sourceParams),
        },
      },
    }),
    [d, sourceHeaders, sourceParams],
  );
  const save = async () => {
    if (!prepared.name.trim() || !prepared.organizationId)
      return ui.toast("Name and organization are required.", "error");
    const problem = chainProblems(prepared);
    if (problem) return ui.toast(problem, "error");
    const payload = toPersistedDefinition(prepared);
    try {
      setBusy(true);
      if (isNew) {
        const id = await apiWatcherApi.create(payload);
        ui.toast("API Watcher created.", "success");
        nav(`/admin/automation/api-watchers/${id}`);
      } else {
        await apiWatcherApi.save(payload);
        ui.toast("API Watcher saved.", "success");
      }
    } catch (e) {
      ui.toast(
        e instanceof Error ? e.message : "Unable to save API Watcher.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  const testSource = async () => {
    try {
      setBusy(true);
      const r = await apiWatcherApi.test(prepared);
      setTest(r);
      if (!d.source.recordsPath && r.recordsPath)
        setD((v) => ({
          ...v,
          source: { ...v.source, recordsPath: r.recordsPath },
        }));
      ui.toast(`Source API loaded ${r.count} record(s).`, "success");
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : "Source test failed.", "error");
    } finally {
      setBusy(false);
    }
  };
  const availableProfiles = useMemo(
    () =>
      profiles.filter(
        (p) => !p.organization_id || p.organization_id === d.organizationId,
      ),
    [profiles, d.organizationId],
  );
  const sourcePatch = (p: Partial<RestAction>) =>
    setD((v) => ({
      ...v,
      source: { ...v.source, action: { ...v.source.action, ...p } },
    }));
  const fields = test?.fields || [];
  const templates = useMemo(() => sourceTemplates(fields), [fields]);
  const enrichmentSteps = d.enrichmentSteps || [];
  const enrichmentKeys = useMemo(
    () => new Set(enrichmentSteps.map((s) => s.key).filter(Boolean)),
    [enrichmentSteps],
  );
  const perf = d.performance;
  const setPerf = (p: Partial<Performance>) =>
    setD((v) => ({ ...v, performance: { ...v.performance, ...p } }));
  const chainContext: ChainEditorContext = {
    profiles: availableProfiles,
    connections,
    baseTemplates: templates,
    maxDlqWindowSeconds: perf.maxDlqWindowSeconds,
  };
  const eventContext: ChainEditorContext = {
    ...chainContext,
    upstreamTemplates: precedingTemplates(
      enrichmentSteps,
      enrichmentSteps.length,
    ),
  };
  return (
    <AdminLayout
      permission="apiWatchers"
      eyebrow="AUTOMATE / API WATCHER"
      title={isNew ? "Create API Watcher" : d.name || "API Watcher"}
      subtitle="Detect source changes, enrich each record through a reusable action chain, then execute create or update actions with full diagnostics."
    >
      <div className="an-builder-actions">
        <button
          className="secondary-button"
          onClick={() => nav("/admin/automation/api-watchers")}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void testSource()}
          >
            <Play size={16} /> Test Source API
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void save()}
          >
            <Save size={16} /> Save
          </button>
        </div>
      </div>
      <div className="aw-stack">
        <section className="data-card aw-section">
          <div className="fb-section-heading">
            <div>
              <span className="fb-section-number">1</span>
              <div>
                <h3>General</h3>
                <small>Tenant ownership and lifecycle.</small>
              </div>
            </div>
          </div>
          <div className="aw-grid three">
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
                onChange={(e) => setD({ ...d, organizationId: e.target.value })}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={d.active ? "active" : "inactive"}
                onChange={(e) =>
                  setD({ ...d, active: e.target.value === "active" })
                }
              >
                <option value="inactive">Inactive</option>
                <option value="active">Active</option>
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
        </section>
        <section className="data-card aw-section">
          <div className="fb-section-heading">
            <div>
              <span className="fb-section-number">2</span>
              <div>
                <h3>Source API</h3>
                <small>
                  Retrieve records incrementally using the checkpoint whenever
                  the source supports it.
                </small>
              </div>
            </div>
          </div>
          <div className="aw-grid three">
            <label>
              Method
              <select
                value={d.source.action.method}
                onChange={(e) => sourcePatch({ method: e.target.value })}
              >
                <option>GET</option>
              </select>
            </label>
            <label>
              Authentication Profile
              <select
                value={d.source.action.authProfileId || ""}
                onChange={(e) => sourcePatch({ authProfileId: e.target.value })}
              >
                <option value="">None</option>
                {availableProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Checkpoint Query Parameter
              <input
                value={d.source.checkpointParam}
                onChange={(e) =>
                  setD({
                    ...d,
                    source: { ...d.source, checkpointParam: e.target.value },
                  })
                }
                placeholder="modifiedSince"
              />
            </label>
          </div>
          <label>
            Endpoint URL
            <input
              value={d.source.action.url}
              onChange={(e) => sourcePatch({ url: e.target.value })}
            />
          </label>
          <details>
            <summary>Headers</summary>
            <KeyValueEditor
              rows={sourceHeaders}
              templates={["{{checkpoint}}", "{{uuid}}", "{{timestamp}}"]}
              onChange={setSourceHeaders}
            />
          </details>
          <details>
            <summary>Query Parameters</summary>
            <KeyValueEditor
              rows={sourceParams}
              templates={["{{checkpoint}}", "{{uuid}}", "{{timestamp}}"]}
              onChange={setSourceParams}
            />
          </details>
        </section>
        <section className="data-card aw-section">
          <div className="fb-section-heading">
            <div>
              <span className="fb-section-number">3</span>
              <div>
                <h3>Change Detection</h3>
                <small>
                  Test the source first, then search and select the identity and
                  modification fields.
                </small>
              </div>
            </div>
          </div>
          <div className="aw-grid three">
            <label>
              Initial Sync
              <select
                value={d.changeDetection.initialMode}
                onChange={(e) =>
                  setD({
                    ...d,
                    changeDetection: {
                      ...d.changeDetection,
                      initialMode: e.target
                        .value as ApiWatcherDefinition["changeDetection"]["initialMode"],
                    },
                  })
                }
              >
                <option value="startNow">Start monitoring from now</option>
                <option value="processExisting">
                  Process existing records
                </option>
                <option value="startAt">Start from date/time</option>
              </select>
            </label>
            {d.changeDetection.initialMode === "startAt" && (
              <label>
                Initial Start At
                <input
                  value={d.changeDetection.initialStartAt || ""}
                  onChange={(e) =>
                    setD({
                      ...d,
                      changeDetection: {
                        ...d.changeDetection,
                        initialStartAt: e.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
            <label>
              Records Path
              <input
                value={d.source.recordsPath}
                onChange={(e) =>
                  setD({
                    ...d,
                    source: { ...d.source, recordsPath: e.target.value },
                  })
                }
                placeholder="member"
              />
            </label>
            <label>
              Record ID Field
              <SearchableFieldCombo
                value={d.changeDetection.recordIdField}
                onChange={(v) =>
                  setD({
                    ...d,
                    changeDetection: { ...d.changeDetection, recordIdField: v },
                  })
                }
                fields={fields}
                placeholder="Search discovered fields"
              />
            </label>
            <label>
              Last Updated Field
              <SearchableFieldCombo
                value={d.changeDetection.lastUpdatedField}
                onChange={(v) =>
                  setD({
                    ...d,
                    changeDetection: {
                      ...d.changeDetection,
                      lastUpdatedField: v,
                    },
                  })
                }
                fields={fields}
                placeholder="Search discovered fields"
              />
            </label>
          </div>
          {test && (
            <small>
              {fields.length} field(s) discovered · {test.candidates.length}{" "}
              records-path candidate(s).
            </small>
          )}
        </section>
        <section className="data-card aw-section">
          <div className="fb-section-heading">
            <div>
              <span className="fb-section-number">4</span>
              <div>
                <h3>Enrichment / Pre-Action Chain</h3>
                <small>
                  Optional API, Browser RPA or Message Bus steps executed in
                  order for each NEW or MODIFIED record before its event chain.
                </small>
              </div>
            </div>
          </div>
          <WatcherChainEditor
            steps={enrichmentSteps}
            onChange={(next) =>
              setD((v) => ({ ...v, enrichmentSteps: next as WatcherStep[] }))
            }
            context={chainContext}
            keyPrefix="step"
            restMethods={ENRICHMENT_METHODS}
            emptyText="No enrichment steps. Event actions will receive the source record directly."
          />
        </section>
        <section className="data-card aw-section">
          <div className="fb-section-heading">
            <div>
              <span className="fb-section-number">5</span>
              <div>
                <h3>Performance & Reliability</h3>
                <small>
                  Bound source load and downstream concurrency without changing
                  integration logic.
                </small>
              </div>
            </div>
          </div>
          <div className="aw-grid three">
            <label>
              Polling Interval
              <select
                value={d.performance.intervalSeconds}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      intervalSeconds: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={60}>Every 1 minute</option>
                <option value={300}>Every 5 minutes</option>
                <option value={600}>Every 10 minutes</option>
                <option value={900}>Every 15 minutes</option>
                <option value={1800}>Every 30 minutes</option>
                <option value={3600}>Every 1 hour</option>
              </select>
            </label>
            <label>
              Max Records / Run
              <input
                type="number"
                min={1}
                max={10000}
                value={d.performance.maxRecordsPerRun}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      maxRecordsPerRun: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Concurrent Records
              <input
                type="number"
                min={1}
                max={20}
                value={d.performance.concurrency}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      concurrency: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              API Timeout (ms)
              <input
                type="number"
                min={1000}
                max={120000}
                value={d.performance.timeoutMs}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      timeoutMs: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Retry Count
              <input
                type="number"
                min={0}
                max={5}
                value={d.performance.retryCount}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      retryCount: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Checkpoint Overlap (sec)
              <input
                type="number"
                min={0}
                max={300}
                value={d.performance.overlapSeconds}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      overlapSeconds: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Max Enrichment Steps
              <input
                type="number"
                min={0}
                max={25}
                value={d.performance.maxEnrichmentSteps ?? 10}
                onChange={(e) =>
                  setD({
                    ...d,
                    performance: {
                      ...d.performance,
                      maxEnrichmentSteps: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <PerfNumber
              label="Max Event Chain Steps"
              value={perf.maxEventSteps}
              min={1}
              max={25}
              onChange={(maxEventSteps) => setPerf({ maxEventSteps })}
            />
          </div>
          <h4 className="aw-subheading">Browser RPA &amp; Message Bus</h4>
          <div className="aw-grid three">
            <PerfNumber
              label="Concurrent Browser Sessions"
              value={perf.browserConcurrency}
              min={1}
              max={20}
              onChange={(browserConcurrency) => setPerf({ browserConcurrency })}
              hint="Isolated browser contexts open at once. One shared Chromium process per run; capped by WORKFLOW_BROWSER_MAX_CONCURRENCY."
            />
            <PerfNumber
              label="Browser Action Timeout Ceiling (ms)"
              value={perf.browserTimeoutMs}
              min={1000}
              max={120000}
              onChange={(browserTimeoutMs) => setPerf({ browserTimeoutMs })}
              hint="Upper bound for each Browser RPA action timeout."
            />
            <PerfNumber
              label="DLQ Monitoring Ceiling (sec)"
              value={perf.maxDlqWindowSeconds}
              min={1}
              max={600}
              onChange={(maxDlqWindowSeconds) =>
                setPerf({ maxDlqWindowSeconds })
              }
              hint="Upper bound for Check Dead Letter monitoring windows. Each check holds a record worker for up to this long."
            />
          </div>
          <small>
            Advisory locking prevents overlapping runs. State lookup is batched.
            Record processing uses bounded concurrency; each record executes its
            chains sequentially to preserve dependencies. Browser sessions are
            only started when a chain contains a Browser RPA step, and Service
            Bus connections are reused for the whole run.
          </small>
        </section>
        <EventChainSection
          title="6A · Event Action — New Record"
          kind="NEW"
          value={d.events.onNew}
          onChange={(v) =>
            setD((x) => ({ ...x, events: { ...x.events, onNew: v } }))
          }
          context={eventContext}
          reservedKeys={enrichmentKeys}
        />
        <EventChainSection
          title="6B · Event Action — Modified Record"
          kind="MODIFIED"
          value={d.events.onModified}
          onChange={(v) =>
            setD((x) => ({ ...x, events: { ...x.events, onModified: v } }))
          }
          context={eventContext}
          reservedKeys={enrichmentKeys}
        />
      </div>
    </AdminLayout>
  );
}
