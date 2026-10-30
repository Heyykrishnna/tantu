import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Providers } from "../../src/modules/providers/service.js";
import { ProviderHttp } from "../../src/modules/providers/http.js";
import { seal } from "../../src/modules/providers/vault.js";
import { executeProviderEffect } from "../../src/modules/providers/mail-actions.js";
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
test("derived drafts, stale reviews, snoozing and mailbox mutations remain private and recoverable", { timeout: 60000 }, async () => {
  const key = randomBytes(32); let service: Providers | undefined; let writes = 0; let read = false;
  const f = await fixture({}, (db, settings) => service = new Providers(db, settings, { key, registrations: {} }, new ProviderHttp(async (input, init) => {
    if (init?.method === "POST") { writes++; read = true; throw new TypeError("synthetic lost response"); }
    if (String(input).includes("labels")) return json({ labels: [{ id: "tag", name: "Tag" }] });
    return json({ id: "message", threadId: "thread", labelIds: read ? [] : ["UNREAD"], payload: { headers: [{ name: "From", value: '"Sender, One" <sender@example.test>' }, { name: "To", value: "owner@example.test, peer@example.test" }, { name: "Message-ID", value: "<source@example.test>" }, { name: "Subject", value: "Source" }] } });
  })));
  try {
    if (!service) throw new Error("Missing service"); const user = await f.account("owner@example.test"); const connection = randomUUID(); const scope = { workspaceId: user.workspaceId, userId: user.userId }; const root = `/api/v1/workspaces/${user.workspaceId}`; const base = root + `/providers/${connection}`;
    await f.owner.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,'google','fixture','owner@example.test',$4,$5,now()+interval '1 hour')", [connection, user.workspaceId, user.userId, JSON.stringify(seal({ access_token: "synthetic" }, key, "connection:" + connection)), ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"]]);
    await f.owner.query("INSERT INTO tantu.provider_projections VALUES($1,$2,'message','mail',$3,$4)", [user.workspaceId, connection, JSON.stringify({ id: "message", subject: "Source", body: "Original" }), randomUUID()]);
    const post = (url: string, payload: object, method: "POST" | "PATCH" = "POST") => f.app.inject({ method, url, headers: user.headers, payload });
    const created = await post(base + "/drafts", { recipients: [], subject: "", body: "Reply", mode: "replyAll", sourceId: "message", operationId: randomUUID() }); assert.equal(created.statusCode, 200, created.body); const id = created.json<{ id: string }>().id;
    const drafts = await f.app.inject({ url: base + "/drafts", headers: user.headers }); const draft = drafts.json<{ items: { recipients: string[]; subject: string }[] }>().items[0]; assert.deepEqual(draft?.recipients, ["sender@example.test", "peer@example.test"]); assert.equal(draft?.subject, "Re: Source");
    const review = await post(root + `/mail/drafts/${id}/review`, { expectedVersion: 1 }); assert.equal(review.statusCode, 200, review.body);
    assert.equal((await post(base + `/drafts/${id}`, { recipients: ["sender@example.test"], subject: "Edited", body: "Changed", expectedVersion: 1, operationId: randomUUID() }, "PATCH")).statusCode, 200);
    assert.equal((await post(root + "/mail/sends", { reviewId: review.json<{ id: string }>().id, operationId: randomUUID() })).statusCode, 409);
    assert.equal((await post(base + "/drafts", { recipients: ["sender@example.test"], subject: "Attachment", body: "Changed", attachmentIds: [randomUUID()], operationId: randomUUID() })).statusCode, 409);
    const snooze = await post(base + "/snooze", { messageId: "message", snoozedUntil: new Date(Date.now() + 3600000).toISOString(), expectedVersion: 0, operationId: randomUUID() }); assert.equal(snooze.statusCode, 200, snooze.body);
    assert.equal((await f.app.inject({ url: base + "/items?kind=mail", headers: user.headers })).json<{ items: unknown[] }>().items.length, 0);
    assert.equal((await f.app.inject({ url: base + "/items?kind=mail&includeSnoozed=true", headers: user.headers })).json<{ items: unknown[] }>().items.length, 1);
    const actionReview = await post(base + "/mail-actions/review", { messageId: "message", action: "read", targetId: null }); assert.equal(actionReview.statusCode, 200, actionReview.body);
    const applied = await post(base + "/mail-actions/apply", { reviewId: actionReview.json<{ id: string }>().id, operationId: randomUUID() }); assert.equal(applied.statusCode, 200, applied.body); const effectId = applied.json<{ id: string }>().id;
    assert.equal((await executeProviderEffect(service, scope, effectId)).state, "unknown"); assert.equal((await executeProviderEffect(service, scope, effectId)).state, "unknown"); assert.equal(writes, 1);
    const reconcile = await post(base + `/mail-actions/${effectId}/reconcile`, {}); assert.equal(reconcile.json<{ state: string }>().state, "confirmed", reconcile.body); assert.equal(writes, 1);
    assert.equal((await f.app.inject({ url: base + "/calendar/operations", headers: user.headers })).json<{ items: unknown[] }>().items.length, 0);
  } finally { await f.close(); }
});
