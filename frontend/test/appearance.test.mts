import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkspacePreferences, resolveTheme } from "../lib/appearance.ts";

test("appearance preferences validate server data instead of inventing settings", () => {
  const preferences = {
    theme: "system",
    density: "compact",
    timezone: "Asia/Kolkata",
    weekStart: "monday",
    locale: "en-IN",
    accent: "sage",
    reduceMotion: true,
    updatedAt: "2026-11-01T00:00:00Z",
  };
  assert.deepEqual(parseWorkspacePreferences({ preferences }), preferences);
  for (const invalid of [
    null,
    {},
    { ...preferences, accent: "unknown" },
    { ...preferences, reduceMotion: "false" },
    { ...preferences, theme: "custom" },
  ])
    assert.throws(() => parseWorkspacePreferences({ preferences: invalid }));
});

test("system theme follows the device while explicit choices stay stable", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
