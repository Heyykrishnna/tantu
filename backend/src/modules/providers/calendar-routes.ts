import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { object, text, email, uuid } from "../../http/schema.js";
import type { Identity } from "../workspace-access/service.js";
import type { Providers } from "./service.js";
import type { Queue } from "../../workers/queue.js";
import { effectQueue } from "../../workers/queue.js";
import { change } from "../connected-work/change.js";
import { Failure } from "../../platform/failure.js";
import { object as valueObject } from "../../platform/value.js";
import { calendarEdit, eventPath, executeCalendarEffect } from "./calendar-effects.js";
import type { CalendarEdit } from "./calendar-effects.js";
import { reconcileCalendarEffect } from "./calendar-reconciliation.js";
export function calendarEffectRoutes(app: FastifyInstance, identity: Identity, providers: Providers, queue: Queue): void {
    const base = "/api/v1/workspaces/:workspaceId/providers/:connectionId/calendar"; const params = object({ workspaceId: uuid, connectionId: uuid });
    app.post<{ Params: { workspaceId: string; connectionId: string }; Body: CalendarEdit }>(base + "/review", { schema: { params, body: object({ action: { enum: ["create", "update", "delete"] }, externalId: { anyOf: [text(1024), { type: "null" }] }, etag: { anyOf: [text(1024), { type: "null" }] }, scope: { enum: ["single", "occurrence", "series"] }, title: text(200), start: text(40), end: text(40), timezone: text(100), allDay: { type: "boolean" }, attendees: { type: "array", maxItems: 20, uniqueItems: true, items: email }, frequency: { enum: ["none", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] }, count: { type: "integer", minimum: 1, maximum: 1000 }, interval: { type: "integer", minimum: 1, maximum: 366 } }) } }, async request => {
        const scope = await identity.scope(request, request.params.workspaceId, true); const input = calendarEdit(request.body);
        return identity.database.transaction(scope, async client => {
            const account = await providers.connection(client, request.params.connectionId); if (!account.scopes.some(scope => scope.toLowerCase() === "calendars.readwrite" || scope === "https://www.googleapis.com/auth/calendar.events" || scope === "https://www.googleapis.com/auth/calendar")) throw new Failure(403, "CALENDAR_SCOPE_REQUIRED", "Reconnect with calendar-write consent.");
            let current: Record<string, unknown> | null = null; if (input.action !== "create") {
                const token = await providers.access(client, account); current = valueObject(await providers.http.request(account.provider, token, eventPath(account.provider, input.externalId ?? undefined)));
                if (input.scope === "series") { const series = current.recurringEventId ?? current.seriesMasterId; if (typeof series === "string") { input.externalId = series; current = valueObject(await providers.http.request(account.provider, token, eventPath(account.provider, series))); } }
                if (input.scope !== "series" && (current.type === "seriesMaster" || Array.isArray(current.recurrence) && current.recurrence.length)) throw new Failure(400, "SERIES_REVIEW_REQUIRED", "Select series scope to edit a recurring series master.");
                const etag = current.etag ?? current["@odata.etag"]; if (typeof etag !== "string") throw new Failure(409, "PROVIDER_VERSION_UNAVAILABLE", "The provider omitted a conditional-write revision."); if (input.etag && input.etag !== etag) throw new Failure(409, "VERSION_CONFLICT", "The event changed at its provider. Review its latest version."); input.etag = etag;
            }
            const row = (await client.query<{ id: string }>("INSERT INTO tantu.provider_effect_reviews(workspace_id,connection_id,connection_version,request) VALUES($1,$2,$3,$4) RETURNING id", [scope.workspaceId, account.id, account.version, JSON.stringify(input)])).rows[0]; if (!row) throw new Error("Calendar review missing."); return { id: row.id, request: input, current, notifications: "Provider attendee notifications are included. Task deadlines and local work blocks are unchanged.", expiresInSeconds: 600 };
        });
    });
    app.post<{ Params: { workspaceId: string; connectionId: string }; Body: { reviewId: string; operationId: string } }>(base + "/apply", { schema: { params, body: object({ reviewId: uuid, operationId: uuid }) } }, async request => {
        const scope = await identity.scope(request, request.params.workspaceId, true); return change(identity.database, scope, request.body.operationId, { command: "calendar.effect", ...request.params, ...request.body }, async client => { await providers.connection(client, request.params.connectionId); }, async client => {
            const review = (await client.query<{ connection_version: number }>("SELECT connection_version FROM tantu.provider_effect_reviews WHERE id=$1 AND connection_id=$2 AND expires_at>now() AND request->>'kind' IS DISTINCT FROM 'mail' FOR UPDATE", [request.body.reviewId, request.params.connectionId])).rows[0]; const account = await providers.connection(client, request.params.connectionId); if (!review || review.connection_version !== account.version) throw new Failure(409, "REVIEW_EXPIRED", "Create a fresh calendar review.");
            const candidate = randomUUID(); await client.query("INSERT INTO tantu.provider_effects(id,workspace_id,connection_id,review_id) VALUES($1,$2,$3,$4) ON CONFLICT(review_id) DO NOTHING", [candidate, scope.workspaceId, account.id, request.body.reviewId]); const id = (await client.query<{ id: string }>("SELECT id FROM tantu.provider_effects WHERE review_id=$1", [request.body.reviewId])).rows[0]?.id; if (!id) throw new Error("Calendar intent missing."); await queue.enqueue(client, effectQueue, id, { ...scope, recordId: account.id, effectId: id }); return { id, version: 1 };
        });
    });
    app.get<{ Params: { workspaceId: string; connectionId: string } }>(base + "/operations", { schema: { params } }, async request => { const scope = await identity.scope(request, request.params.workspaceId); return identity.database.transaction(scope, async client => ({ items: (await client.query("SELECT id,state,provider_id AS \"providerId\",created_at AS \"createdAt\" FROM tantu.provider_effects WHERE connection_id=$1 AND review_id IN(SELECT id FROM tantu.provider_effect_reviews WHERE request->>'kind' IS DISTINCT FROM 'mail') ORDER BY created_at DESC,id LIMIT 50", [request.params.connectionId])).rows })); });
    for (const action of ["execute", "reconcile"] as const) app.post<{ Params: { workspaceId: string; connectionId: string; effectId: string } }>(base + "/:effectId/" + action, { schema: { params: object({ workspaceId: uuid, connectionId: uuid, effectId: uuid }) } }, async request => {
        const scope = await identity.scope(request, request.params.workspaceId, true); if (action === "execute") { if (!(await identity.database.transaction(scope, client => client.query("SELECT id FROM tantu.provider_effects WHERE id=$1 AND connection_id=$2 AND review_id IN(SELECT id FROM tantu.provider_effect_reviews WHERE request->>'kind' IS DISTINCT FROM 'mail')", [request.params.effectId, request.params.connectionId]))).rowCount) throw new Failure(404, "NOT_FOUND", "Calendar operation unavailable."); return executeCalendarEffect(providers, scope, request.params.effectId); }
        return reconcileCalendarEffect(providers,scope,request.params.connectionId,request.params.effectId);
    });
}
