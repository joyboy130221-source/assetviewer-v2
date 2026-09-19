import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { AdminLayout } from "../../components/AdminLayout";
import { useAppUI } from "../../components/AppUI";
import { api } from "../../services/api";

export default function WorkflowExecutionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [organizations, setOrganizations] = useState<any[]>([]);
  const ui = useAppUI();
  const load = async () => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (search.trim()) qs.set("search", search.trim());
    if (organizationId) qs.set("organizationId", organizationId);
    else if (organizationSearch.trim().length >= 3)
      qs.set("organizationSearch", organizationSearch.trim());
    try {
      setRows((await api<any>(`/api/admin/workflow-executions?${qs}`)).data);
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  useEffect(() => {
    void load();
    api<any>("/api/admin/organizations")
      .then((body) => setOrganizations(body.data || []))
      .catch((e) => ui.toast(e.message, "error"));
  }, []);
  const show = async (id: string) => {
    try {
      setDetail(
        (
          await api<any>(
            `/api/admin/workflow-executions?id=${encodeURIComponent(id)}`,
          )
        ).data,
      );
      setOpenStep(null);
    } catch (e: any) {
      ui.toast(e.message, "error");
    }
  };
  return (
    <AdminLayout
      permission="workflowExecutions"
      eyebrow="MONITORING"
      title="Workflow Execution History"
      subtitle="Trace every persisted multi-step workflow execution. Sensitive credentials are redacted before storage."
    >
      <section className="data-card">
        <div className="card-toolbar workflow-history-toolbar">
          <div>
            <h2>Executions</h2>
            <p>Search by execution ID or form name.</p>
          </div>
          <div className="workflow-history-filters">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Execution ID or form"
            />
            <select
              className="app-combobox"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option>SUCCESS</option>
              <option>FAILED</option>
            </select>
            <div className="searchable-combobox">
              <input
                className="app-combobox"
                value={organizationSearch}
                placeholder="Organization (type 3+ characters)"
                onChange={(e) => {
                  const value = e.target.value;
                  setOrganizationSearch(value);
                  const exact = organizations.find(
                    (org) =>
                      org.name.toLowerCase() === value.trim().toLowerCase(),
                  );
                  setOrganizationId(exact?.id || "");
                }}
                list={
                  organizationSearch.trim().length >= 3
                    ? "workflow-organizations"
                    : undefined
                }
              />
              <datalist id="workflow-organizations">
                {organizationSearch.trim().length >= 3 &&
                  organizations
                    .filter((org) =>
                      org.name
                        .toLowerCase()
                        .includes(organizationSearch.trim().toLowerCase()),
                    )
                    .slice(0, 20)
                    .map((org) => <option key={org.id} value={org.name} />)}
              </datalist>
            </div>
            <button className="secondary-button" onClick={() => void load()}>
              <RefreshCw size={15} /> Apply
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Execution ID</th>
                <th>Form</th>
                <th>Status</th>
                <th>Steps</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr
                  key={x.id}
                  onClick={() => void show(x.id)}
                  className="clickable-row"
                >
                  <td>
                    <code>{x.id}</code>
                  </td>
                  <td>{x.form_name}</td>
                  <td>
                    <span
                      className={`workflow-status ${String(x.status).toLowerCase()}`}
                    >
                      {x.status}
                    </span>
                  </td>
                  <td>{x.step_count}</td>
                  <td>{x.duration_ms} ms</td>
                  <td>{new Date(x.started_at).toLocaleString()}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>No workflow executions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {detail && (
        <section className="data-card workflow-history-detail">
          <div className="card-toolbar">
            <div>
              <h2>Execution Detail</h2>
              <p>
                <code>{detail.id}</code> · {detail.form_name} ·{" "}
                {detail.duration_ms} ms
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
          <div className="workflow-history-steps">
            {detail.steps.map((step: any, index: number) => {
              const isBrowserStep = String(
                step.request_method || "",
              ).startsWith("BROWSER:");
              const statusLabel = isBrowserStep
                ? step.success
                  ? "SUCCESS"
                  : "FAILED"
                : step.response_status || (step.success ? "SUCCESS" : "ERROR");

              return (
                <div className="workflow-history-step" key={step.id}>
                  <button
                    className="workflow-history-step-head"
                    onClick={() =>
                      setOpenStep(openStep === index ? null : index)
                    }
                  >
                    {openStep === index ? (
                      <ChevronDown size={17} />
                    ) : (
                      <ChevronRight size={17} />
                    )}
                    <strong>
                      {index + 1}. {step.step_name}
                    </strong>
                    <span>{statusLabel}</span>
                    <span>{step.duration_ms} ms</span>
                  </button>
                  {openStep === index && (
                    <div className="workflow-history-payload">
                      <h4>Resolved Request</h4>
                      <pre>
                        {JSON.stringify(
                          {
                            method: step.request_method,
                            url: step.request_url,
                            headers: step.request_headers,
                            params: step.request_params,
                            body: step.request_body,
                          },
                          null,
                          2,
                        )}
                      </pre>
                      <h4>
                        {isBrowserStep ? "Browser Result" : "API Response"}
                      </h4>
                      <pre>{JSON.stringify(step.response_body, null, 2)}</pre>
                      {step.error_message && (
                        <>
                          <h4>Error</h4>
                          <pre>{step.error_message}</pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
