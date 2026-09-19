import { ArrowLeft, Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../../components/AdminLayout";
import { formApi } from "../../features/form-builder/services/formApi";
import type {
  FormDefinition,
  FormSubmission,
} from "../../features/form-builder/model/form.types";
export default function SubmissionListPage() {
  const { formId = "" } = useParams(),
    navigate = useNavigate();
  const [form, setForm] = useState<FormDefinition>(),
    [rows, setRows] = useState<FormSubmission[]>([]);
  useEffect(() => {
    formApi.form(formId).then((x) => x && setForm(x));
    formApi.submissions(formId).then(setRows);
  }, [formId]);
  if (!form) return null;
  return (
    <AdminLayout
      permission="formBuilder"
      eyebrow="FORM BUILDER · SUBMISSIONS"
      title={`${form.name} Submissions`}
      subtitle={`${form.organizationName} · ${rows.length} response${rows.length === 1 ? "" : "s"} collected.`}
    >
      <button
        className="fb-back"
        onClick={() => navigate("/admin/integration/form-builder")}
      >
        <ArrowLeft size={16} /> Form List
      </button>
      <section className="data-card">
        {!rows.length ? (
          <div className="fb-list-empty">
            <Inbox size={34} />
            <h3>No submissions yet</h3>
            <p>
              Responses will appear here after users submit the published form.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  {form.fields.map((f) => (
                    <th key={f.id}>{f.label}</th>
                  ))}
                  <th>API Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.submittedAt).toLocaleString()}</td>
                    {form.fields.map((f) => (
                      <td key={f.id}>
                        {typeof row.values[f.name] === "boolean"
                          ? row.values[f.name]
                            ? "Yes"
                            : "No"
                          : String(row.values[f.name] ?? "")}
                      </td>
                    ))}
                    <td>
                      {!row.actionLogs?.length
                        ? "—"
                        : row.actionLogs.map((l) => (
                            <div
                              key={l.id}
                              className={`fb-api-log ${l.success ? "success" : "error"}`}
                            >
                              <strong>
                                {l.method} {l.status || "ERR"}
                              </strong>
                              <span>
                                {l.success ? "Success" : l.error || "Failed"} ·{" "}
                                {l.durationMs} ms
                              </span>
                              <small title={l.url}>{l.url}</small>
                              <details className="fb-api-response">
                                <summary>API response</summary>
                                <pre>
                                  {l.responseBody == null
                                    ? "No response body"
                                    : JSON.stringify(l.responseBody, null, 2)}
                                </pre>
                              </details>
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
