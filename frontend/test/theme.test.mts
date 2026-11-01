import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTheme } from "../lib/theme.ts";

test("theme changes synchronize the data attribute, dark variant and native controls", () => {
  const classes = new Set(["dark"]);
  const root = { dataset: { theme: "dark" }, style: { colorScheme: "dark" }, classList: { toggle: (token: string, force: boolean) => force ? classes.add(token) : classes.delete(token) } };
  applyTheme("light", root);
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.style.colorScheme, "light");
  assert.equal(classes.has("dark"), false);
  applyTheme("dark", root);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.colorScheme, "dark");
  assert.equal(classes.has("dark"), true);
});
