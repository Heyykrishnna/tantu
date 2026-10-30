import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { startPostgresFixture } from "../../../discovery/src/postgres-fixture.js";
import { Database } from "../../src/platform/database/database.js";
import { migrate } from "../../src/platform/database/migrate.js";
import { createAccount } from "../../src/modules/workspace-access/service.js";
import { createApp } from "../../src/app.js";
import { readEnvironment } from "../../src/config/environment.js";
import { initializeJobs } from "../../src/workers/queue.js";
import type { RuntimeSettings } from "../../src/config/runtime.js";

export const settings = { origin: "http://localhost:3000", secureCookies: false, storagePath: "/private/tmp/tantu-l1a-test", signingSecret: "local-synthetic-qualification-secret-32", scannerHost: "127.0.0.1", scannerPort: 3310 };
export const testPassword = "synthetic test password only";

export async function fixture(overrides: Partial<RuntimeSettings> = {}) {
  const cluster = await startPostgresFixture();
  const owner = new Pool(cluster.configuration);
  await migrate(owner);
  await initializeJobs(owner);
  await owner.query("CREATE ROLE tantu_runtime LOGIN NOSUPERUSER NOBYPASSRLS");
  await owner.query(await readFile(new URL("../../migrations/runtime-grants.sql", import.meta.url), "utf8"));
  const database = new Database({ ...cluster.configuration, user: "tantu_runtime" });
  await database.verifyRole();
  const storagePath = await mkdtemp(join(tmpdir(), "tantu-l1a-files-"));
  const runtime = { ...settings, ...overrides, storagePath };
  const app = createApp(readEnvironment({ NODE_ENV: "test" }), { database, settings: runtime });
  async function account(email: string) {
    const userId = await database.transaction(undefined, (client) => createAccount(client, email, email.split("@")[0] ?? "Account", testPassword));
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin: runtime.origin }, payload: { email, password: testPassword } });
    if (response.statusCode !== 200) throw new Error("Fixture login failed: " + response.body);
    const headers = { origin: runtime.origin, cookie: response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), "x-csrf-token": response.json<{ csrf: string }>().csrf };
    const workspace = await app.inject({ method: "POST", url: "/api/v1/workspaces", headers, payload: { name: "Workspace" } });
    if (workspace.statusCode !== 201) throw new Error("Fixture workspace failed: " + workspace.body);
    return { userId, headers, workspaceId: workspace.json<{ id: string }>().id };
  }
  return { app, database, owner, cluster, account, settings: runtime, async close() { try { await app.close(); } finally { await database.close(); await owner.end(); await cluster.stop(); await rm(storagePath, { recursive: true, force: true }); } } };
}
