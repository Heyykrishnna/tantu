import assert from "node:assert/strict";
import { test } from "node:test";
import { cn } from "../lib/utils.ts";

test("component class overrides replace conflicting Tailwind utilities", () => {
  assert.equal(cn("px-2 py-1", "px-4"), "py-1 px-4");
  assert.equal(cn("rounded-md", "rounded-xl"), "rounded-xl");
  assert.equal(cn("bg-white dark:bg-zinc-900", "bg-zinc-100"), "dark:bg-zinc-900 bg-zinc-100");
});

test("component classes retain conditional values and distinct responsive states", () => {
  assert.equal(cn(false, null, undefined, ["flex", { hidden: false, "items-center": true }]), "flex items-center");
  assert.equal(cn("w-full sm:w-32", "sm:w-48"), "w-full sm:w-48");
});
