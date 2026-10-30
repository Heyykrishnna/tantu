import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { properties, evaluate, valueIssue } from "../src/modules/knowledge/properties.js";
import { textDocument, documentText } from "../src/modules/knowledge/collaboration.js";

test("typed properties reject cycles and unsupported expressions and retain removed-value repair states", () => {
  const a = randomUUID(); const b = randomUUID(); const total = randomUUID();
  const schema = properties([{ id: a, name: "Hours", type: "number" }, { id: b, name: "Rate", type: "number" }, { id: total, name: "Total", type: "formula", formula: { operator: "multiply", left: a, right: b } }]);
  assert.equal(evaluate(schema, { [a]: 4, [b]: 25 }).values[total], 100);
  assert.equal(evaluate(schema, { [a]: "invalid", [b]: 25 }).repairs.length, 2);
  assert.equal(evaluate(schema.slice(1), { [a]: 4 }).repairs[0]?.propertyId, a);
  assert.throws(() => properties([{ id: a, name: "Loop", type: "formula", formula: { operator: "add", left: a, right: a } }]), /cycles/);
  assert.throws(() => properties([{ id: a, name: "Code", type: "formula", formula: { operator: "eval", left: a, right: a } }]), /supported/);
  const date = properties([{ id: a, name: "Date", type: "date" }])[0]; if (!date) throw new Error("Missing fixture property.");
  assert.ok(valueIssue(date, "2026-02-30")); assert.equal(valueIssue(date, "2026-02-28"), null);
  assert.equal(documentText(textDocument("# Heading\nSafe <script> text")), "# Heading\nSafe <script> text"); assert.throws(() => textDocument("x".repeat(4001)), /4,000/);
});
