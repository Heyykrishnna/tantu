import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";

test("reviewed scheduling preserves deadlines and rejects stale reviews, locks, and revoked permissions", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const user = await f.account("schedule@example.test");
    const base = `/api/v1/workspaces/${user.workspaceId}`;
    const created = await f.app.inject({ method: "POST", url: base + "/tasks", headers: user.headers, payload: { operationId: randomUUID(), title: "Schedule me", deadline: "2026-12-31" } });
    const task = created.json<{ id: string; version: number }>();
    const input = { taskId: task.id, taskVersion: 1, start: "2026-10-30T09:00", end: "2026-10-30T10:00", timezone: "Asia/Kolkata" };
    const review = () => f.app.inject({ method: "POST", url: base + "/schedule/review", headers: user.headers, payload: input });
    const first = await review(); const second = await review(); assert.equal(first.statusCode, 200, first.body);
    const operationId = randomUUID();
    const apply = (reviewId: string, key = randomUUID()) => f.app.inject({ method: "POST", url: base + "/schedule/apply", headers: user.headers, payload: { reviewId, operationId: key } });
    const saved = await apply(first.json<{ id: string }>().id, operationId); assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual((await apply(first.json<{ id: string }>().id, operationId)).json(), saved.json());
    assert.equal((await apply(second.json<{ id: string }>().id)).statusCode, 409);
    const conflict = await review(); assert.equal(conflict.json<{ conflicts: unknown[] }>().conflicts.length, 1);
    const current = await f.app.inject({ url: base + "/tasks/" + task.id, headers: user.headers });
    assert.equal(current.json<{ deadline: string; version: number }>().deadline, "2026-12-31"); assert.equal(current.json<{ version: number }>().version, 1);
    const bad = await f.app.inject({ method: "POST", url: base + "/schedule/review", headers: user.headers, payload: { ...input, start: "2026-03-08T02:30", end: "2026-03-08T03:30", timezone: "America/New_York" } }); assert.equal(bad.statusCode, 400);
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [user.workspaceId, user.userId]);
    assert.equal((await apply(conflict.json<{ id: string }>().id)).statusCode, 404);
  } finally { await f.close(); }
});

test("recurrence materialization deduplicates across operation keys and preserves skipped occurrences", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const user = await f.account("recurrence@example.test"); const base = `/api/v1/workspaces/${user.workspaceId}`;
    const source = await f.app.inject({ method: "POST", url: base + "/tasks", headers: user.headers, payload: { operationId: randomUUID(), title: "Recurring source" } });
    const id = source.json<{ id: string }>().id; const path = base + `/tasks/${id}/recurrence`;
    const response = await f.app.inject({ method: "POST", url: path, headers: user.headers, payload: { operationId: randomUUID(), rule: "DTSTART:20261030T090000\nRRULE:FREQ=DAILY;COUNT=2", timezone: "Asia/Kolkata" } }); assert.equal(response.statusCode, 200, response.body);
    const materialize = () => f.app.inject({ method: "POST", url: path + "/occurrences", headers: user.headers, payload: { operationId: randomUUID(), instant: "2026-10-30T03:30:00.000Z", action: "materialize" } });
    const [a, b] = await Promise.all([materialize(), materialize()]); assert.equal(a.statusCode, 200, a.body); assert.equal(b.statusCode, 200, b.body); assert.deepEqual(a.json(), b.json());
    assert.equal((await f.owner.query("SELECT * FROM tantu.records WHERE kind='task'")).rowCount, 2);
    const skipped = await f.app.inject({ method: "POST", url: path + "/occurrences", headers: user.headers, payload: { operationId: randomUUID(), instant: "2026-10-31T03:30:00.000Z", action: "skip" } }); assert.equal(skipped.statusCode, 200, skipped.body);
    const listing = await f.app.inject({ url: path, headers: user.headers }); assert.equal(listing.json<{ items: unknown[] }>().items.length, 2);
  } finally { await f.close(); }
});
