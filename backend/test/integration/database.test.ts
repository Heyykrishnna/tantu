import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { startPostgresFixture } from "../../../discovery/src/postgres-fixture.js";
import { Database } from "../../src/platform/database/database.js";
import { migrate } from "../../src/platform/database/migrate.js";
import { initializeJobs } from "../../src/workers/queue.js";

test("ordered migrations, least-privilege runtime and transactional rollback", { timeout: 30_000 }, async () => {
  const fixture = await startPostgresFixture();
  const pool = new Pool(fixture.configuration);
  const db = new Database({ ...fixture.configuration, user: "tantu_runtime" });
  try {
    await migrate(pool);
    await migrate(pool);
    assert.equal((await pool.query("SELECT * FROM public.tantu_migrations")).rowCount, 10);
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
