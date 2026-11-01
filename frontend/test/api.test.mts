import assert from "node:assert/strict";
import { test } from "node:test";
import { api, searchResults } from "../lib/api.ts";

test("search responses validate every record before reaching the interface", () => {
  const item = { recordId: "record", targetType: "task", title: "Release", snippet: "Ready", status: "open", updatedAt: "2026-11-01", relevance: 0.5 };
  assert.deepEqual(searchResults({ results: [item] }), { results: [item] });
  assert.deepEqual(searchResults({ results: [] }), { results: [] });
  for (const invalid of [null, {}, { results: null }, { results: [null] }, { results: [{ ...item, targetType: "unknown" }] }, { results: [{ ...item, title: null }] }, { results: [{ ...item, relevance: NaN }] }])
    assert.throws(() => searchResults(invalid));
});

test("a cancelled response cannot publish state after its body finishes reading", async (context) => {
  const controller = new AbortController();
  let parsed = false;
  context.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => { controller.abort(); return {}; } }));
  await assert.rejects(api("/auth/session", () => { parsed = true; }, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(parsed, false);
});

test("cancelling a streaming response preserves cancellation instead of reporting an outage", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => { controller.abort(); throw controller.signal.reason; } }));
  await assert.rejects(api("/auth/session", () => {}, { signal: controller.signal }), { name: "AbortError" });
});
