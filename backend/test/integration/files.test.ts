import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { test } from "node:test";
import { promisify } from "node:util";
import { fixture } from "./support.js";
import { Files } from "../../src/modules/files/service.js";
import { Queue, scanQueue } from "../../src/workers/queue.js";
import { scan } from "../../src/modules/files/scanner.js";

test("private files: quarantine, protocol framing, signed access, revocation and deletion", { timeout: 30_000 }, async () => {
  const scanner = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      if (input.length < 14) return;
      assert.equal(input.subarray(0, 10).toString(), "zINSTREAM\0");
      const length = input.readUInt32BE(10);
      if (input.length < 18 + length) return;
      assert.equal(input.readUInt32BE(14 + length), 0);
      const body = input.subarray(14, 14 + length).toString();
      socket.end(body.includes("synthetic-malware") ? "stream: Synthetic-Test FOUND\0" : "stream: OK\0");
    });
  });
  await new Promise<void>((resolve) => scanner.listen(0, "127.0.0.1", resolve));
  const address = scanner.address();
  assert.ok(address && typeof address !== "string");
  const f = await fixture({ scannerPort: address.port });
  const queue = new Queue(f.database);
  const files = new Files(f.database, queue, f.settings);
  try {
    await queue.start();
    const a = await f.account("fileowner@example.test");
    const b = await f.account("fileforeign@example.test");
    const base = `/api/v1/workspaces/${a.workspaceId}`;
    const record = await f.app.inject({ method: "POST", url: base + "/tasks", headers: a.headers, payload: { title: "File owner", operationId: randomUUID() } });
    assert.equal(record.statusCode, 201);
    const fileBase = base + "/records/" + record.json<{ id: string }>().id + "/files";
    const content = Buffer.from("synthetic safe content").toString("base64");
    const payload = { operationId: randomUUID(), name: "note.txt", mediaType: "text/plain", content };
    const uploaded = await f.app.inject({ method: "POST", url: fileBase, headers: a.headers, payload });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const id = uploaded.json<{ id: string }>().id;
    assert.equal(uploaded.json<{ state: string }>().state, "pending");
    assert.equal((await f.app.inject({ method: "POST", url: fileBase + `/${id}/access`, headers: a.headers })).statusCode, 404);
    const replay = await f.app.inject({ method: "POST", url: fileBase, headers: a.headers, payload });
    assert.equal(replay.json<{ id: string }>().id, id);
    assert.equal((await f.app.inject({ method: "POST", url: fileBase, headers: a.headers, payload: { ...payload, content: Buffer.from("different").toString("base64") } })).statusCode, 409);
    await queue.runOne(scanQueue, (client, data) => files.process(client, data));
    const access = await f.app.inject({ method: "POST", url: fileBase + `/${id}/access`, headers: a.headers });
    assert.equal(access.statusCode, 200, access.body);
    const token = access.json<{ token: string }>().token;
    const download = await f.app.inject({ url: fileBase + `/${id}/content?token=${token}`, headers: a.headers });
    assert.equal(download.statusCode, 200);
    assert.equal(download.body, "synthetic safe content");
    assert.equal(download.headers["content-type"], "application/octet-stream");
    assert.equal((await f.app.inject({ url: fileBase + `/${id}/content?token=${token}`, headers: b.headers })).statusCode, 404);
    assert.equal((await f.app.inject({ url: fileBase + `/${id}/content?token=${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`, headers: a.headers })).statusCode, 404);
    const malicious = await f.app.inject({ method: "POST", url: fileBase, headers: a.headers, payload: { ...payload, operationId: randomUUID(), content: Buffer.from("synthetic-malware").toString("base64") } });
    await queue.runOne(scanQueue, (client, data) => files.process(client, data));
    assert.equal((await f.app.inject({ method: "POST", url: fileBase + `/${malicious.json<{ id: string }>().id}/access`, headers: a.headers })).statusCode, 404);
    const deleted = await f.app.inject({ method: "DELETE", url: fileBase + `/${id}`, headers: a.headers });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal((await f.app.inject({ url: fileBase + `/${id}/content?token=${token}`, headers: a.headers })).statusCode, 404);
    await queue.runOne(scanQueue, (client, data) => files.process(client, data));
    await assert.rejects(files.store.read(id), /ENOENT/);
    assert.equal((await f.owner.query("SELECT * FROM tantu.deletions WHERE removed_at IS NOT NULL")).rowCount, 1);
    assert.equal((await f.app.inject({ method: "POST", url: fileBase, headers: a.headers, payload: { ...payload, operationId: randomUUID(), name: "../escape.txt" } })).statusCode, 400);
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE user_id=$1 AND workspace_id=$2", [a.userId, a.workspaceId]);
    assert.equal((await f.app.inject({ url: fileBase, headers: a.headers })).statusCode, 404);
  } finally { await queue.stop(); await f.close(); await promisify(scanner.close.bind(scanner))(); }
});

test("scanner connection failure fails closed", async () => {
  assert.equal(await scan(Buffer.from("untrusted"), { scannerHost: "127.0.0.1", scannerPort: 1 }), "unavailable");
  assert.equal(await scan(Buffer.alloc(0), { scannerHost: "127.0.0.1", scannerPort: 1 }), "rejected");
});
