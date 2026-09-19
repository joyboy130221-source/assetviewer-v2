import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, CircleX, Copy } from "lucide-react";
import { useParams } from "react-router-dom";
import { FieldRenderer } from "../../features/form-builder/components/FieldRenderer";
import { formApi } from "../../features/form-builder/services/formApi";
import type {
  FormDefinition,
  FormRule,
} from "../../features/form-builder/model/form.types";
const matches = (rule: FormRule, values: Record<string, unknown>) =>
  (rule.conditions || []).every((c) => {
    const a = values[c.field],
      b = c.value;
    if (c.operator === "notEquals") return String(a ?? "") !== String(b ?? "");
    if (c.operator === "contains")
      return String(a ?? "").includes(String(b ?? ""));
    if (c.operator === "empty") return a == null || a === "";
    if (c.operator === "notEmpty") return a != null && a !== "";
    if (c.operator === "greaterThan") return Number(a) > Number(b);
    if (c.operator === "lessThan") return Number(a) < Number(b);
    return String(a ?? "") === String(b ?? "");
  });
const stateFor = (
  name: string,
  rules: FormRule[],
  values: Record<string, unknown>,
) => {
  const state = { hidden: false, disabled: false, required: false };
  for (const r of rules)
    if (matches(r, values))
      for (const a of r.actions || [])
        if (a.field === name) {
          if (a.type === "hide") state.hidden = true;
          if (a.type === "show") state.hidden = false;
          if (a.type === "disable") state.disabled = true;
          if (a.type === "enable") state.disabled = false;
          if (a.type === "required") state.required = true;
        }
  return state;
};
export default function UserFormPage() {
  const { formId = "" } = useParams();
  const [form, setForm] = useState<FormDefinition>();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [workflowExecution, setWorkflowExecution] = useState<any>(null);
  useEffect(() => {
    formApi
      .publicForm(
        formId,
        new URLSearchParams(window.location.search).toString(),
      )
      .then((loaded) => {
        setForm(loaded);
        setValues(loaded.initialValues || {});
        if (loaded.integrationError) setError(loaded.integrationError);
      })
      .catch((e) => setError(e.message));
  }, [formId]);
  if (error)
    return (
      <main
        className={`public-form-shell form-theme-${form?.theme || "current"}`}
      >
        <section className="state-card error">
          <h2>Form unavailable</h2>
          <p>{error}</p>
        </section>
      </main>
    );
  if (!form)
    return (
      <main
        className={`public-form-shell form-theme-${form?.theme || "current"}`}
      >
        <section className="state-card">Loading form…</section>
      </main>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await formApi.submit(
        form.id,
        values,
        new URLSearchParams(window.location.search).toString(),
      );
      if (
        result.responseAction?.type === "redirect" &&
        result.responseAction.value
      ) {
        window.location.assign(result.responseAction.value);
        return;
      }
      if (
        result.responseAction?.type === "message" &&
        result.responseAction.value
      )
        sessionStorage.setItem(
          `form-success:${form.id}`,
          result.responseAction.value,
        );
      setWorkflowExecution(result.workflowExecution || null);
      setDone(true);
    } catch (e: any) {
      if (e?.body?.workflowExecution) {
        setWorkflowExecution(e.body.workflowExecution);
        setError(e.message);
        setDone(true);
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };
  if (done) {
    const workflowFailed = workflowExecution?.status === "FAILED";
    const successMessage = sessionStorage.getItem(`form-success:${form.id}`);

    return (
      <main
        className={`public-form-shell form-theme-${form?.theme || "current"}`}
      >
        <section className={`fb-success ${workflowFailed ? "is-failed" : ""}`}>
          <div className="fb-success-hero">
            <div className="fb-success-icon" aria-hidden="true">
              {workflowFailed ? (
                <CircleX size={34} />
              ) : (
                <CheckCircle2 size={34} />
              )}
            </div>
            <h1>
              {workflowFailed
                ? "Workflow execution failed"
                : workflowExecution
                  ? "Workflow completed successfully"
                  : "Submission received"}
            </h1>
            <p>
              {workflowFailed
                ? error ||
                  "The submission was received, but an integration step failed."
                : successMessage ||
                  (workflowExecution
                    ? "Your request was processed successfully."
                    : "Thank you. Your response has been recorded.")}
            </p>
          </div>

          {workflowExecution && (
            <div className="fb-workflow-result">
              <div className="fb-workflow-result-summary">
                <div className="fb-workflow-result-identity">
                  <span className="fb-workflow-result-label">
                    Workflow Execution
                  </span>
                  <span className="fb-workflow-execution-id">
                    Execution ID: {workflowExecution.workflowExecutionId}
                    <button
                      type="button"
                      className="fb-copy-id"
                      title="Copy execution ID"
                      aria-label="Copy workflow execution ID"
                      onClick={() =>
                        navigator.clipboard?.writeText(
                          workflowExecution.workflowExecutionId,
                        )
                      }
                    >
                      <Copy size={14} />
                    </button>
                  </span>
                </div>
                <div className="fb-workflow-result-status">
                  <span
                    className={`fb-workflow-status-badge ${
                      workflowFailed ? "failed" : "success"
                    }`}
                  >
                    {workflowFailed ? "FAILED" : "SUCCESS"}
                  </span>
                  <span>{workflowExecution.durationMs} ms total</span>
                </div>
              </div>

              <div className="fb-workflow-result-steps">
                {workflowExecution.steps.map((step: any, index: number) => {
                  const isBrowserStep =
                    step.type === "browser" ||
                    String(step.request?.method || "").startsWith("BROWSER:");
                  const httpStatus = Number(step.status);
                  const stepFailed =
                    step.success === false ||
                    Boolean(step.error) ||
                    (!isBrowserStep &&
                      Number.isFinite(httpStatus) &&
                      httpStatus >= 400);
                  const stepStatusLabel = isBrowserStep
                    ? stepFailed
                      ? "FAILED"
                      : "SUCCESS"
                    : (step.status ?? (stepFailed ? "ERROR" : "SUCCESS"));
                  return (
                    <details
                      key={`${step.key}-${index}`}
                      className={`fb-workflow-result-step ${
                        stepFailed ? "is-failed" : ""
                      }`}
                    >
                      <summary>
                        <span className="fb-workflow-step-title">
                          <span className="fb-workflow-step-state">
                            {stepFailed ? "×" : "✓"}
                          </span>
                          <span>
                            <small>Step {index + 1}</small>
                            <strong>{step.name}</strong>
                          </span>
                        </span>
                        <span className="fb-workflow-step-metrics">
                          <b>{stepStatusLabel}</b>
                          <span>{step.durationMs} ms</span>
                          <span className="fb-workflow-expand-hint">
                            Details
                          </span>
                        </span>
                      </summary>
                      <div className="fb-workflow-result-detail">
                        <section>
                          <h3>Resolved Request</h3>
                          <pre>{JSON.stringify(step.request, null, 2)}</pre>
                        </section>
                        <section>
                          <h3>
                            {isBrowserStep ? "Browser Result" : "API Response"}
                          </h3>
                          <pre>{JSON.stringify(step.response, null, 2)}</pre>
                        </section>
                        {step.error && (
                          <p className="fb-inline-error">{step.error}</p>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }
  return (
    <main
      className={`public-form-shell form-theme-${form?.theme || "current"}`}
    >
      {submitting && (
        <div className="fb-submit-loading" role="status" aria-live="polite">
          <div className="fb-submit-loading-card">
            <span className="spinner" />
            <strong>Submitting form…</strong>
            <span>Please wait while the integration request completes.</span>
          </div>
        </div>
      )}
      <section className="fb-user-form-card">
        <div className="fb-user-form-head">
          <p className="eyebrow">{form.organizationName || "FORM"}</p>
          <h1>{form.name}</h1>
          <p>{form.description}</p>
        </div>
        <form onSubmit={submit}>
          <div className="fb-user-fields">
            {form.fields.map((field) => {
              const state = stateFor(field.name, form.rules || [], values);
              if (state.hidden) return null;
              return (
                <div
                  key={field.id}
                  className={state.disabled ? "fb-field-disabled" : ""}
                >
                  <FieldRenderer
                    field={{
                      ...field,
                      required: field.required || state.required,
                      readOnly: field.readOnly || state.disabled,
                    }}
                    value={values[field.name]}
                    onChange={(value) =>
                      setValues({ ...values, [field.name]: value })
                    }
                  />
                </div>
              );
            })}
          </div>
          {error && <p className="fb-inline-error">{error}</p>}
          {form.showSubmitButton !== false && (
            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Submitting…"
                : form.submitButtonLabel || "Submit Form"}
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
