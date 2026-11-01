import { choice, record, string } from "./api.ts";
import { applyTheme } from "./theme.ts";

export interface WorkspacePreferences {
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  timezone: string;
  weekStart: "sunday" | "monday";
  locale: string;
  accent: "neutral" | "indigo" | "sage";
  reduceMotion: boolean;
  updatedAt: string;
}

export function parseWorkspacePreferences(
  value: unknown,
): WorkspacePreferences {
  const data = record(record(value).preferences);
  if (typeof data.reduceMotion !== "boolean")
    throw new Error("Invalid motion preference.");
  return {
    theme: choice(data.theme, ["system", "light", "dark"]),
    density: choice(data.density, ["comfortable", "compact"]),
    timezone: string(data.timezone),
    weekStart: choice(data.weekStart, ["sunday", "monday"]),
    locale: string(data.locale),
    accent: choice(data.accent, ["neutral", "indigo", "sage"]),
    reduceMotion: data.reduceMotion,
    updatedAt: string(data.updatedAt),
  };
}

export function resolveTheme(
  value: string | null,
  systemDark?: boolean,
): "light" | "dark" {
  if (value === "light" || value === "dark") return value;
  return (systemDark ??
    window.matchMedia("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light";
}

export function applyWorkspacePreferences(
  preferences: WorkspacePreferences,
): void {
  const root = document.documentElement;
  applyTheme(resolveTheme(preferences.theme));
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
}
