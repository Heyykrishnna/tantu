import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFormula } from "../src/modules/kits-collaboration/service.js";

test("rich formula evaluation executes math expressions accurately", () => {
  const r1 = evaluateFormula("10 + 25");
  assert.equal(r1.result, 35);
  assert.equal(r1.error, null);
  assert.equal(r1.evaluatedType, "number");

  const r2 = evaluateFormula("100 / 4");
  assert.equal(r2.result, 25);
  assert.equal(r2.error, null);

  const r3 = evaluateFormula("ROUND(45.6789, 2)");
  assert.equal(r3.result, 45.68);
  assert.equal(r3.error, null);

  const r4 = evaluateFormula("10 / 0");
  assert.equal(r4.result, null);
  assert.equal(r4.error, "Division by zero");
});

test("rich formula evaluation handles string and conditional logic safely", () => {
  const r1 = evaluateFormula('CONCAT("Task: ", "Delivery")');
  assert.equal(r1.result, "Task: Delivery");
  assert.equal(r1.error, null);
  assert.equal(r1.evaluatedType, "string");

  const r2 = evaluateFormula('IF("true", "Yes", "No")');
  assert.equal(r2.result, "Yes");
  assert.equal(r2.error, null);

  const r3 = evaluateFormula("DAYS_BETWEEN('2026-11-01', '2026-11-10')");
  assert.equal(r3.result, 9);
  assert.equal(r3.error, null);
});

test("kit manifest conflict checker detects colliding collection schema names", () => {
  const existingNames = new Set(["Sprint Backlog", "Bug Tracker"]);
  const incomingSchemas = [
    { name: "Sprint Backlog", properties: [{ name: "Points", type: "number" }] },
    { name: "Customer Feedback", properties: [{ name: "Email", type: "text" }] },
  ];

  const conflicts = incomingSchemas.filter((s) => existingNames.has(s.name));
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.name, "Sprint Backlog");
});
