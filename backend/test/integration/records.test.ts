import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Queue, eventQueue } from "../../src/workers/queue.js";
import { publishEvents } from "../../src/workers/events.js";
import { fixture } from "./support.js";
import type { CanonicalRecord } from "../../src/modules/work-management/contracts.js";

test("canonical records: persistence, replay, version conflicts, RLS, inheritance and durable jobs", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const queue = new Queue(f.database);
  try {
    await queue.start();
    const a = await f.account("a@example.test");
    const b = await f.account("b@example.test");
    const base = `/api/v1/workspaces/${a.workspaceId}`;
    const operationId = randomUUID();
    const payload = { title: "Canonical task", operationId, priority: "high", deadline: "2026-11-20" };
    const [first, duplicate] = await Promise.all([f.app.inject({ method: "POST", url: base + "/tasks", headers: a.headers, payload }), f.app.inject({ method: "POST", url: base + "/tasks", headers: a.headers, payload })]);
    assert.equal(first.statusCode, 201, first.body);
    assert.deepEqual(first.json(), duplicate.json());
    const task = first.json<CanonicalRecord>();
    assert.equal(task.version, 1);
    assert.equal((await f.owner.query("SELECT * FROM tantu.events")).rowCount, 1);
    assert.equal((await queue.boss.findJobs(eventQueue)).length, 1);
    assert.equal((await f.app.inject({ method: "POST", url: base + "/tasks", headers: a.headers, payload: { ...payload, title: "conflicting key" } })).statusCode, 409);
    const get = await f.app.inject({ url: base + "/tasks/" + task.id, headers: a.headers });
    assert.equal(get.json<CanonicalRecord>().id, task.id);
    const changes = { title: "Updated task", operationId: randomUUID(), expectedVersion: 1, status: "done" };
    const [updated, conflict] = await Promise.all([f.app.inject({ method: "PATCH", url: base + "/tasks/" + task.id, headers: a.headers, payload: changes }), f.app.inject({ method: "PATCH", url: base + "/tasks/" + task.id, headers: a.headers, payload: { ...changes, operationId: randomUUID() } })]);
    assert.deepEqual([updated.statusCode, conflict.statusCode].sort(), [200, 409]);
    await f.owner.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'admin')", [a.workspaceId, b.userId]);
    assert.equal((await f.app.inject({ url: base + "/tasks/" + task.id, headers: b.headers })).statusCode, 404);
    const foreign = `/api/v1/workspaces/${b.workspaceId}/tasks/${task.id}`;
    assert.equal((await f.app.inject({ url: foreign, headers: b.headers })).statusCode, 404);
    const page = await f.app.inject({ method: "POST", url: base + "/pages", headers: a.headers, payload: { title: "Private parent", operationId: randomUUID() } });
    assert.equal(page.statusCode, 201, page.body);
    const parent = page.json<CanonicalRecord>();
    const child = await f.app.inject({ method: "POST", url: base + "/pages", headers: a.headers, payload: { title: "Nested child", parentId: parent.id, visibility: "workspace", operationId: randomUUID() } });
    assert.equal(child.statusCode, 201, child.body);
    assert.equal((await f.app.inject({ url: base + "/pages/" + child.json<CanonicalRecord>().id, headers: b.headers })).statusCode, 404);
    await f.owner.query("UPDATE tantu.memberships SET role='guest' WHERE workspace_id=$1 AND user_id=$2", [a.workspaceId, b.userId]);
    await f.owner.query("INSERT INTO tantu.grants VALUES($1,$2,$3,'read')", [a.workspaceId, parent.id, b.userId]);
    assert.equal((await f.app.inject({ url: base + "/pages/" + child.json<CanonicalRecord>().id, headers: b.headers })).statusCode, 200);
    assert.equal((await f.app.inject({ method: "PATCH", url: base + "/pages/" + parent.id, headers: b.headers, payload: { title: "guest attack", expectedVersion: 1, operationId: randomUUID() } })).statusCode, 404);
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [a.workspaceId, b.userId]);
    assert.equal((await f.app.inject({ url: base + "/pages/" + parent.id, headers: b.headers })).statusCode, 404);
    const invalid = await f.app.inject({ method: "POST", url: base + "/pages", headers: a.headers, payload: { title: "HTML injection", operationId: randomUUID(), body: { type: "doc", content: [{ type: "script", content: [] }] } } });
    assert.equal(invalid.statusCode, 400);
    assert.equal((await f.app.inject({ url: base + "/tasks?limit=500", headers: a.headers })).statusCode, 400);
    for (let index = 0; index < 10; index++) { if (!await queue.runOne(eventQueue, publishEvents())) break; }
    assert.equal((await f.owner.query("SELECT * FROM tantu.events WHERE published_at IS NULL")).rowCount, 0);
    const removed = await f.app.inject({ method: "DELETE", url: base + "/pages/" + parent.id, headers: a.headers, payload: { operationId: randomUUID(), expectedVersion: 1 } });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal((await f.app.inject({ url: base + "/pages/" + child.json<CanonicalRecord>().id, headers: a.headers })).statusCode, 404);
    await f.database.transaction({ userId: a.userId, workspaceId: a.workspaceId }, async (client) => { assert.equal((await client.query("SELECT * FROM tantu.records WHERE workspace_id=$1", [b.workspaceId])).rowCount, 0); });
  } finally { await queue.stop(); await f.close(); }
});
