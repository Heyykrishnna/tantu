import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Providers } from "../../src/modules/providers/service.js";
import { ProviderHttp } from "../../src/modules/providers/http.js";
import { seal } from "../../src/modules/providers/vault.js";
import { syncPage } from "../../src/modules/providers/sync.js";
import { reconcileDue } from "../../src/modules/providers/reconciliation.js";
import { Queue } from "../../src/workers/queue.js";
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
test("periodic reconciliation discovers folders, preserves moved immutable mail and expands calendar windows", { timeout: 60000 }, async () => {
  const key = randomBytes(32); let service: Providers | undefined; let calendarRequests = 0;
  const f = await fixture({}, (db, settings) => service = new Providers(db, settings, { key, registrations: {} }, new ProviderHttp(async input => {
    const url = new URL(String(input));
    if (url.pathname === "/v1.0/me/mailFolders") return json({ value: [{ id: "a", displayName: "Inbox", childFolderCount: 1 }, { id: "b", displayName: "Sent", childFolderCount: 0 }] });
    if (url.pathname.endsWith("/childFolders")) return json({ value: [{ id: "c", displayName: "Nested", parentFolderId: "a", childFolderCount: 0 }] });
    if (url.pathname.includes("/messages/delta")) { const folder = url.pathname.split("/")[4]; return json({ value: folder === "a" ? [{ id: "moved", "@removed": { reason: "deleted" } }] : folder === "c" ? [{ id: "moved", parentFolderId: "c", subject: "Moved source", body: { contentType: "text", content: "Preserved" } }] : [], "@odata.deltaLink": `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta?token=next` }); }
    if (url.pathname.endsWith("/messages/moved")) return json({ id: "moved", parentFolderId: "c", subject: "Moved source", body: { contentType: "text", content: "Preserved" }, from: { emailAddress: { address: "sender@example.test" } } });
    if (url.pathname.includes("/calendar/v3/")) { calendarRequests++; assert.equal(url.searchParams.get("singleEvents"), "true"); assert.ok(url.searchParams.get("timeMin")); return json({ items: [{ id: "occurrence", recurringEventId: "series", summary: "Occurrence", start: { date: "2026-10-31" }, end: { date: "2026-11-01" } }] }); }
    throw new Error("Unexpected fixture request: " + url.pathname);
  })));
  const queue = new Queue(f.database);
  try {
    if (!service) throw new Error("Provider unavailable."); const user = await f.account("sync@example.test"); const scope = { workspaceId: user.workspaceId, userId: user.userId }; const connection = randomUUID();
    await f.owner.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,'microsoft','fixture','sync@example.test',$4,'{}',now()+interval '1 hour')", [connection, user.workspaceId, user.userId, JSON.stringify(seal({ access_token: "fixture" }, key, "connection:" + connection))]);
    const claimed = await f.database.transaction(undefined, client => client.query("SELECT * FROM tantu.claim_provider_reconciliation()")); assert.equal(claimed.rowCount, 1); assert.equal((await f.database.transaction(undefined, client => client.query("SELECT * FROM tantu.claim_provider_reconciliation()"))).rowCount, 0);
    await f.owner.query("INSERT INTO tantu.provider_projections VALUES($1,$2,'moved','mail',$3,$4)", [user.workspaceId, connection, JSON.stringify({ id: "moved", folderId: "a" }), randomUUID()]);
    let state = "pending"; for (let i = 0; i < 12 && state !== "confirmed"; i++) { const result = await syncPage(service, scope, connection, "mail"); assert.notEqual(result.state, "failed", JSON.stringify(result)); state = result.state; } assert.equal(state, "confirmed");
    assert.equal((await f.owner.query("SELECT count(*) FROM tantu.provider_folders")).rows[0]?.count, "3");
    assert.equal((await f.owner.query("SELECT data->>'folderId' AS folder FROM tantu.provider_projections WHERE external_id='moved'")).rows[0]?.folder, "c");
    await f.owner.query("UPDATE tantu.provider_connections SET provider='google' WHERE id=$1", [connection]);
    assert.equal((await syncPage(service, scope, connection, "calendar")).state, "confirmed"); assert.equal((await syncPage(service, scope, connection, "calendar")).state, "confirmed"); assert.equal(calendarRequests, 2);
    const event = (await f.owner.query("SELECT data FROM tantu.provider_projections WHERE kind='calendar'")).rows[0]?.data; assert.equal(event.recurringEventId, "series"); assert.equal(event.allDay, true);
    await queue.start(); await f.owner.query("UPDATE tantu.provider_schedule SET due_at=now() WHERE connection_id=$1", [connection]); assert.equal(await reconcileDue(service, queue), 1); assert.equal((await f.owner.query("SELECT count(*) FROM tantu_jobs.job WHERE name='provider-sync'")).rows[0]?.count, "2");
    await f.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [scope.workspaceId, scope.userId]); await f.owner.query("UPDATE tantu.provider_schedule SET due_at=now() WHERE connection_id=$1", [connection]); assert.equal(await reconcileDue(service, queue), 0);
  } finally { await queue.stop(); await f.close(); }
});
