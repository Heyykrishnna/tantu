import assert from "node:assert/strict";
import { test } from "node:test";
import { civilInstant, expandCivilRecurrence } from "../src/modules/scheduling/time.js";

test("civil scheduling preserves local intent and rejects DST ambiguity", () => {
  assert.equal(civilInstant("2026-10-30T09:00", "Asia/Kolkata"), "2026-10-30T03:30:00.000Z");
  assert.throws(() => civilInstant("2026-03-08T02:30", "America/New_York"), /unambiguous/);
  assert.throws(() => civilInstant("2026-11-01T01:30", "America/New_York"), /unambiguous/);
  assert.throws(() => civilInstant("2026-01-01T10:00", "Invalid/Zone"));
  assert.deepEqual(expandCivilRecurrence("DTSTART:20261030T090000\nRRULE:FREQ=DAILY;COUNT=4", "America/New_York"), ["2026-10-30T13:00:00.000Z", "2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  assert.throws(() => expandCivilRecurrence("DTSTART:20261030T090000\nRRULE:FREQ=DAILY", "UTC"));
  assert.throws(() => expandCivilRecurrence("DTSTART:20261030T090000\nRRULE:FREQ=SECONDLY;COUNT=1000", "UTC"));
});
