import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { utimes } from "node:fs/promises";
import { test } from "node:test";
import { fixture } from "./support.js";
import { FileStore } from "../../src/modules/files/store.js";
import { reconcileFiles } from "../../src/modules/files/maintenance.js";

test("operator cleanup reconciles revoked deletion work, hidden descendants and aged crash orphans", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const a = await f.account("maintenance@example.test");
    const base = `/api/v1/workspaces/${a.workspaceId}`;
    const parent = await f.app.inject({ method: "POST", url: base + "/pages", headers: a.headers, payload: { title: "Parent", operationId: randomUUID() } });
    const id = parent.json<{ id: string }>().id;
    const uploaded = await f.app.inject({ method: "POST", url: base + `/records/${id}/files`, headers: a.headers, payload: { name: "private.txt", operationId: randomUUID(), mediaType: "text/plain", content: Buffer.from("synthetic private data").toString("base64") } });
    assert.equal(uploaded.statusCode, 201);
    const fileId = uploaded.json<{ id: string }>().id;
    await f.app.inject({ method: "DELETE", url: base + "/pages/" + id, headers: a.headers, payload: { expectedVersion: 1, operationId: randomUUID() } });
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [a.workspaceId, a.userId]);
    const store = new FileStore(f.settings.storagePath);
    const orphanId = randomUUID();
    await store.write(orphanId, Buffer.from("abandoned before metadata commit"));
    const old = new Date(Date.now() - 7_200_000);
    await utimes(store.path(orphanId), old, old);
    const preview = await reconcileFiles(f.owner, store);
    assert.deepEqual(preview, { deletionCandidates: 1, orphanCandidates: 1, applied: false });
    assert.ok((await store.read(fileId)).length);
    await assert.rejects(reconcileFiles(f.database.pool, store, true), /isolated operator role/);
    assert.equal((await reconcileFiles(f.owner, store, true)).applied, true);
    await assert.rejects(store.read(fileId), /ENOENT/);
    await assert.rejects(store.read(orphanId), /ENOENT/);
    assert.equal((await f.owner.query<{ file_bytes: number }>("SELECT file_bytes FROM tantu.workspaces WHERE id=$1", [a.workspaceId])).rows[0]?.file_bytes, 0);
    assert.deepEqual(await reconcileFiles(f.owner, store, true), { deletionCandidates: 0, orphanCandidates: 0, applied: true });
  } finally { await f.close(); }
});
