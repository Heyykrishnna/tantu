import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import * as Y from "yjs";
import recurrence from "rrule";
import { expandCivilRecurrence } from "../src/civil-recurrence.js";

test("concurrent page-body edits converge and replay is idempotent", () => {
  const first = new Y.Doc();
  const second = new Y.Doc();
  try {
    first.getText("body").insert(0, "Initial ");
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    first.getText("body").insert(8, "from first ");
    second.getText("body").insert(8, "from second ");
    const firstUpdate = Y.encodeStateAsUpdate(first);
    const secondUpdate = Y.encodeStateAsUpdate(second);
    Y.applyUpdate(first, secondUpdate);
    Y.applyUpdate(second, firstUpdate);
    assert.equal(first.getText("body").toString(), second.getText("body").toString());
    assert.ok(first.getText("body").toString().includes("from first"));
    assert.ok(first.getText("body").toString().includes("from second"));
    const merged = first.getText("body").toString();
    Y.applyUpdate(first, secondUpdate);
    assert.equal(first.getText("body").toString(), merged);
  } finally {
    first.destroy();
    second.destroy();
  }
});

test("snapshot and state-vector reconnect preserve accepted document edits", () => {
  const live = new Y.Doc();
  const restored = new Y.Doc();
  try {
    live.getText("body").insert(0, "Persisted");
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(live));
    const checkpoint = Y.encodeStateVector(restored);
    live.getText("body").insert(9, " and later edit");
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(live, checkpoint));
    assert.equal(restored.getText("body").toString(), "Persisted and later edit");
  } finally {
    live.destroy();
    restored.destroy();
  }
});

test("daily recurrence preserves New York local intent across spring DST", () => {
  const rule = "DTSTART:20260307T090000Z\nRRULE:FREQ=DAILY;COUNT=3";
  assert.deepEqual(expandCivilRecurrence(rule, "America/New_York"), [
    "2026-03-07T14:00:00.000Z", "2026-03-08T13:00:00.000Z", "2026-03-09T13:00:00.000Z",
  ]);
});

test("civil recurrence produces the same instants in different host timezones", () => {
  const expression = 'import { expandCivilRecurrence } from "./src/civil-recurrence.ts"; process.stdout.write(JSON.stringify(expandCivilRecurrence("DTSTART:20260307T090000Z\\nRRULE:FREQ=DAILY;COUNT=3", "America/New_York")));';
  const outputs = ["UTC", "Asia/Kolkata", "America/Los_Angeles"].map((timezone) =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", expression], {
      cwd: new URL("..", import.meta.url), env: { ...process.env, TZ: timezone }, encoding: "utf8",
    }),
  );
  assert.equal(new Set(outputs).size, 1);
});

test("invalid, unbounded, nonexistent, and ambiguous civil schedules require a decision", () => {
  assert.throws(() => expandCivilRecurrence("DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY", "UTC"));
  assert.throws(() => expandCivilRecurrence("DTSTART;TZID=UTC:20260101T090000\nRRULE:FREQ=DAILY;COUNT=1", "UTC"));
  assert.throws(() => expandCivilRecurrence("DTSTART:20260308T023000Z\nRRULE:FREQ=DAILY;COUNT=1", "America/New_York"));
  assert.throws(() => expandCivilRecurrence("DTSTART:20261101T013000Z\nRRULE:FREQ=DAILY;COUNT=1", "America/New_York"));
});

test("monthly recurrence skips invalid month dates and honors explicit exceptions", () => {
  const monthly = recurrence.rrulestr("DTSTART:20260131T090000Z\nRRULE:FREQ=MONTHLY;COUNT=3");
  assert.deepEqual(monthly.all().map((date) => date.toISOString().slice(0, 10)), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  const exceptions = recurrence.rrulestr("DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260102T090000Z");
  assert.deepEqual(exceptions.all().map((date) => date.toISOString().slice(0, 10)), ["2026-01-01", "2026-01-03"]);
});
