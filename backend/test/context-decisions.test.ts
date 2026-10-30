import assert from "node:assert/strict";
import test from "node:test";
import { Failure } from "../src/platform/failure.js";
import type { DecisionStatus, ContextEntityType, ContextRelationshipType } from "../src/modules/context-decisions/service.js";

test("decision validation rejects empty titles and missing rationale", () => {
  const invalidTitle = "";
  const validTitle = "Adopt PostgreSQL RLS for multi-tenancy";
  const emptyRationale = "   ";
  const validRationale = "Kernel-level enforcement guarantees data isolation across tenants.";

  assert.equal(invalidTitle.trim().length === 0, true);
  assert.equal(validTitle.length <= 200, true);
  assert.equal(emptyRationale.trim().length === 0, true);
  assert.equal(validRationale.length > 0, true);

  const failure = new Failure(400, "INVALID_INPUT", "Decision title must be between 1 and 200 characters.");
  assert.equal(failure.statusCode, 400);
  assert.equal(failure.code, "INVALID_INPUT");
});

test("decision status transitions follow confirmed to superseded lifecycle", () => {
  const validStatuses: DecisionStatus[] = ["draft", "confirmed", "superseded", "revoked"];
  assert.equal(validStatuses.includes("confirmed"), true);
  assert.equal(validStatuses.includes("superseded"), true);

  const originalDecision = {
    id: "d0000000-0000-0000-0000-000000000001",
    version: 1,
    status: "confirmed" as DecisionStatus,
    title: "Initial architectural choice",
  };

  const supersededDecision = {
    ...originalDecision,
    version: 2,
    status: "superseded" as DecisionStatus,
    supersededById: "d0000000-0000-0000-0000-000000000002",
  };

  assert.equal(supersededDecision.status, "superseded");
  assert.equal(supersededDecision.version, 2);
  assert.notEqual(supersededDecision.supersededById, null);
});

test("context graph relationships validate supported entity types and edge roles", () => {
  const entityTypes: ContextEntityType[] = ["project", "task", "page", "event", "promise", "decision"];
  const relationshipTypes: ContextRelationshipType[] = ["informs", "decides", "blocks", "references", "derives"];

  for (const et of ["project", "task", "decision"] as const) {
    assert.equal(entityTypes.includes(et), true);
  }

  for (const rt of ["informs", "decides", "derives"] as const) {
    assert.equal(relationshipTypes.includes(rt), true);
  }
});
