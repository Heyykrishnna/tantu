import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Database } from "../../src/platform/database/database.js";

const execute = promisify(execFile);
const binary = (name: string) => process.env.PG_BIN ? join(process.env.PG_BIN, name) : name;

test("actual canonical backup/restore and abrupt PostgreSQL recovery", { timeout: 60_000 }, async () => {
  const f = await fixture();
  const ownerErrors: string[] = [];
  f.owner.on("error", (error: Error) => ownerErrors.push(error.message));
  try {
    const a = await f.account("recovery@example.test");
    const response = await f.app.inject({ method: "POST", url: `/api/v1/workspaces/${a.workspaceId}/tasks`, headers: a.headers, payload: { title: "Accepted before backup", operationId: randomUUID() } });
    assert.equal(response.statusCode, 201);
    const id = response.json<{ id: string }>().id;
    const configuration = f.cluster.configuration;
    const connection = ["--host", configuration.host, "--port", String(configuration.port), "--username", configuration.user];
    const backup = join(f.settings.storagePath, "database.dump");
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
    await execute(binary("pg_dump"), [...connection, "--dbname", "postgres", "--format=custom", "--no-owner", "--no-privileges", "--file", backup], { env: environment });
    await f.owner.query("CREATE DATABASE tantu_restored");
    await execute(binary("pg_restore"), [...connection, "--dbname", "tantu_restored", "--no-owner", "--no-privileges", "--exit-on-error", backup], { env: environment });
    const restoredOwner = new Pool({ ...configuration, database: "tantu_restored" });
    const restored = new Database({ ...configuration, database: "tantu_restored", user: "tantu_runtime" });
    try {
      await restoredOwner.query(await readFile(new URL("../../migrations/runtime-grants.sql", import.meta.url), "utf8"));
      await restored.verifyRole();
      await restored.transaction({ userId: a.userId, workspaceId: a.workspaceId }, async (client) => {
        assert.equal((await client.query<{ title: string }>("SELECT title FROM tantu.records WHERE id=$1", [id])).rows[0]?.title, "Accepted before backup");
        assert.equal((await client.query("SELECT * FROM tantu.revisions WHERE record_id=$1", [id])).rowCount, 1);
      });
      assert.equal((await restoredOwner.query("SELECT * FROM tantu.events")).rowCount, 1);
      assert.equal((await restoredOwner.query("SELECT * FROM tantu_jobs.job WHERE name='canonical-events' AND state='created'")).rowCount, 1);
    } finally { await restored.close(); await restoredOwner.end(); }
    await f.cluster.crashAndRestart();
    const recovered = new Database({ ...configuration, user: "tantu_runtime" });
    try {
      await recovered.verifyRole();
      await recovered.transaction({ userId: a.userId, workspaceId: a.workspaceId }, async (client) => { assert.equal((await client.query("SELECT * FROM tantu.records WHERE id=$1", [id])).rowCount, 1); });
      assert.equal((await recovered.pool.query("SELECT * FROM tantu_jobs.job WHERE name='canonical-events'")).rowCount, 1);
    } finally { await recovered.close(); }
    assert.ok(ownerErrors.every((error) => /terminating connection|server closed|Connection terminated/.test(error)));
  } finally { await f.close(); }
});
