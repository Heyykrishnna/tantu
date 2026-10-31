import assert from "node:assert/strict";
import { test } from "node:test";
import { apiPath } from "../lib/paths.ts";
import { resolveView, workspaceViews } from "../lib/navigation.ts";

test("API paths receive exactly one version prefix and retain queries", () => {
  for (const route of ["/workspaces/example/capture?status=inbox", "/workspaces/example/rules", "/auth/session"]) {
    assert.equal(apiPath(route), `/api/v1${route}`);
    assert.equal(apiPath(route.slice(1)), `/api/v1${route}`);
    assert.equal(apiPath(`/api/v1${route}`), `/api/v1${route}`);
  }
  assert.equal(apiPath("/api/v1"), "/api/v1");
  assert.equal(apiPath("/api/v1?limit=25"), "/api/v1?limit=25");
  assert.equal(apiPath("/api/v10/records"), "/api/v1/api/v10/records");
});

test("API paths cannot replace the application origin", () => {
  for (const path of ["", "https://example.test/workspaces", "//example.test/workspaces", "/\\example.test/workspaces", "javascript:alert(1)"]) {
    assert.throws(() => apiPath(path), /relative to the application/);
  }
});

test("every workspace page resolves through the shared route registry", () => {
  assert.equal(new Set(workspaceViews).size, 20);
  for (const view of workspaceViews) assert.equal(resolveView(view), view);
  for (const value of [null, undefined, "", "unknown", "Tasks", "api", "tasks/invalid"]) assert.equal(resolveView(value), null);
});
