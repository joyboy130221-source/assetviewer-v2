import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, jsonInit } from "../services/api";
import { pad, toMaximoDateTime } from "../utils/format";
import { LoadingOverlay, useAppUI } from "../components/AppUI";
const nowValue = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
};
export default function CreateWorkOrderPage() {
  const [sp] = useSearchParams(),
    env = (sp.get("env") || "").trim(),
    assetId = (sp.get("assetId") || "").trim(),
    ui = useAppUI();
  const [loading, setLoading] = useState(false),
    [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null),
    [resetKey, setResetKey] = useState(0);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      setMsg({
        text: "Please complete all required fields before submitting.",
        ok: false,
      });
      return;
    }
    if (!env) {
      setMsg({
        text: "Missing env parameter. Open this page using ?env=demo-coh&assetId=V6-0401",
        ok: false,
      });
      return;
    }
    const body: any = Object.fromEntries(new FormData(form));
    try {
      body.reportdate = toMaximoDateTime(body.reportdate);
    } catch (err: any) {
      setMsg({ text: err.message, ok: false });
      return;
    }
    body.env = env;
    if (
      !(await ui.confirm({
        title: "Create work order?",
        message: `Create a work order for asset ${body.assetnum}?`,
        confirmText: "Create Work Order",
      }))
    )
      return;
    setLoading(true);
    try {
      const b = await api<any>("/api/work-order", jsonInit("POST", body));
      setMsg({
        text: b.message || "Work order created successfully.",
        ok: true,
      });
      ui.toast(
        b.wonum
          ? `Work order ${b.wonum} was created successfully.`
          : "Work order was created successfully.",
      );
      setResetKey((k) => k + 1);
    } catch (err: any) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <main className="page-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">MAXIMO WORK ORDER</p>
            <h1>Create Work Order</h1>
            <p className="subtitle">
              Complete all fields before submitting the work order to Maximo.
            </p>
          </div>
          <Link
            className="secondary-button"
            to={`/?env=${encodeURIComponent(env)}&assetId=${encodeURIComponent(assetId)}`}
          >
            Back to Asset
          </Link>
        </header>
        <section className="form-card">
          <form key={resetKey} onSubmit={submit} noValidate>
            {msg && (
              <div
                className={`form-message ${msg.ok ? "success-message" : "error-message"}`}
              >
                {msg.text}
              </div>
            )}
            <div className="form-grid">
              <Field label="Site ID" name="siteid" defaultValue="BEDFORD" />
              <Field
                label="Organization ID"
                name="orgid"
                defaultValue="EAGLENA"
              />
              <Field
                label="Asset Number"
                name="assetnum"
                defaultValue={assetId}
                placeholder="Example: V6-0401"
              />
              <label className="form-field">
                Location <span className="required">*</span>
                <select name="location" required defaultValue="">
                  <option value="">Select location</option>
                  {["UPS", "DHL", "WILSON", "PEDRICK", "KELLER"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="form-field full-width">
                Description <span className="required">*</span>
                <textarea
                  name="description"
                  maxLength={500}
                  required
                  placeholder="Describe the required work"
                />
              </label>
              <Field
                label="WO Priority"
                name="wopriority"
                type="number"
                placeholder="Example: 1"
              />
              <label className="form-field">
                Work Type <span className="required">*</span>
                <select name="worktype" required defaultValue="">
                  <option value="">Select work type</option>
                  <option value="ACTY">Activity</option>
                  <option value="CAL">Calibration</option>
                  <option value="CM">Corrective Maintenance</option>
                  <option value="EM">Emergency Maintenance</option>
                  <option value="EV">Event Report</option>
                </select>
              </label>
              <label className="form-field">
                Failure Code <span className="required">*</span>
                <select name="failurecode" required defaultValue="">
                  <option value="">Select failure code</option>
                  <option value="PUMPS">Pump Failure</option>
                  <option value="HARDWARE">Hardware Failures</option>
                  <option value="MECH">Mechanical</option>
                </select>
              </label>
              <Field
                label="Reported By"
                name="reportedby"
                placeholder="Enter reporter name"
              />
              <Field
                label="Report Date"
                name="reportdate"
                type="datetime-local"
                defaultValue={nowValue()}
              />
            </div>
            <div className="form-actions">
              <button className="primary-button">Submit Work Order</button>
            </div>
          </form>
        </section>
      </main>
      <LoadingOverlay show={loading} text="Creating work order…" />
    </>
  );
}
function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      {label} <span className="required">*</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required
      />
    </label>
  );
}
