import { useEffect, useState } from "react";
import type { AnalyticsTheme } from "../model/analytics.types";

export type ResolvedTheme = "light" | "dark";

/**
 * URL overrides let a host application match its own theme when embedding:
 * `?darkTheme=true|false` (the BECS convention) or `?theme=dark|light`.
 */
export function themeOverride(search: URLSearchParams): ResolvedTheme | null {
  const dark = search.get("darkTheme")?.toLowerCase();
  if (dark === "true" || dark === "1") return "dark";
  if (dark === "false" || dark === "0") return "light";
  const theme = search.get("theme")?.toLowerCase();
  return theme === "dark" || theme === "light" ? theme : null;
}

const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function useResolvedTheme(
  configured: AnalyticsTheme | undefined,
  override: ResolvedTheme | null = null,
): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  if (override) return override;
  if (configured === "dark" || configured === "light") return configured;
  return systemDark ? "dark" : "light";
}
