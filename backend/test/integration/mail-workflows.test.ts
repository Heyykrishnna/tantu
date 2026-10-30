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
    const pendingReview=await post(base+"/mail-actions/review",{messageId:"message",action:"unread",targetId:null});
    const pending=await post(base+"/mail-actions/apply",{reviewId:pendingReview.json<{id:string}>().id,operationId:randomUUID()});assert.equal(pending.statusCode,200,pending.body);
    await f.owner.query("INSERT INTO tantu.provider_folders(workspace_id,connection_id,external_id,name,seen_generation) VALUES($1,$2,'folder','Private folder',$3)",[user.workspaceId,connection,randomUUID()]);
    const disconnected=await post(base+"/disconnect",{expectedVersion:1,operationId:randomUUID()});assert.equal(disconnected.statusCode,200,disconnected.body);
    assert.equal((await executeProviderEffect(service,scope,pending.json<{id:string}>().id)).state,"cancelled");assert.equal((await f.owner.query("SELECT count(*) FROM tantu.provider_folders WHERE connection_id=$1",[connection])).rows[0]?.count,"0");assert.equal(writes,1);

  } finally { await f.close(); }
});

test("Microsoft replies send only reviewed recipients and clean attachment bytes after removing inherited content", { timeout: 60000 }, async () => {
  const key = randomBytes(32); let sendCalls = 0; let inheritedRemoved = false; const patches: Record<string, unknown>[] = []; let attached = "";
  const f = await fixture({}, (db, settings) => new Providers(db, settings, { key, registrations: {} }, new ProviderHttp(async (input, init) => {
    const url = String(input); const method = init?.method ?? "GET";
    if (url.includes("createReplyAll")) return json({ id: "provider-draft" });
    if (url.includes("attachments?") && method === "GET") return json({ value: [{ id: "inherited" }] });
    if (url.endsWith("attachments/inherited") && method === "DELETE") { inheritedRemoved = true; return new Response(null, { status: 204 }); }
    if (url.endsWith("/attachments") && method === "POST") { const payload: unknown = JSON.parse(String(init?.body)); if (typeof payload !== "object" || !payload || !("contentBytes" in payload) || typeof payload.contentBytes !== "string") throw new Error("Invalid test attachment"); attached = payload.contentBytes; return json({ id: "attached" }); }
    if (method === "PATCH") { const payload: unknown = JSON.parse(String(init?.body)); if (typeof payload !== "object" || !payload || Array.isArray(payload)) throw new Error("Invalid test draft"); patches.push({ ...payload }); return json({ id: "provider-draft" }); }
    if (url.endsWith("/send")) { sendCalls++; return new Response(null, { status: 202 }); }
    return json({ id: "source", subject: "Original", from: { emailAddress: { address: "sender@example.test" } }, toRecipients: [], ccRecipients: [] });
  })));
  try {
    const { FileStore } = await import("../../src/modules/files/store.js"); const { digest } = await import("../../src/modules/workspace-access/credentials.js");
    const user = await f.account("ms-attachments@example.test"); const root = `/api/v1/workspaces/${user.workspaceId}`; const connection = randomUUID(); const base = root + `/providers/${connection}`; const post = (url: string, payload: object, method: "POST" | "PATCH" = "POST") => f.app.inject({ method, url, headers: user.headers, payload });
    await f.owner.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,'microsoft','fixture','ms-attachments@example.test',$4,$5,now()+interval '1 hour')", [connection, user.workspaceId, user.userId, JSON.stringify(seal({ access_token: "synthetic" }, key, "connection:" + connection)), ["Mail.Send", "Mail.ReadWrite"]]);
    await f.owner.query("INSERT INTO tantu.provider_projections VALUES($1,$2,'source','mail',$3,$4)", [user.workspaceId, connection, JSON.stringify({ id: "source", body: "Source" }), randomUUID()]);
    const page = await post(root + "/pages", { title: "File source", operationId: randomUUID() }); const fileId = randomUUID(); const bytes = Buffer.from("Reviewed attachment"); const store = new FileStore(f.settings.storagePath); await store.write(fileId, bytes);
    await f.owner.query("INSERT INTO tantu.files(id,workspace_id,record_id,owner_id,name,media_type,bytes,digest,state) VALUES($1,$2,$3,$4,'reviewed.txt','text/plain',$5,$6,'clean')", [fileId, user.workspaceId, page.json<{ id: string }>().id, user.userId, bytes.length, digest(bytes)]);
    const draft = await post(base + "/drafts", { mode: "replyAll", sourceId: "source", recipients: ["approved@example.test"], subject: "Approved", body: "Only this content", attachmentIds: [fileId], operationId: randomUUID() }); assert.equal(draft.statusCode, 200, draft.body); const id = draft.json<{ id: string }>().id;
    const review = await post(root + `/mail/drafts/${id}/review`, { expectedVersion: 1 }); assert.equal(review.statusCode, 200, review.body); assert.equal(review.json<{ attachments: { name: string }[] }>().attachments[0]?.name, "reviewed.txt");
    const intent = await post(root + "/mail/sends", { reviewId: review.json<{ id: string }>().id, operationId: randomUUID() }); const sendId = intent.json<{ id: string }>().id;
    const result = await post(root + `/mail/sends/${sendId}/execute`, {}); assert.equal(result.json<{ state: string }>().state, "confirmed", result.body); assert.equal(sendCalls, 1); assert.equal(inheritedRemoved, true); assert.equal(attached, bytes.toString("base64")); const patched=patches[0];assert.ok(patched); assert.deepEqual(patched.ccRecipients, []); assert.deepEqual(patched.bccRecipients, []); assert.deepEqual(patched.toRecipients, [{ emailAddress: { address: "approved@example.test" } }]);
    assert.equal((await post(root + `/mail/sends/${sendId}/execute`, {})).json<{ state: string }>().state, "confirmed"); assert.equal(sendCalls, 1);
  } finally { await f.close(); }
});
