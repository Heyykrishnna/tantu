import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import * as Y from "yjs";
import { fixture } from "./support.js";

interface Page { id: string; version: number; body: { content: { content: { text: string }[] }[] } }
test("collaborative bodies merge concurrent edits, reconnect, enforce revocation and restore independently of sharing", { timeout: 60_000 }, async () => {
  const f = await fixture(); const docs: Y.Doc[] = [];
  try {
    const user = await f.account("knowledge@example.test"); const other = await f.account("knowledge-other@example.test"); const base = `/api/v1/workspaces/${user.workspaceId}`;
    await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'member',true)", [user.workspaceId, other.userId]);
    const created = await f.app.inject({ method: "POST", url: base + "/pages", headers: user.headers, payload: { operationId: randomUUID(), title: "Shared knowledge", visibility: "workspace", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Initial" }] }] } } }); assert.equal(created.statusCode, 201, created.body);
    const page = created.json<Page>(); const path = base + `/pages/${page.id}/collaboration`;
    const initial = await f.app.inject({ url: path, headers: user.headers }); assert.equal(initial.statusCode, 200, initial.body);
    const state = Buffer.from(initial.json<{ state: string }>().state, "base64");
    const left = new Y.Doc(); const right = new Y.Doc(); docs.push(left, right); Y.applyUpdate(left, state); Y.applyUpdate(right, state);
    left.getText("body").insert(0, "Left "); right.getText("body").insert(right.getText("body").length, " Right");
    const post = (doc: Y.Doc, headers = user.headers) => f.app.inject({ method: "POST", url: path, headers, payload: { operationId: randomUUID(), update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") } });
    const results = await Promise.all([post(left), post(right, other.headers)]); for (const result of results) assert.equal(result.statusCode, 200, result.body);
    const saved = await f.app.inject({ url: base + "/pages/" + page.id, headers: user.headers }); const current = saved.json<Page>(); assert.equal(current.body.content[0]?.content[0]?.text, "Left Initial Right");
    const restored = await f.app.inject({ method: "POST", url: base + `/records/${page.id}/restore-body`, headers: user.headers, payload: { operationId: randomUUID(), revision: 1, expectedVersion: current.version } }); assert.equal(restored.statusCode, 200, restored.body);
    const after = await f.app.inject({ url: base + "/pages/" + page.id, headers: user.headers }); assert.equal(after.json<Page>().body.content[0]?.content[0]?.text, "Initial"); assert.equal(after.json<{ visibility: string }>().visibility, "workspace");
    const direct = await f.app.inject({ method: "PATCH", url: base + "/pages/" + page.id, headers: user.headers, payload: { title: "Shared knowledge", expectedVersion: after.json<Page>().version, operationId: randomUUID(), body: { type: "doc", content: [] } } }); assert.equal(direct.statusCode, 409, direct.body);
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [user.workspaceId, other.userId]);
    assert.equal((await post(right, other.headers)).statusCode, 404); assert.equal((await f.app.inject({ url: path, headers: other.headers })).statusCode, 404);
    const presence = await f.app.inject({ url: path, headers: user.headers }); assert.equal(presence.json<{ presence: { userId: string }[] }>().presence.some((person) => person.userId === other.userId), false);
  } finally { for (const doc of docs) doc.destroy(); await f.close(); }
});

test("collections keep canonical IDs, preview schema repairs and hide inaccessible relationships and rows", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const user = await f.account("collections@example.test"); const other = await f.account("collections-other@example.test"); const base = `/api/v1/workspaces/${user.workspaceId}`;
    await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'member',true)", [user.workspaceId, other.userId]);
    async function create(kind: "pages" | "tasks", title: string, visibility: "workspace" | "private") { const response = await f.app.inject({ method: "POST", url: base + "/" + kind, headers: user.headers, payload: { operationId: randomUUID(), title, visibility } }); assert.equal(response.statusCode, 201, response.body); return response.json<Page>().id; }
    const collectionId = await create("pages", "Release collection", "workspace"); const taskId = await create("tasks", "Private task", "private");
    const created = await f.app.inject({ method: "POST", url: base + "/collections", headers: user.headers, payload: { operationId: randomUUID(), pageId: collectionId } }); assert.equal(created.statusCode, 200, created.body);
    const path = base + "/collections/" + collectionId; const property = randomUUID();
    const review = await f.app.inject({ method: "POST", url: path + "/schema/review", headers: user.headers, payload: { expectedVersion: 1, properties: [{ id: property, name: "Hours", type: "number" }] } }); assert.equal(review.statusCode, 200, review.body);
    const apply = await f.app.inject({ method: "POST", url: path + "/schema/apply", headers: user.headers, payload: { operationId: randomUUID(), reviewId: review.json<{ id: string }>().id } }); assert.equal(apply.statusCode, 200, apply.body);
    const linked = await f.app.inject({ method: "POST", url: path + "/items", headers: user.headers, payload: { operationId: randomUUID(), recordId: taskId, values: { [property]: 4 }, expectedVersion: 0, schemaVersion: 2 } }); assert.equal(linked.statusCode, 200, linked.body);
    const detail = await f.app.inject({ url: path, headers: user.headers }); assert.equal(detail.json<{ items: { record: { id: string } }[] }>().items[0]?.record.id, taskId);
    const invisible = await f.app.inject({ url: path, headers: other.headers }); assert.equal(invisible.json<{ items: unknown[] }>().items.length, 0);
    const relation = await f.app.inject({ method: "POST", url: base + `/records/${collectionId}/relations`, headers: user.headers, payload: { operationId: randomUUID(), targetId: taskId, type: "source", linked: true } }); assert.equal(relation.statusCode, 200, relation.body);
    const context = await f.app.inject({ url: base + `/records/${collectionId}/context`, headers: other.headers }); assert.equal(context.json<{ relations: unknown[] }>().relations.length, 0); assert.equal(context.body.includes("Private task"), false);
    const invalidMention = await f.app.inject({ method: "POST", url: base + `/records/${taskId}/comments`, headers: user.headers, payload: { operationId: randomUUID(), body: "Do not leak this", mentions: [other.userId] } }); assert.equal(invalidMention.statusCode, 400, invalidMention.body);
    const removal = await f.app.inject({ method: "POST", url: path + "/schema/review", headers: user.headers, payload: { expectedVersion: 2, properties: [] } }); assert.equal(removal.statusCode, 200, removal.body); assert.equal(removal.json<{ affectedVisibleRows: number }>().affectedVisibleRows, 1);
    const removed = await f.app.inject({ method: "POST", url: path + "/schema/apply", headers: user.headers, payload: { operationId: randomUUID(), reviewId: removal.json<{ id: string }>().id } }); assert.equal(removed.statusCode, 200, removed.body);
    const repair = await f.app.inject({ url: path, headers: user.headers }); const row = repair.json<{ items: { storedValues: Record<string, number>; repairs: unknown[] }[] }>().items[0]; assert.equal(row?.storedValues[property], 4); assert.equal(row?.repairs.length, 1);
  } finally { await f.close(); }
});
