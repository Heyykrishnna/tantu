import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Database } from "../../src/platform/database/database.js";
import { Queue } from "../../src/workers/queue.js";

test("separate runtime worker publishes events, fails scanner closed and drains on signal", { timeout: 30_000 }, async () => {
  const f = await fixture();
  let output = "";
  let worker: ReturnType<typeof spawn> | undefined;
  try {
    const a = await f.account("worker-process@example.test");
    const record = await f.app.inject({ method: "POST", url: `/api/v1/workspaces/${a.workspaceId}/tasks`, headers: a.headers, payload: { title: "Separate worker", operationId: randomUUID() } });
    const recordId = record.json<{ id: string }>().id;
    const uploaded = await f.app.inject({ method: "POST", url: `/api/v1/workspaces/${a.workspaceId}/records/${recordId}/files`, headers: a.headers, payload: { name: "quarantined.txt", mediaType: "text/plain", content: Buffer.from("synthetic").toString("base64"), operationId: randomUUID() } });
    assert.equal(uploaded.statusCode, 201);
    const connection = new URL("postgresql://tantu_runtime@localhost/postgres");
    connection.searchParams.set("host", f.cluster.configuration.host);
    connection.searchParams.set("port", String(f.cluster.configuration.port));
    const probe = new Database({ connectionString: connection.href });
    const queue = new Queue(probe);
    try { await probe.verifyRole(); await queue.start(); await queue.boss.supervise(); }
    finally { await queue.stop(); await probe.close(); }
    worker = spawn(process.execPath, ["--import", "tsx", "src/workers/server.ts"], { cwd: fileURLToPath(new URL("../../", import.meta.url)), env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", DATABASE_URL: connection.href, APP_ORIGIN: f.settings.origin, FILE_STORAGE_PATH: f.settings.storagePath, FILE_SIGNING_SECRET: f.settings.signingSecret, SCANNER_PORT: "1" }, stdio: ["ignore", "ignore", "pipe"] });
    worker.stderr?.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-10_000); });
    let processed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const files = await f.owner.query<{ state: string }>("SELECT state FROM tantu.files WHERE id=$1", [uploaded.json<{ id: string }>().id]);
      const events = await f.owner.query("SELECT id FROM tantu.events WHERE published_at IS NOT NULL");
      if (files.rows[0]?.state === "unavailable" && events.rowCount === 1) { processed = true; break; }
      if (worker.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.ok(processed, "Separate worker did not process safely: " + output);
    const closed = new Promise<void>((resolve) => worker?.once("exit", () => resolve()));
    worker.kill("SIGTERM");
    await Promise.race([closed, setTimeout(5000)]);
    assert.equal(worker.exitCode, 0, output);
    assert.equal(output, "");
  } finally {
    if (worker?.exitCode === null) worker.kill("SIGKILL");
    await f.close();
  }
});
