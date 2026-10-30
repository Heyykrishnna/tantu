import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Providers } from "../../src/modules/providers/service.js";
import { ProviderHttp } from "../../src/modules/providers/http.js";
import { seal } from "../../src/modules/providers/vault.js";
import { syncPage } from "../../src/modules/providers/sync.js";

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
test("private provider reads checkpoint atomically and uncertain sends cannot be blindly repeated", { timeout: 60_000 }, async () => {
  const key = randomBytes(32); let sendAttempts = 0; let failSend = true; let reset = false; let throttled = false; let service: Providers | undefined;
  const f = await fixture({}, (database, settings) => {
    service = new Providers(database, settings, { key, registrations: {} }, new ProviderHttp(async (input) => {
      const url = String(input);
      if (url.endsWith("/send")) { sendAttempts++; if (failSend) throw new TypeError("synthetic response lost"); return json({ id: "provider-sent" }); }
      if (url.includes("q=rfc822msgid")) return json({ messages: [{ id: "provider-sent" }] });
      if (url.includes("history")) { if (reset) return new Response("", { status: 404 }); if (throttled) return new Response("", { status: 429, headers: { "retry-after": "120" } }); return json({ historyId: "history-2", history: [] }); }
      if (url.endsWith("profile")) return json({ historyId: "history-1" });
      if (url.includes("format=full")) return json({ id: "message", threadId: "thread", labelIds: ["INBOX"], payload: { mimeType: "text/plain", body: { data: Buffer.from("Private mailbox content").toString("base64url") }, headers: [{ name: "Subject", value: "Private subject" }] } });
      return json({ messages: [{ id: "message" }] });
    })); return service;
  });
  try {
    if (!service) throw new Error("Provider fixture unavailable.");
    const user = await f.account("provider@example.test"); const other = await f.account("provider-other@example.test");
    await f.owner.query("INSERT INTO tantu.memberships VALUES($1,$2,'admin',true)", [user.workspaceId, other.userId]);
    const scope = { workspaceId: user.workspaceId, userId: user.userId }; const base = `/api/v1/workspaces/${user.workspaceId}`; const connectionId = randomUUID();
    await f.owner.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,'google','fixture','provider@example.test',$4,$5,now()+interval '1 hour')", [connectionId, user.workspaceId, user.userId, JSON.stringify(seal({ access_token: "synthetic-token" }, key, "connection:" + connectionId)), ["https://www.googleapis.com/auth/gmail.send"]]);
    assert.equal((await syncPage(service, scope, connectionId, "mail")).state, "confirmed");
    assert.equal((await f.owner.query("SELECT cursor FROM tantu.provider_cursors")).rows[0]?.cursor, "history:history-1");
    const privateList = await f.app.inject({ url: base + "/providers", headers: other.headers }); assert.deepEqual(privateList.json<{ items: unknown[] }>().items, []);
    const hidden = await f.app.inject({ url: base + `/providers/${connectionId}/items?kind=mail`, headers: other.headers }); assert.equal(hidden.statusCode, 409); assert.equal(hidden.body.includes("Private subject"), false);
    const draft = await f.app.inject({ method: "POST", url: base + `/providers/${connectionId}/drafts`, headers: user.headers, payload: { operationId: randomUUID(), recipients: ["synthetic-recipient@example.test"], subject: "Fixture only", body: "No external network is used by this test." } }); assert.equal(draft.statusCode, 200, draft.body);
    const draftId = draft.json<{ id: string }>().id;
    const review = await f.app.inject({ method: "POST", url: base + `/mail/drafts/${draftId}/review`, headers: user.headers, payload: { expectedVersion: 1 } }); assert.equal(review.statusCode, 200, review.body);
    const create = await f.app.inject({ method: "POST", url: base + "/mail/sends", headers: user.headers, payload: { operationId: randomUUID(), reviewId: review.json<{ id: string }>().id } }); assert.equal(create.statusCode, 200, create.body);
    const id = create.json<{ id: string }>().id; const execute = () => f.app.inject({ method: "POST", url: base + `/mail/sends/${id}/execute`, headers: user.headers });
    const [a, b] = await Promise.all([execute(), execute()]); assert.equal(a.json<{ state: string }>().state, "unknown", a.body); assert.equal(b.json<{ state: string }>().state, "unknown", b.body); assert.equal(sendAttempts, 1);
    failSend = false; assert.equal((await execute()).json<{ state: string }>().state, "unknown"); assert.equal(sendAttempts, 1);
    const reconcile = await f.app.inject({ method: "POST", url: base + `/mail/sends/${id}/reconcile`, headers: user.headers }); assert.equal(reconcile.json<{ state: string }>().state, "confirmed", reconcile.body); assert.equal(sendAttempts, 1);
    reset = true; assert.equal((await syncPage(service, scope, connectionId, "mail")).state, "rebuilding"); assert.equal((await f.owner.query("SELECT cursor FROM tantu.provider_cursors")).rows[0]?.cursor, null);
    reset = false; await syncPage(service, scope, connectionId, "mail"); throttled = true; assert.equal((await syncPage(service, scope, connectionId, "mail")).state, "throttled");
    assert.ok((await f.owner.query("SELECT retry_at FROM tantu.provider_connections WHERE id=$1", [connectionId])).rows[0]?.retry_at);
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [user.workspaceId, user.userId]);
    assert.equal((await execute()).statusCode, 404);
  } finally { await f.close(); }
});
