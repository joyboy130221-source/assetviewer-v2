export class ApiError extends Error { constructor(message: string, public status?: number, public body?: unknown) { super(message); } }
export function maximoError(body: any, status: number): string {
  const m = body?.maximoResponse?.Error || body?.maximoResponse?.['oslc:Error'] || body?.Error || body?.['oslc:Error'] || {};
  const message = body?.message || body?.error?.['oslc:message'] || body?.error || m?.message || m?.['oslc:message'] || `API request failed (${status}).`;
  const reason = body?.reasonCode || m?.reasonCode || m?.['spi:reasonCode'];
  return reason && !String(message).startsWith(reason) ? `${reason} - ${message}` : String(message);
}
export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(maximoError(body, response.status), response.status, body);
  return body as T;
}
export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
