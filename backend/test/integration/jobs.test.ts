import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Queue, eventQueue } from "../../src/workers/queue.js";
import { fixture } from "./support.js";
import { publishEvents } from "../../src/workers/events.js";

test("outbox rollback, retry fencing, cancellation and live permission checks", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const queue = new Queue(f.database);
  try {
    await queue.start();
    const a = await f.account("worker@example.test");
    const url = `/api/v1/workspaces/${a.workspaceId}/tasks`;
    await f.owner.query("CREATE FUNCTION tantu.fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER injected_failure BEFORE INSERT ON tantu.events FOR EACH ROW EXECUTE FUNCTION tantu.fail_outbox()");
    const failed = await f.app.inject({ method: "POST", url, headers: a.headers, payload: { title: "Must roll back", operationId: randomUUID() } });
    assert.equal(failed.statusCode, 500);
    assert.equal((await f.owner.query("SELECT * FROM tantu.records")).rowCount, 0);
    assert.equal((await f.owner.query("SELECT * FROM tantu.operations")).rowCount, 0);
    assert.equal((await queue.boss.findJobs(eventQueue)).length, 0);
    await f.owner.query("DROP TRIGGER injected_failure ON tantu.events; DROP FUNCTION tantu.fail_outbox()");
    const created = await f.app.inject({ method: "POST", url, headers: a.headers, payload: { title: "Durable job", operationId: randomUUID() } });
    assert.equal(created.statusCode, 201);
    await queue.runOne(eventQueue, async () => { throw new Error("synthetic failure"); });
    const [retry] = await queue.boss.findJobs(eventQueue);
    assert.ok(retry);
    assert.equal(retry.state, "retry");
    await f.owner.query("UPDATE tantu_jobs.job SET start_after=now() WHERE id=$1", [retry.id]);
    await queue.runOne(eventQueue, publishEvents());
    assert.equal((await queue.boss.findJobs(eventQueue))[0]?.state, "completed");
    const fence = await f.owner.query<{ attempt: number; completed: boolean }>("SELECT attempt,completed FROM tantu.job_claims WHERE id=$1", [retry.id]);
    assert.equal(fence.rows[0]?.attempt, 1);
    assert.equal(fence.rows[0]?.completed, true);
    assert.equal((await f.owner.query("UPDATE tantu.job_claims SET token=$2 WHERE id=$1 AND attempt<0 RETURNING id", [retry.id, randomUUID()])).rowCount, 0);
    await f.app.inject({ method: "POST", url, headers: a.headers, payload: { title: "Revoked queued operation", operationId: randomUUID() } });
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [a.workspaceId, a.userId]);
    await queue.runOne(eventQueue, publishEvents());
    assert.equal((await f.owner.query("SELECT * FROM tantu.events WHERE delivery_state='discarded'")).rowCount, 1);
    const jobId = await queue.boss.send(eventQueue, { workspaceId: a.workspaceId, userId: a.userId, recordId: created.json<{ id: string }>().id });
    assert.ok(jobId);
    await queue.boss.cancel(eventQueue, jobId);
    assert.deepEqual(await queue.boss.fetch(eventQueue), []);
  } finally { await queue.stop(); await f.close(); }
});
