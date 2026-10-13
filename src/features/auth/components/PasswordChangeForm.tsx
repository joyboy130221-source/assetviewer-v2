import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import {
  authApi,
  passwordProblems,
  type PasswordPolicy,
} from "../services/authApi";

const FALLBACK_POLICY: PasswordPolicy = {
  minLength: 12,
  minCharacterClasses: 3,
};

/**
 * Forced / voluntary password change. The server enforces the policy; this
 * form mirrors it for immediate feedback.
 */
export function PasswordChangeForm({
  onChanged,
  onError,
}: {
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [policy, setPolicy] = useState<PasswordPolicy>(FALLBACK_POLICY);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    authApi
      .passwordPolicy()
      .then(setPolicy)
      .catch(() => setPolicy(FALLBACK_POLICY));
  }, []);

  const problems = useMemo(
    () => passwordProblems(next, policy),
    [next, policy],
  );
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (problems.length || mismatch || !confirm) return;
    setBusy(true);
    setMessage("");
    try {
      await authApi.changePassword(current, next);
      onChanged();
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Unable to change password.";
      setMessage(text);
      onError(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="password-change-form">
      <div className="form-field">
        <label htmlFor="currentPassword">Current password</label>
        <div className="input-with-icon">
          <KeyRound size={18} />
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoFocus
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="newPassword">New password</label>
        <div className="input-with-icon">
          <KeyRound size={18} />
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        {next.length > 0 && problems.length > 0 && (
          <ul className="password-rules" aria-live="polite">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="confirmPassword">Confirm new password</label>
        <div className="input-with-icon">
          <KeyRound size={18} />
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || undefined}
            required
          />
        </div>
        {mismatch && (
          <small className="form-message error-message">
            Passwords do not match.
          </small>
        )}
      </div>
      {message && (
        <p className="form-message error-message" role="alert">
          {message}
        </p>
      )}
      <button
        className="primary-button login-submit"
        disabled={busy || problems.length > 0 || mismatch || !confirm}
      >
        Change password <ArrowRight size={17} />
      </button>
    </form>
  );
}
