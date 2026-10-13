import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  ArrowRight,
} from "lucide-react";
import { api, apiErrorCode } from "../services/api";
import { authApi } from "../features/auth/services/authApi";
import { PasswordChangeForm } from "../features/auth/components/PasswordChangeForm";
import { LoadingOverlay, useAppUI } from "../components/AppUI";
import { productMessaging } from "../config/productMessaging";

export default function LoginPage() {
  const [msg, setMsg] = useState(""),
    [loading, setLoading] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const [sp] = useSearchParams(),
    nav = useNavigate(),
    ui = useAppUI();
  // "change": signed in, but the password must be changed first.
  const [stage, setStage] = useState<"signin" | "change">(
    sp.get("changePassword") === "1" ? "change" : "signin",
  );
  // A change link without a session (e.g. expired) falls back to sign-in.
  useEffect(() => {
    if (stage !== "change") return;
    api("/api/auth/me", { cache: "no-store" }).catch(() => setStage("signin"));
  }, [stage]);
  /** Only same-site relative targets are followed after sign-in. */
  const nextPath = () => {
    const target = sp.get("next") || "/admin";
    return target.startsWith("/") && !target.startsWith("//")
      ? target
      : "/admin";
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData(e.currentTarget);
      const result = await authApi.login(
        String(fd.get("login") || ""),
        String(fd.get("password") || ""),
      );
      if (result.mustChangePassword) {
        setStage("change");
        ui.toast("Please set a new password to continue.");
        return;
      }
      ui.toast("Signed in successfully.");
      nav(nextPath());
    } catch (e: any) {
      const text =
        apiErrorCode(e) === "ACCOUNT_LOCKED"
          ? e.message
          : e.message || "Unable to sign in.";
      setMsg(text);
      ui.toast(text, "error");
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <div className="login-page">
        <div className="login-shell">
          <section className="login-brand-panel">
            <div className="login-brand-mark">
              <ShieldCheck size={27} />
            </div>
            <div>
              <p className="login-brand-name">Integration Hub</p>
              <p className="login-brand-tag">Enterprise Administration</p>
            </div>
            <div className="login-brand-copy">
              <span className="login-kicker">INTEGRATION HUB</span>
              <h2>{productMessaging.login.headline}</h2>
              <p className="login-capability-tagline">
                {productMessaging.login.capabilityTagline}
              </p>
              <p>{productMessaging.login.description}</p>
            </div>
            <div className="login-security">
              <LockKeyhole size={17} />
              <span>Protected administrative access</span>
            </div>
          </section>
          <section className="login-card">
            <div className="login-card-head">
              <p className="eyebrow">ADMINISTRATION PORTAL</p>
              <h1>
                {stage === "change" ? "Change your password" : "Welcome back"}
              </h1>
              <p className="subtitle">
                {stage === "change"
                  ? "Your password must be changed before you can continue."
                  : "Sign in with your administrator account to continue."}
              </p>
            </div>
            {stage === "change" ? (
              <PasswordChangeForm
                onChanged={() => {
                  ui.toast("Password changed.");
                  nav(nextPath());
                }}
                onError={(text) => ui.toast(text, "error")}
              />
            ) : (
              <form onSubmit={submit}>
                <div className="form-field">
                  <label htmlFor="login">Username or email</label>
                  <div className="input-with-icon">
                    <UserRound size={18} />
                    <input
                      id="login"
                      name="login"
                      autoComplete="username"
                      placeholder="Enter username or email"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="password">Password</label>
                  <div className="input-with-icon password-field">
                    <LockKeyhole size={18} />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      title={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {msg && (
                  <p className="form-message error-message" role="alert">
                    {msg}
                  </p>
                )}
                <button
                  className="primary-button login-submit"
                  disabled={loading}
                >
                  Sign in <ArrowRight size={17} />
                </button>
              </form>
            )}
            <p className="login-footnote">
              Authorized personnel only. Access may be monitored for security
              and audit purposes.
            </p>
          </section>
        </div>
      </div>
      <LoadingOverlay show={loading} text="Signing in…" />
    </>
  );
}
