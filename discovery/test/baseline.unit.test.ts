import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the derived register maps every original story exactly once", async () => {
  const raw: unknown = JSON.parse(await readFile(new URL("../../docs/l0/requirements.json", import.meta.url), "utf8"));
  assert.ok(typeof raw === "object" && raw !== null && "requirements" in raw && Array.isArray(raw.requirements));
  const identifiers = raw.requirements.map((item: unknown) => {
    assert.ok(typeof item === "object" && item !== null && "id" in item && typeof item.id === "string");
    return item.id;
  });
  assert.equal(identifiers.length, 56);
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (let n = 1; n <= 50; n++) assert.ok(identifiers.includes(`TNT-US-${String(n).padStart(3, "0")}`));
});

test("six synthetic journeys retain steps, access boundaries, and recovery", async () => {
  const raw: unknown = JSON.parse(await readFile(new URL("../prototype/journeys.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(raw));
  assert.equal(raw.length, 6);
  for (const item of raw) {
    assert.ok(typeof item === "object" && item !== null && "steps" in item && Array.isArray(item.steps));
    assert.equal(item.steps.length, 6);
    assert.ok("invariant" in item && typeof item.invariant === "string");
    assert.ok("failure" in item && typeof item.failure === "string");
  }
});
