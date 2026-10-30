import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { PgBoss } from "pg-boss";
import * as Y from "yjs";
import { startPostgresFixture } from "../src/postgres-fixture.js";
import { claimAttempt, completeAttempt } from "../src/fenced-completion.js";

test("isolated PostgreSQL authorization, outbox, jobs, recovery, and search qualification", { timeout: 120_000 }, async (context) => {
  const fixture = await startPostgresFixture();
  let client = await fixture.connect();
  const observations: Record<string, unknown> = { database: fixture.version, platform: process.platform, architecture: process.arch, syntheticRecords: 100_000 };
  const errors: string[] = [];
  let boss = new PgBoss({ ...fixture.configuration, schema: "l0_jobs", supervise: false, schedule: false });
  boss.on("error", (error: Error) => errors.push(error.name));
  await boss.start();
  context.after(async () => {
    try { await boss.stop(); }
    finally {
      try { await client.end(); }
      finally { await fixture.stop(); }
    }
  });
  await client.query(await readFile(new URL("../sql/qualification.sql", import.meta.url), "utf8"));
  await client.query("INSERT INTO l0.memberships VALUES ('alpha','owner-a','owner',true),('alpha','member-a','member',true),('alpha','admin-a','admin',true),('alpha','guest-a','guest',true),('beta','member-b','member',true)");
  await client.query("INSERT INTO l0.records(id,tenant,owner,visibility,body) VALUES ('private-alpha','alpha','owner-a','private','sensitiveunique'),('shared-alpha','alpha','owner-a','shared','ordinaryneedle'),('shared-beta','beta','owner-b','shared','foreignunique')");

  async function scoped<T extends Record<string, unknown>>(actor: string, tenant: string, sql: string, parameters: unknown[] = []) {
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('l0.actor',$1,true), set_config('l0.tenant',$2,true)", [actor, tenant]);
      await client.query("SET LOCAL ROLE l0_reader");
      const result = await client.query<T>(sql, parameters);
      await client.query("COMMIT");
      return result.rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  await context.test("real RLS denies foreign records, administrator mail access, and ungranted guests", async () => {
    const query = "SELECT id FROM l0.records ORDER BY id";
    assert.deepEqual((await scoped("admin-a", "alpha", query)).map((row) => row.id), ["shared-alpha"]);
    assert.deepEqual(await scoped("guest-a", "alpha", query), []);
    await client.query("INSERT INTO l0.grants VALUES ('shared-alpha','guest-a')");
    assert.deepEqual((await scoped("guest-a", "alpha", query)).map((row) => row.id), ["shared-alpha"]);
    assert.equal((await scoped("owner-a", "alpha", query)).length, 2);
    assert.deepEqual(await scoped("member-a", "beta", query), []);
  });

  await context.test("revocation and tombstones protect subsequent reads immediately", async () => {
    await client.query("UPDATE l0.memberships SET active=false WHERE actor='member-a'");
    assert.deepEqual(await scoped("member-a", "alpha", "SELECT id FROM l0.records"), []);
    await client.query("UPDATE l0.memberships SET active=true WHERE actor='member-a'");
    await client.query("UPDATE l0.records SET deleted=true WHERE id='shared-alpha'");
    assert.deepEqual(await scoped("member-a", "alpha", "SELECT id FROM l0.records"), []);
    await client.query("UPDATE l0.records SET deleted=false WHERE id='shared-alpha'");
  });

  await context.test("concurrent duplicate operations produce one canonical task and outbox event", async () => {
    const operation = randomUUID();
    const second = await fixture.connect();
    try {
      const results = await Promise.all([
        client.query<{ id: string }>("SELECT l0.capture_task($1,$2,$3,$4) AS id", ["alpha", operation, "digest-a", randomUUID()]),
        second.query<{ id: string }>("SELECT l0.capture_task($1,$2,$3,$4) AS id", ["alpha", operation, "digest-a", randomUUID()]),
      ]);
      assert.equal(results[0]?.rows[0]?.id, results[1]?.rows[0]?.id);
      const counts = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.outbox WHERE operation_id=$1", [operation]);
      assert.equal(counts.rows[0]?.count, 1);
      await assert.rejects(client.query("SELECT l0.capture_task($1,$2,$3,$4)", ["alpha", operation, "different-digest", randomUUID()]), /operation payload conflict/);
    } finally { await second.end(); }
  });

  await context.test("persisted collaborative snapshots do not acquire permission authority", async () => {
    const live = new Y.Doc();
    const restored = new Y.Doc();
    try {
      live.getText("body").insert(0, "Persisted synthetic document");
      live.getMap<boolean>("permissions").set("public", true);
      await client.query("INSERT INTO l0.document_snapshots VALUES($1,$2)", ["private-alpha", Buffer.from(Y.encodeStateAsUpdate(live))]);
      const rows = await client.query<{ snapshot: Buffer }>("SELECT snapshot FROM l0.document_snapshots WHERE record_id=$1", ["private-alpha"]);
      const snapshot = rows.rows[0]?.snapshot;
      assert.ok(snapshot && Buffer.isBuffer(snapshot));
      Y.applyUpdate(restored, snapshot);
      assert.equal(restored.getText("body").toString(), "Persisted synthetic document");
      assert.deepEqual(await scoped("member-a", "alpha", "SELECT id FROM l0.records WHERE id='private-alpha'"), []);
      assert.equal((await scoped("owner-a", "alpha", "SELECT id FROM l0.records WHERE id='private-alpha'")).length, 1);
    } finally { live.destroy(); restored.destroy(); }
  });

  await context.test("terminating a session rolls back uncommitted task and outbox writes", async () => {
    const lost = await fixture.connect();
    const processId = await lost.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const errorEvent = new Promise<string>((resolve) => lost.once("error", (error: Error) => resolve(error.message)));
    const operation = randomUUID();
    await lost.query("BEGIN");
    await lost.query("SELECT l0.capture_task($1,$2,$3,$4)", ["alpha", operation, "uncommitted", randomUUID()]);
    await client.query("SELECT pg_terminate_backend($1)", [processId.rows[0]?.pid]);
    assert.match(await errorEvent, /terminating connection/);
    await lost.end();
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.outbox WHERE operation_id=$1", [operation])).rows[0]?.count, 0);
  });

  await context.test("provider page/checkpoint failure and cursor rebuild preserve app-owned work", async () => {
    await client.query("INSERT INTO l0.cursors VALUES ('synthetic-account','cursor-1',1)");
    await client.query("BEGIN");
    await client.query("INSERT INTO l0.provider_items VALUES ('synthetic-account','message-1',1)");
    await assert.rejects(client.query("SELECT 1/0"), /division by zero/);
    await client.query("ROLLBACK");
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.provider_items")).rows[0]?.count, 0);
    assert.equal((await client.query<{ cursor: string }>("SELECT cursor FROM l0.cursors")).rows[0]?.cursor, "cursor-1");
    const before = (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.tasks")).rows[0]?.count;
    await client.query("BEGIN");
    await client.query("DELETE FROM l0.provider_items WHERE connection_id='synthetic-account'");
    await client.query("UPDATE l0.cursors SET generation=2,cursor='rebuild-checkpoint' WHERE connection_id='synthetic-account'");
    await client.query("COMMIT");
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.tasks")).rows[0]?.count, before);
  });

  await context.test("pg-boss queue insertion commits or rolls back with app-owned work", async () => {
    await boss.createQueue("l0-work", { retryLimit: 2, retryDelay: 0 });
    const operation = randomUUID();
    const transaction = { executeSql: async (text: string, values: unknown[] = []) => ({ rows: (await client.query<Record<string, unknown>>(text, values)).rows }) };
    await client.query("BEGIN");
    await client.query("SELECT l0.capture_task($1,$2,$3,$4)", ["alpha", operation, "rollback-job", randomUUID()]);
    await boss.send("l0-work", { operation }, { id: operation, db: transaction });
    await client.query("ROLLBACK");
    assert.deepEqual(await boss.fetch("l0-work"), []);
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.outbox WHERE operation_id=$1", [operation])).rows[0]?.count, 0);
  });

  await context.test("two job claimers do not overlap and retries are fenced by attempt", async () => {
    const jobs = Array.from({ length: 1000 }, (_, sequence) => ({ id: randomUUID(), data: { sequence } }));
    const start = performance.now();
    await boss.insert("l0-work", jobs);
    const claimed = new Set<string>();
    while (claimed.size < jobs.length) {
      const batches = await Promise.all([boss.fetch("l0-work", { batchSize: 100 }), boss.fetch("l0-work", { batchSize: 100 })]);
      assert.ok(batches.some((batch) => batch.length > 0));
      for (const batch of batches) {
        for (const job of batch) { assert.equal(claimed.has(job.id), false); claimed.add(job.id); }
        if (batch.length) await boss.complete("l0-work", batch.map((job) => job.id));
      }
    }
    observations.jobCount = claimed.size;
    observations.jobRoundTripMilliseconds = performance.now() - start;
    const id = await boss.send("l0-work", { sequence: "retry" });
    const [first] = await boss.fetch("l0-work", { includeMetadata: true });
    assert.ok(first && first.id === id);
    const firstToken = randomUUID();
    assert.equal(await claimAttempt(client, first.id, first.retryCount, firstToken), true);
    await boss.fail("l0-work", first.id, { code: "synthetic-transient-failure" });
    const [retry] = await boss.fetch("l0-work", { includeMetadata: true, ignoreStartAfter: true });
    assert.ok(retry && retry.retryCount === 1);
    const retryToken = randomUUID();
    assert.equal(await claimAttempt(client, retry.id, retry.retryCount, retryToken), true);
    assert.equal(await claimAttempt(client, first.id, first.retryCount, randomUUID()), false);
    assert.equal(await completeAttempt(client, boss, "l0-work", first.id, first.retryCount, firstToken), false);
    assert.equal((await boss.findJobs("l0-work", { id: retry.id }))[0]?.state, "active");
    assert.equal(await completeAttempt(client, boss, "l0-work", retry.id, retry.retryCount, retryToken), true);
    assert.equal(await completeAttempt(client, boss, "l0-work", retry.id, retry.retryCount, retryToken), false);
  });

  await context.test("permission-aware search is bounded and exact over a 100000-record synthetic fixture", async () => {
    const start = performance.now();
    await client.query("INSERT INTO l0.records(id,tenant,owner,visibility,body) SELECT 'record-'||lpad(n::text,6,'0'), CASE WHEN n%3=0 THEN 'beta' ELSE 'alpha' END, 'batch-owner', CASE WHEN n%7=0 THEN 'private' ELSE 'shared' END, CASE WHEN n%101=0 THEN 'needlealpha document '||n ELSE 'ordinary document '||n END FROM generate_series(1,100000) AS n");
    await client.query("ANALYZE l0.records");
    observations.seedMilliseconds = performance.now() - start;
    const expected = Array.from({ length: 100000 }, (_, index) => index + 1).filter((n) => n % 101 === 0 && n % 3 !== 0 && n % 7 !== 0).length;
    const count = await scoped<{ count: number }>("member-a", "alpha", "SELECT count(*)::int AS count FROM l0.records WHERE search @@ plainto_tsquery('simple',$1)", ["needlealpha"]);
    assert.equal(count[0]?.count, expected);
    const first = await scoped("member-a", "alpha", "SELECT id FROM l0.records WHERE search @@ plainto_tsquery('simple',$1) ORDER BY id LIMIT 25", ["needlealpha"]);
    assert.equal(first.length, 25);
    assert.deepEqual(await scoped("admin-a", "alpha", "SELECT id FROM l0.records WHERE search @@ plainto_tsquery('simple',$1)", ["sensitiveunique"]), []);
    assert.deepEqual(await scoped("member-a", "alpha", "SELECT id FROM l0.records WHERE search @@ plainto_tsquery('simple',$1)", ["foreignunique"]), []);
    const durations: number[] = [];
    for (let i = 0; i < 30; i++) {
      const began = performance.now();
      await scoped("member-a", "alpha", "SELECT id FROM l0.records WHERE search @@ plainto_tsquery('simple',$1) ORDER BY id LIMIT 25", ["needlealpha"]);
      durations.push(performance.now() - began);
    }
    observations.authorizedSearchMatches = expected;
    observations.searchRoundTripP95Milliseconds = durations.sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1];
  });

  await context.test("abrupt server restart preserves accepted writes and queued jobs", async () => {
    const jobId = await boss.send("l0-work", { sequence: "restart" });
    const before = (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.outbox")).rows[0]?.count;
    await boss.stop();
    await client.end();
    await fixture.crashAndRestart();
    client = await fixture.connect();
    boss = new PgBoss({ ...fixture.configuration, schema: "l0_jobs", supervise: false, schedule: false });
    boss.on("error", (error: Error) => errors.push(error.name));
    await boss.start();
    assert.equal((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM l0.outbox")).rows[0]?.count, before);
    const [recovered] = await boss.fetch("l0-work");
    assert.ok(recovered && recovered.id === jobId);
    await boss.complete("l0-work", recovered.id);
  });

  assert.deepEqual(errors, []);
  await mkdir(new URL("../.artifacts/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.artifacts/postgres-report.json", import.meta.url), JSON.stringify({ ...observations, result: "passed", scope: "local synthetic engineering spike; not production SLO qualification" }, null, 2) + "\n");
});
