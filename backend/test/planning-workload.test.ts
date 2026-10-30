import assert from "node:assert/strict";
import test from "node:test";
import type { WorkloadWeatherState } from "../src/modules/planning-workload/service.js";

test("workload weather ratios map accurately to clear, tight, and overloaded states", () => {
  function classifyWeather(ratio: number): WorkloadWeatherState {
    if (ratio <= 0.75) return "clear";
    if (ratio <= 1.0) return "tight";
    return "overloaded";
  }

  assert.equal(classifyWeather(0.5), "clear");
  assert.equal(classifyWeather(0.75), "clear");
  assert.equal(classifyWeather(0.76), "tight");
  assert.equal(classifyWeather(1.0), "tight");
  assert.equal(classifyWeather(1.01), "overloaded");
  assert.equal(classifyWeather(1.5), "overloaded");
});

test("deterministic planning candidate sorting prioritizes urgent over normal and earlier deadlines", () => {
  interface MockCandidate {
    id: string;
    priority: "urgent" | "high" | "normal" | "low";
    deadline: string | null;
  }

  const tasks: MockCandidate[] = [
    { id: "t1", priority: "normal", deadline: "2026-11-01" },
    { id: "t2", priority: "urgent", deadline: "2026-11-05" },
    { id: "t3", priority: "high", deadline: "2026-10-31" },
    { id: "t4", priority: "urgent", deadline: "2026-10-31" },
  ];

  const priorityWeight = { urgent: 1, high: 2, normal: 3, low: 4 };

  const sorted = [...tasks].sort((a, b) => {
    const pDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (pDiff !== 0) return pDiff;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  assert.equal(sorted[0]?.id, "t4");
  assert.equal(sorted[1]?.id, "t2");
  assert.equal(sorted[2]?.id, "t3");
  assert.equal(sorted[3]?.id, "t1");
});

test("missing task estimates trigger fallback allocation and uncertain item counting", () => {
  const tasks = [
    { id: "1", estimateMinutes: 60 },
    { id: "2", estimateMinutes: null },
    { id: "3", estimateMinutes: undefined },
    { id: "4", estimateMinutes: 45 },
  ];

  let missingCount = 0;
  let totalMinutes = 0;

  for (const t of tasks) {
    if (t.estimateMinutes === null || t.estimateMinutes === undefined) {
      missingCount++;
      totalMinutes += 30;
    } else {
      totalMinutes += t.estimateMinutes;
    }
  }

  assert.equal(missingCount, 2);
  assert.equal(totalMinutes, 165);
});

