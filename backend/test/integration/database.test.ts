import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { Pool } from "pg";
import { startPostgresFixture } from "./postgres-fixture.js";
import { Database } from "../../src/platform/database/database.js";
import { migrate } from "../../src/platform/database/migrate.js";
import { initializeJobs } from "../../src/workers/queue.js";

test("fixture shutdown lets pooled sockets disconnect without administrative termination", { timeout: 30_000 }, async () => {
  const fixture = await startPostgresFixture();
  const pool = new Pool({ ...fixture.configuration, max: 12 });
  const errors: Error[] = [];
  pool.on("error", (error: Error) => errors.push(error));
  let closed = false;
  try {
    await Promise.all(Array.from({ length: 12 }, () => pool.query("SELECT pg_sleep(0.01)")));
    await pool.end();
    closed = true;
    await fixture.stop();
    await setImmediate();
    assert.deepEqual(errors, []);
  } finally {
    if (!closed) await pool.end();
    await fixture.stop();
  }
});

test("ordered migrations, least-privilege runtime and transactional rollback", { timeout: 30_000 }, async () => {
  const fixture = await startPostgresFixture();
  const pool = new Pool(fixture.configuration);
  const db = new Database({ ...fixture.configuration, user: "tantu_runtime" });
  try {
    await migrate(pool);
    await migrate(pool);
    const migrationNames = (await readdir(new URL("../../migrations/", import.meta.url))).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const applied = await pool.query<{ name: string }>("SELECT name FROM public.tantu_migrations ORDER BY name");
    assert.deepEqual(applied.rows.map(({ name }) => name), migrationNames);
    await initializeJobs(pool);
    await pool.query("CREATE ROLE tantu_runtime LOGIN NOSUPERUSER NOBYPASSRLS");
    await pool.query(await readFile(new URL("../../migrations/runtime-grants.sql", import.meta.url), "utf8"));
    await db.verifyRole();
    const unsafe = new Database(fixture.configuration);
    try { await assert.rejects(unsafe.verifyRole(), /must not be superuser/); }
    finally { await unsafe.close(); }
    await pool.query("CREATE ROLE inherited_owner LOGIN NOSUPERUSER NOBYPASSRLS; GRANT l0_owner TO inherited_owner");
    const inherited = new Database({ ...fixture.configuration, user: "inherited_owner" });
    try { await assert.rejects(inherited.verifyRole(), /inherit canonical table ownership/); }
    finally { await inherited.close(); }
    await assert.rejects(db.transaction(undefined, async (client) => {
      await client.query("INSERT INTO tantu.workspaces(name) VALUES('rolled back')");
      throw new Error("rollback");
    }), /rollback/);
    assert.equal((await pool.query("SELECT * FROM tantu.workspaces")).rowCount, 0);
    await assert.rejects(db.pool.query("SELECT * FROM tantu.access_metadata"), /permission denied/);
    assert.equal((await db.pool.query("SELECT * FROM tantu.records")).rowCount, 0);
  } finally {
    await db.close();
    await pool.end();
    await fixture.stop();
  }
});
