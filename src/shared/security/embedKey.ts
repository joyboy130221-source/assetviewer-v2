/**
 * External View access key handling.
 *
 * BIC/BECS links carry the key as `?evk=...`. On load the key is moved from
 * the address bar into sessionStorage (scoped to this browser tab) so it does
 * not stay visible in the URL, history or Referer headers, and is then sent
 * to the API as the `X-Embed-Key` header.
 */
const STORAGE_KEY = "integrationHub.embedKey";
const QUERY_PARAM = "evk";
export const EMBED_KEY_HEADER = "X-Embed-Key";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked (e.g. third-party iframe restrictions)
  }
}

let memoryKey: string | null = null;

/** Reads `evk` from the current URL, stores it and removes it from the URL. */
export function captureEmbedKeyFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const key = url.searchParams.get(QUERY_PARAM);
  if (!key) return;
  memoryKey = key;
  storage()?.setItem(STORAGE_KEY, key);
  url.searchParams.delete(QUERY_PARAM);
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash,
  );
}

export function getEmbedKey(): string | null {
  return memoryKey ?? storage()?.getItem(STORAGE_KEY) ?? null;
}

/** Adds the access key header (if any) to request headers. */
export function withEmbedKey(headers: HeadersInit | undefined): Headers {
  const result = new Headers(headers);
  const key = getEmbedKey();
  if (key && !result.has(EMBED_KEY_HEADER)) result.set(EMBED_KEY_HEADER, key);
  return result;
}
