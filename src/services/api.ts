import { withEmbedKey } from "../shared/security/embedKey";
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}
export function maximoError(body: any, status: number): string {
  const m =
    body?.maximoResponse?.Error ||
    body?.maximoResponse?.["oslc:Error"] ||
    body?.Error ||
    body?.["oslc:Error"] ||
    {};
  const message =
    body?.message ||
    body?.error?.["oslc:message"] ||
    body?.error ||
    m?.message ||
    m?.["oslc:message"] ||
    `API request failed (${status}).`;
  const reason = body?.reasonCode || m?.reasonCode || m?.["spi:reasonCode"];
  return reason && !String(message).startsWith(reason)
    ? `${reason} - ${message}`
    : String(message);
}
/** Machine-readable error codes returned by the API security layer. */
export type ApiErrorCode =
  | "PASSWORD_CHANGE_REQUIRED"
  | "RATE_LIMITED"
  | "ACCOUNT_LOCKED"
  | "EXTERNAL_AUTH_REQUIRED";

export function apiErrorCode(error: unknown): ApiErrorCode | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? (code as ApiErrorCode) : undefined;
}

const isSameOrigin = (url: string) =>
  url.startsWith("/") && !url.startsWith("//");

/** Sends a forced password change to the sign-in page, keeping the target. */
function redirectToPasswordChange() {
  if (window.location.pathname.startsWith("/login")) return;
  const next = encodeURIComponent(
    window.location.pathname + window.location.search,
  );
  window.location.assign(`/login?changePassword=1&next=${next}`);
}

export async function api<T = any>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  // External View access key (if this tab was opened from an External View).
  const request: RequestInit = isSameOrigin(url)
    ? { ...init, headers: withEmbedKey(init?.headers) }
    : { ...init };
  const response = await fetch(url, request);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(
      response.status === 429
        ? "Too many requests. Please wait a moment and try again."
        : maximoError(body, response.status),
      response.status,
      body,
    );
    if (apiErrorCode(error) === "PASSWORD_CHANGE_REQUIRED")
      redirectToPasswordChange();
    throw error;
  }
  return body as T;
}
export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
