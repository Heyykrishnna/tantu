import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import * as Y from "yjs";
import { fixture } from "./support.js";
test("saved collection views repair missing schema references and reviewed templates create independent private records", { timeout: 60000 }, async () => {
  const f = await fixture();
  try {
    const user = await f.account("knowledge-workflows@example.test"); const other = await f.account("knowledge-reader@example.test"); const base = `/api/v1/workspaces/${user.workspaceId}`; await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'member',true)", [user.workspaceId, other.userId]);
    const post = (path: string, payload: object, headers = user.headers) => f.app.inject({ method: "POST", url: base + path, headers, payload });
    const created = await post("/pages", { title: "Source collection", visibility: "private", operationId: randomUUID() }); assert.equal(created.statusCode, 201, created.body); const page = created.json<{ id: string }>(); await f.owner.query("INSERT INTO tantu.grants VALUES($1,$2,$3,'read')",[user.workspaceId,page.id,other.userId]); assert.equal((await post("/collections", { pageId: page.id, operationId: randomUUID() })).statusCode, 200);
    const propertyId = randomUUID(); const schema = [{ id: propertyId, name: "Hours", type: "number" }]; const schemaReview = await post(`/collections/${page.id}/schema/review`, { properties: schema, expectedVersion: 1 }); assert.equal((await post(`/collections/${page.id}/schema/apply`, { reviewId: schemaReview.json<{ id: string }>().id, operationId: randomUUID() })).statusCode, 200);
    const task = await post("/tasks", { title: "Template task", visibility: "workspace", operationId: randomUUID() }); const taskId = task.json<{ id: string }>().id; assert.equal((await post(`/collections/${page.id}/items`, { recordId: taskId, values: { [propertyId]: 3 }, expectedVersion: 0, schemaVersion: 2, operationId: randomUUID() })).statusCode, 200);
    const views = `/views/collection/${page.id}`; const settings = { mode: "table", sort: "title", group: "none", status: "all", columns: [propertyId], propertySort: propertyId, propertyGroup: propertyId, filter: "Template" };
    assert.equal((await post(views, { name: "Personal", shared: false, settings, expectedVersion: 0, operationId: randomUUID() }, other.headers)).statusCode, 200); assert.equal((await post(views, { name: "Shared", shared: true, settings, expectedVersion: 0, operationId: randomUUID() }, other.headers)).statusCode, 404);
    const saved = await post("/knowledge-templates", { sourceId: page.id, name: "Reusable", includeRows: true, expectedVersion: 0, operationId: randomUUID() }); assert.equal(saved.statusCode, 200, saved.body); const id = saved.json<{ id: string }>().id; const review = await post(`/knowledge-templates/${id}/review`, {}); assert.equal(review.statusCode, 200, review.body);
    const payload = { reviewId: review.json<{ id: string }>().id, title: "New private collection", operationId: randomUUID() }; const result = await post(`/knowledge-templates/${id}/apply`, payload); assert.equal(result.statusCode, 200, result.body); const copyId = result.json<{ id: string }>().id; assert.notEqual(copyId, page.id); assert.equal((await post(`/knowledge-templates/${id}/apply`, payload)).body, result.body);
    const copy = await f.app.inject({ url: base + `/collections/${copyId}`, headers: user.headers }); assert.equal(copy.statusCode, 200, copy.body); const detail = copy.json<{ items: { record: { id: string; visibility: string }; values: Record<string, unknown> }[] }>(); assert.notEqual(detail.items[0]?.record.id, taskId); assert.equal(detail.items[0]?.record.visibility, "private"); assert.equal(detail.items[0]?.values[propertyId], 3);
    assert.equal((await f.app.inject({ url: base + `/collections/${copyId}`, headers: other.headers })).statusCode, 404);
    const removed = await post(`/collections/${page.id}/schema/review`, { properties: [], expectedVersion: 2 }); assert.equal(removed.statusCode, 200, removed.body); assert.equal((await post(`/collections/${page.id}/schema/apply`, { reviewId: removed.json<{ id: string }>().id, operationId: randomUUID() })).statusCode, 200);
    assert.equal((await post(views, { name: "Stale", shared: false, settings, expectedVersion: 0, operationId: randomUUID() })).statusCode, 409);
    assert.equal((await post(`/knowledge-templates/${id}/review`, {})).statusCode, 409);
  } finally { await f.close(); }
});
test("rich revisions, authorized mentions and unavailable source previews preserve access boundaries", { timeout: 60000 }, async () => {
  const f = await fixture(); const doc = new Y.Doc();
  try {
    const user = await f.account("rich@example.test"); const other = await f.account("rich-other@example.test"); const base = `/api/v1/workspaces/${user.workspaceId}`; await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'member',true)", [user.workspaceId, other.userId]);
    const pageResponse = await f.app.inject({ method: "POST", url: base + "/pages", headers: user.headers, payload: { title: "Rich page", visibility: "workspace", operationId: randomUUID() } }); const pageId = pageResponse.json<{ id: string }>().id;
    const privateResponse = await f.app.inject({ method: "POST", url: base + "/pages", headers: user.headers, payload: { title: "Private source", operationId: randomUUID() } }); const privateId = privateResponse.json<{ id: string }>().id;
    const path = base + `/pages/${pageId}/collaboration`; const initial = await f.app.inject({ url: path, headers: user.headers }); Y.applyUpdate(doc, Buffer.from(initial.json<{ state: string }>().state, "base64")); doc.getText("body").insert(0, "Rich content", { bold: true });
    const saved = await f.app.inject({ method: "POST", url: path, headers: user.headers, payload: { operationId: randomUUID(), update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") } }); assert.equal(saved.statusCode, 200, saved.body);
    const page = await f.app.inject({ url: base + `/pages/${pageId}`, headers: user.headers }); assert.deepEqual(page.json<{ body: { content: { content: { marks: unknown }[] }[] } }>().body.content[0]?.content[0]?.marks, [{ type: "bold" }]);
    const embed = await f.app.inject({ method: "POST", url: base + `/records/${pageId}/embeds`, headers: user.headers, payload: { targetId: privateId, operationId: randomUUID() } }); assert.equal(embed.statusCode, 200, embed.body);
    const hidden = await f.app.inject({ url: base + `/records/${pageId}/embeds`, headers: other.headers }); assert.equal(hidden.statusCode, 200, hidden.body); assert.equal(hidden.body.includes("Private source"), false); assert.equal(hidden.body.includes(privateId), false); assert.equal(hidden.json<{ items: { targetId: string | null }[] }>().items[0]?.targetId, null);
    const candidates = await f.app.inject({ url: base + `/records/${privateId}/mention-options`, headers: user.headers }); assert.equal(candidates.body.includes(other.userId), false);
    doc.getText("body").format(0, 1, { href: "javascript:alert(1)" }); const invalid = await f.app.inject({ method: "POST", url: path, headers: user.headers, payload: { operationId: randomUUID(), update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") } }); assert.equal(invalid.statusCode, 400, invalid.body);
  } finally { doc.destroy(); await f.close(); }
});
