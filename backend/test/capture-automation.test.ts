import assert from "node:assert/strict";
import test from "node:test";
import { captureFingerprint } from "../src/modules/capture-relationships/service.js";
import { evaluateConditions } from "../src/modules/automation/service.js";

test("capture fingerprint creates deterministic sha256 digest from review payload", () => {
  const payload1 = {
    captureId: "a0000000-0000-0000-0000-000000000001",
    title: "Urgent meeting request",
    visibility: "workspace" as const,
    projectId: null,
    milestoneId: null,
    deadline: "2026-11-05",
    assigneeId: null,
    estimateMinutes: 30,
    selectedExcerpts: "Discuss Q4 delivery milestones",
  };
  const payload2 = { ...payload1 };
  const payload3 = { ...payload1, title: "Different title" };

  const hash1 = captureFingerprint(payload1);
  const hash2 = captureFingerprint(payload2);
  const hash3 = captureFingerprint(payload3);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 64);
});

test("rule condition evaluator matches equals, not_equals, and contains", () => {
  const conditions = [
    { field: "priority", operator: "equals" as const, value: "urgent" },
    { field: "status", operator: "not_equals" as const, value: "done" },
    { field: "title", operator: "contains" as const, value: "deliver" },
  ];

  const matchingContext = { priority: "urgent", status: "open", title: "Deliver design system" };
  const failingContext1 = { priority: "normal", status: "open", title: "Deliver design system" };
  const failingContext2 = { priority: "urgent", status: "done", title: "Deliver design system" };
  const failingContext3 = { priority: "urgent", status: "open", title: "Plan sprint" };

  assert.equal(evaluateConditions(conditions, matchingContext), true);
  assert.equal(evaluateConditions(conditions, failingContext1), false);
  assert.equal(evaluateConditions(conditions, failingContext2), false);
  assert.equal(evaluateConditions(conditions, failingContext3), false);
});
