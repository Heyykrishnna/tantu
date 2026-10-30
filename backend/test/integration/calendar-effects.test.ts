import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture } from "./support.js";
import { Providers } from "../../src/modules/providers/service.js";
import { ProviderHttp } from "../../src/modules/providers/http.js";
import { seal } from "../../src/modules/providers/vault.js";
import { executeCalendarEffect } from "../../src/modules/providers/calendar-effects.js";
test("calendar writes bind current reviews, use ETags and fence unknown outcomes", { timeout: 60000 }, async () => {
    const key = randomBytes(32); let service: Providers | undefined; let writes = 0; let loseResponse = true; let etag = "r1";
    const f = await fixture({}, (database, settings) => { service = new Providers(database, settings, { key, registrations: {} }, new ProviderHttp(async (input, options) => { if (options?.method !== "GET") { writes++; if (loseResponse) throw new TypeError("Synthetic response lost"); assert.equal(new Headers(options?.headers).get("if-match"), "r1"); return new Response(JSON.stringify({ id: "existing", etag: "r2" })); } return new Response(JSON.stringify({ id: String(input).split("/").at(-1), etag, summary: "Existing", start: { date: "2026-11-01" }, end: { date: "2026-11-02" }, attendees: [] })); })); return service; });
    try {
        if (!service) throw new Error("Missing fixture provider."); const owner = await f.account("calendar-effects@example.test"); const scope = { workspaceId: owner.workspaceId, userId: owner.userId }; const connectionId = randomUUID(); await f.owner.query("INSERT INTO tantu.provider_connections(id,workspace_id,user_id,provider,subject,address,vault,scopes,expires_at) VALUES($1,$2,$3,'google','calendar-fixture','calendar@example.test',$4,$5,now()+interval '1 hour')", [connectionId, scope.workspaceId, scope.userId, JSON.stringify(seal({ access_token: "fixture" }, key, "connection:" + connectionId)), ["https://www.googleapis.com/auth/calendar.events"]]); const base = `/api/v1/workspaces/${scope.workspaceId}/providers/${connectionId}/calendar`; const post = (suffix: string, payload: object) => f.app.inject({ method: "POST", url: base + suffix, headers: owner.headers, payload });
        const edit = { action: "create", externalId: null, etag: null, scope: "single", title: "Reviewed", start: "2026-11-01", end: "2026-11-02", timezone: "Asia/Kolkata", allDay: true, attendees: [], frequency: "none", count: 1, interval: 1 };
        const review = await post("/review", edit); assert.equal(review.statusCode, 200, review.body); const applied = await post("/apply", { reviewId: review.json<{ id: string }>().id, operationId: randomUUID() }); assert.equal(applied.statusCode, 200, applied.body); const id = applied.json<{ id: string }>().id;
        assert.equal((await executeCalendarEffect(service, scope, id)).state, "unknown"); assert.equal((await executeCalendarEffect(service, scope, id)).state, "unknown"); assert.equal(writes, 1);
        const reconciled = await post(`/${id}/reconcile`, {}); assert.equal(reconciled.json<{ state: string }>().state, "confirmed", reconciled.body); assert.equal(writes, 1);
        etag = "r2"; const stale = await post("/review", { ...edit, action: "update", externalId: "existing", etag: "r1" }); assert.equal(stale.statusCode, 409, stale.body);
        etag = "r1"; loseResponse = false; const update = await post("/review", { ...edit, action: "update", externalId: "existing", etag: "r1" }); const intent = await post("/apply", { reviewId: update.json<{ id: string }>().id, operationId: randomUUID() }); assert.equal((await executeCalendarEffect(service, scope, intent.json<{ id: string }>().id)).state, "confirmed"); assert.equal(writes, 2);
    } finally { await f.close(); }
});
