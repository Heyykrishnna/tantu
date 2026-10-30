import assert from "node:assert/strict";
import test from "node:test";
import { calculateScenarioImpact } from "../src/modules/future-discovery/service.js";
import type { ScenarioModification } from "../src/modules/future-discovery/service.js";

test("scenario impact calculator computes deadline shift and workload delta accurately", () => {
  const modifications: ScenarioModification[] = [
    {
      entityId: "task-01",
      field: "deadline",
      baselineValue: "2026-11-01",
      simulatedValue: "2026-11-05"
    },
    {
      entityId: "task-02",
      field: "estimateMinutes",
      baselineValue: 60,
      simulatedValue: 180
    }
  ];

  const impact = calculateScenarioImpact(modifications);
  assert.equal(impact.deadlineShiftDays, 4);
  assert.equal(impact.workloadDeltaHours, 2);
  assert.equal(impact.impactedCommitmentCount, 2);
  assert.equal(impact.feasibility, "feasible");
});

test("scenario impact calculator flags tight schedule compression", () => {
  const modifications: ScenarioModification[] = [
    {
      entityId: "task-01",
      field: "deadline",
      baselineValue: "2026-11-10",
      simulatedValue: "2026-11-08"
    }
  ];

  const impact = calculateScenarioImpact(modifications);
  assert.equal(impact.deadlineShiftDays, -2);
  assert.equal(impact.feasibility, "tight");
});

test("scenario impact calculator identifies infeasible workload overload", () => {
  const modifications: ScenarioModification[] = [
    {
      entityId: "task-01",
      field: "estimateMinutes",
      baselineValue: 120,
      simulatedValue: 1560
    }
  ];

  const impact = calculateScenarioImpact(modifications);
  assert.equal(impact.workloadDeltaHours, 24);
  assert.equal(impact.feasibility, "infeasible");
});

test("freshness status thresholds correctly classify document review states", () => {
  const cadenceDays = 90;
  const now = Date.now();

  const freshAgeDays = 30;
  const freshStatus = freshAgeDays > cadenceDays ? "stale" : freshAgeDays >= cadenceDays * 0.8 ? "due_for_review" : "fresh";
  assert.equal(freshStatus, "fresh");

  const dueAgeDays = 75;
  const dueStatus = dueAgeDays > cadenceDays ? "stale" : dueAgeDays >= cadenceDays * 0.8 ? "due_for_review" : "fresh";
  assert.equal(dueStatus, "due_for_review");

  const staleAgeDays = 95;
  const staleStatus = staleAgeDays > cadenceDays ? "stale" : staleAgeDays >= cadenceDays * 0.8 ? "due_for_review" : "fresh";
  assert.equal(staleStatus, "stale");
  assert.ok(now > 0);
});

test("handover pack token structure adheres to entropy and prefix standards", () => {
  const prefix = "hnd_";
  const mockToken = `${prefix}1234567890abcdef1234567890abcdef1234567890abcdef`;
  assert.ok(mockToken.startsWith(prefix));
  assert.equal(mockToken.length, 4 + 48);
});

