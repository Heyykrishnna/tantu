import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";

test("projects preserve task permissions, reject stale versions and concurrent dependency cycles", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const user = await f.account("projects@example.test");
    const other = await f.account("other@example.test");
    await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'member',true)", [user.workspaceId, other.userId]);
    const base = `/api/v1/workspaces/${user.workspaceId}`;
    async function task(title: string) {
      const response = await f.app.inject({ method: "POST", url: base + "/tasks", headers: user.headers, payload: { operationId: randomUUID(), title } });
      assert.equal(response.statusCode, 201, response.body); return response.json<{ id: string }>().id;
    }
    const [a, b, c] = await Promise.all([task("A"), task("B"), task("C")]);
    const operationId = randomUUID();
    const payload = { operationId, title: "Connected work", visibility: "workspace", state: "active", deadline: null };
    const created = await f.app.inject({ method: "POST", url: base + "/projects", headers: user.headers, payload });
    assert.equal(created.statusCode, 200, created.body);
    const project = created.json<{ id: string; version: number }>();
    const replay = await f.app.inject({ method: "POST", url: base + "/projects", headers: user.headers, payload });
    assert.deepEqual(replay.json(), project);
    const mismatch = await f.app.inject({ method: "POST", url: base + "/projects", headers: user.headers, payload: { ...payload, title: "Different" } });
    assert.equal(mismatch.statusCode, 409);
    const linked = await f.app.inject({ method: "POST", url: base + `/projects/${project.id}/tasks`, headers: user.headers, payload: { operationId: randomUUID(), taskId: a, linked: true, expectedVersion: 1 } });
    assert.equal(linked.statusCode, 200, linked.body);
    const stale = await f.app.inject({ method: "PATCH", url: base + `/projects/${project.id}`, headers: user.headers, payload: { ...payload, operationId: randomUUID(), expectedVersion: 1 } });
    assert.equal(stale.statusCode, 409);
    const visible = await f.app.inject({ url: base + `/projects/${project.id}`, headers: other.headers });
    assert.equal(visible.statusCode, 200, visible.body);
    assert.equal(visible.json<{ rollup: { total: number } }>().rollup.total, 0);
    assert.equal((await f.app.inject({ url: base + `/tasks/${a}`, headers: other.headers })).statusCode, 404);
    const edge = (from: string, to: string) => f.app.inject({ method: "POST", url: base + "/dependencies", headers: user.headers, payload: { operationId: randomUUID(), prerequisiteId: from, dependentId: to, linked: true } });
    assert.equal((await edge(a, b)).statusCode, 200);
    const results = await Promise.all([edge(b, c), edge(c, a)]);
    assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 409]);
    assert.equal((await edge(a, a)).statusCode, 409);
    const denied = await f.app.inject({ method: "POST", url: base + "/dependencies", headers: other.headers, payload: { operationId: randomUUID(), prerequisiteId: a, dependentId: b, linked: true } });
    assert.equal(denied.statusCode, 404);
  } finally { await f.close(); }
});
