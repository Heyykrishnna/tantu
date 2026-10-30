import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Providers } from "../../src/modules/providers/service.js";
import { ProviderHttp } from "../../src/modules/providers/http.js";
import { seal } from "../../src/modules/providers/vault.js";
import { renewSubscriptions } from "../../src/modules/providers/subscriptions.js";
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
test("subscription renewal and authenticated hints deduplicate notifications without trusting resource payloads", { timeout: 60000 }, async () => {
  process.env.PROVIDER_NOTIFICATION_ORIGIN = "https://notify.example.test";
  const key = randomBytes(32); let service: Providers | undefined; let creates = 0; let renewals = 0;
  const f = await fixture({}, (db, settings) => service = new Providers(db, settings, { key, registrations: {} }, new ProviderHttp(async (_input, init) => { if (init?.method === "POST") creates++; else renewals++; const body: unknown = JSON.parse(String(init?.body)); assert.equal(typeof body, "object"); return json({ id: creates === 1 ? "mail-sub" : "calendar-sub", expirationDateTime: new Date(Date.now() + 3 * 86400000).toISOString() }); })));
  try {
    if (!service) throw new Error("Missing provider"); const user = await f.account("hint@example.test"); const connection = randomUUID(); const scope = { workspaceId: user.workspaceId, userId: user.userId };
    await f.owner.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,'microsoft','fixture','hint@example.test',$4,'{}',now()+interval '1 hour')", [connection, user.workspaceId, user.userId, JSON.stringify(seal({ access_token: "fixture" }, key, "connection:" + connection))]);
    await renewSubscriptions(service, scope, connection); assert.equal(creates, 2); await renewSubscriptions(service, scope, connection); assert.equal(creates, 2);
    const subscription = (await f.owner.query("SELECT external_id,client_state FROM tantu.provider_subscriptions WHERE kind='mail'")).rows[0]; const path = `/api/v1/provider-notifications/microsoft/${scope.workspaceId}/${scope.userId}/${connection}`;
    const validation = await f.app.inject({ method: "POST", url: path + "?validationToken=synthetic-token" }); assert.equal(validation.body, "synthetic-token"); assert.match(validation.headers["content-type"] ?? "", /text\/plain/);
    const payload = { value: [{ subscriptionId: subscription.external_id, clientState: "wrong", resource: "ignored", resourceData: { id: "ignored" } }] };
    assert.equal((await f.app.inject({ method: "POST", url: path, payload })).statusCode, 401);
    payload.value[0]!.clientState = subscription.client_state;
    assert.equal((await f.app.inject({ method: "POST", url: path, payload })).statusCode, 202); assert.equal((await f.app.inject({ method: "POST", url: path, payload })).statusCode, 202);
    assert.equal((await f.owner.query("SELECT count(*) FROM tantu.provider_notifications")).rows[0]?.count, "1"); assert.equal((await f.owner.query("SELECT count(*) FROM tantu_jobs.job WHERE name='provider-sync'")).rows[0]?.count, "1"); assert.equal((await f.owner.query("SELECT count(*) FROM tantu.provider_projections")).rows[0]?.count, "0");
    await f.owner.query("UPDATE tantu.provider_subscriptions SET expires_at=now()+interval '1 hour'"); await renewSubscriptions(service, scope, connection); assert.equal(renewals, 2);
    await f.owner.query("UPDATE tantu.provider_connections SET status='disconnected' WHERE id=$1", [connection]); assert.equal((await f.app.inject({ method: "POST", url: path, payload })).statusCode, 409);
  } finally { delete process.env.PROVIDER_NOTIFICATION_ORIGIN; await f.close(); }
});
