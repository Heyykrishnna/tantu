import { draftSchema } from "./mail-contracts.js";
import { draftContent, attachments } from "./mail-content.js";
import type { DraftContent } from "./mail-content.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import { cookies } from "../workspace-access/service.js";
import { digest } from "../workspace-access/credentials.js";
import { change, receipt, versionConflict } from "../connected-work/change.js";
import type { Providers } from "./service.js";
import { executeSend, reconcileSend } from "./sending.js";
import { syncPage } from "./sync.js";
import type { Queue } from "../../workers/queue.js";
import { providerQueue } from "../../workers/queue.js";

const connectionParams = object({ workspaceId: uuid, connectionId: uuid });
export function providerRoutes(app: FastifyInstance, identity: Identity, providers: Providers, queue: Queue): void {
  const db = identity.database; const base = "/api/v1/workspaces/:workspaceId/providers";
  app.get<{ Params: { workspaceId: string } }>(base, { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => ({ configured: { google: !!providers.settings.registrations.google, microsoft: !!providers.settings.registrations.microsoft }, items: (await client.query('SELECT id,provider,address,status,version,scopes,retry_at AS "retryAt",last_synced_at AS "lastSyncedAt" FROM tantu.provider_connections ORDER BY id LIMIT 10')).rows }));
  });
  app.post<{ Params: { workspaceId: string; provider: "google" | "microsoft" } }>(base + "/:provider/connect", { schema: { params: object({ workspaceId: uuid, provider: { enum: ["google", "microsoft"] } }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return providers.begin(scope, request.params.provider, digest(cookies(request).get("tantu_session") ?? ""));
  });
  app.get<{ Params: { provider: "google" | "microsoft" }; Querystring: { state: string; code?: string; error?: string; error_description?: string; scope?: string; authuser?: string; prompt?: string; session_state?: string; iss?: string } }>("/api/v1/providers/:provider/callback", { schema: { params: object({ provider: { enum: ["google", "microsoft"] } }), querystring: object({ state: text(200), code: text(4096), error: text(200), error_description: text(1000), scope: text(2000), authuser: text(100), prompt: text(100), session_state: text(200), iss: text(500) }, ["state"]) } }, async (request, reply) => {
    const workspaceId = request.query.state.split(".")[0] ?? "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(workspaceId)) throw new Failure(400, "INVALID_CONSENT", "This consent request is invalid.");
    const scope = await identity.scope(request, workspaceId);
    const query = request.url.slice(request.url.indexOf("?"));
    await providers.complete(scope, request.params.provider, digest(cookies(request).get("tantu_session") ?? ""), query, request.query.state);
    reply.header("cache-control", "no-store"); reply.header("referrer-policy", "no-referrer"); return reply.redirect(providers.runtime.origin + `/?w=${scope.workspaceId}&view=mail`);
  });
  app.post<{ Params: { workspaceId: string; connectionId: string }; Body: { operationId: string; expectedVersion: number } }>(base + "/:connectionId/disconnect", { schema: { params: connectionParams, body: object({ operationId: uuid, expectedVersion: { type: "integer", minimum: 1 } }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "provider.disconnect", ...request.params, ...request.body }, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.provider_connections WHERE id=$1 FOR UPDATE", [request.params.connectionId])).rowCount) throw new Failure(404, "NOT_FOUND", "Connection is unavailable.");
    }, async (client) => {
      const result = (await client.query("UPDATE tantu.provider_connections SET status='disconnected',vault='{}',version=version+1 WHERE id=$1 AND version=$2 RETURNING id,version", [request.params.connectionId, request.body.expectedVersion])).rows[0];
      if (!result) versionConflict();
      await client.query("UPDATE tantu.send_intents SET state='cancelled' WHERE connection_id=$1 AND state='pending'", [request.params.connectionId]);
      await client.query("DELETE FROM tantu.provider_projections WHERE connection_id=$1", [request.params.connectionId]);
      await client.query("DELETE FROM tantu.provider_cursors WHERE connection_id=$1", [request.params.connectionId]);
      await client.query("UPDATE tantu.provider_effects SET state='cancelled' WHERE connection_id=$1 AND state='pending'",[request.params.connectionId]);
      for(const table of ["provider_folders","provider_folder_scans","provider_subscriptions","provider_notifications"]) await client.query(`DELETE FROM tantu.${table} WHERE connection_id=$1`,[request.params.connectionId]);
      return receipt(result);
    });
  });
  app.post<{ Params: { workspaceId: string; connectionId: string }; Body: { kind: "mail" | "calendar"; operationId: string } }>(base + "/:connectionId/sync", { schema: { params: connectionParams, body: object({ kind: { enum: ["mail", "calendar"] }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "provider.sync", ...request.params, ...request.body }, async (client) => { await providers.connection(client, request.params.connectionId); }, async (client) => {
      const id = randomUUID(); await queue.enqueue(client, providerQueue, id, { ...scope, recordId: request.params.connectionId, providerKind: request.body.kind }); return { id, version: 1 };
    });
  });
  app.get<{ Params: { workspaceId: string; connectionId: string }; Querystring: { kind: "mail" | "calendar"; cursor?: string; includeSnoozed?: string } }>(base + "/:connectionId/items", { schema: { params: connectionParams, querystring: object({ kind: { enum: ["mail", "calendar"] }, cursor: text(2048), includeSnoozed: { enum: ["true", "false"] } }, ["kind"]) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      await providers.connection(client, request.params.connectionId);
      const rows = (await client.query<{ external_id: string; data: unknown }>("SELECT external_id,data FROM tantu.provider_projections WHERE connection_id=$1 AND kind=$2 AND ($4::boolean OR NOT EXISTS(SELECT 1 FROM tantu.mail_preferences m WHERE m.connection_id=provider_projections.connection_id AND m.message_id=external_id AND m.snoozed_until>now() AND $2='mail')) AND ($3::text IS NULL OR external_id>$3) ORDER BY external_id LIMIT 26", [request.params.connectionId, request.query.kind, request.query.cursor ?? null, request.query.includeSnoozed === "true"])).rows;
      const checkpoint = (await client.query<{ coverage: string }>("SELECT coverage FROM tantu.provider_cursors WHERE connection_id=$1 AND kind=$2", [request.params.connectionId, request.query.kind])).rows[0];
      return { items: rows.slice(0, 25).map((row) => row.data), nextCursor: rows.length > 25 ? rows[24]?.external_id : null, coverage: checkpoint?.coverage ?? "Not synchronized" };
    });
  });
  app.get<{ Params: { workspaceId: string; connectionId: string } }>(base + "/:connectionId/drafts", { schema: { params: connectionParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => ({ items: (await client.query('SELECT id,recipients,subject,body,version,mode,source_id AS "sourceId",attachment_ids AS "attachmentIds" FROM tantu.mail_drafts WHERE connection_id=$1 ORDER BY id LIMIT 50', [request.params.connectionId])).rows }));
  });
  app.post<{ Params: { workspaceId: string; connectionId: string }; Body: DraftContent & { operationId: string } }>(base + "/:connectionId/drafts", { schema: { params: connectionParams, body: draftSchema } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "mail.draft", ...request.params, ...request.body }, async (client) => {
      await providers.connection(client, request.params.connectionId);
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.mail_drafts WHERE connection_id=$1", [request.params.connectionId])).rows[0]?.count) >= 1000) throw new Failure(409, "QUOTA_EXCEEDED", "Draft limit reached.");
    }, async client => {
      const account = await providers.connection(client, request.params.connectionId); const content = await draftContent(client, providers, account, request.body);
      return receipt((await client.query("INSERT INTO tantu.mail_drafts(workspace_id,connection_id,recipients,subject,body,mode,source_id,source_meta,attachment_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,version", [scope.workspaceId, account.id, content.recipients, content.subject, content.body, content.mode, content.sourceId, JSON.stringify(content.source), request.body.attachmentIds ?? []])).rows[0]);
    });
  });
  app.post<{ Params: { workspaceId: string; draftId: string }; Body: { expectedVersion: number } }>("/api/v1/workspaces/:workspaceId/mail/drafts/:draftId/review", { schema: { params: object({ workspaceId: uuid, draftId: uuid }), body: object({ expectedVersion: { type: "integer", minimum: 1 } }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return db.transaction(scope, async (client) => {
      const draft = (await client.query<{ id: string; version: number; connection_id: string; recipients: string[]; subject: string; body: string; attachment_ids: string[]; mode: string; source_id: string | null }>("SELECT * FROM tantu.mail_drafts WHERE id=$1 FOR UPDATE", [request.params.draftId])).rows[0];
      if (!draft) throw new Failure(404, "NOT_FOUND", "Draft is unavailable.");
      if (draft.version !== request.body.expectedVersion) versionConflict();
      const connection = await providers.connection(client, draft.connection_id);
      const canSend = connection.scopes.some((scope) => scope.toLowerCase() === "mail.send" || scope === "https://www.googleapis.com/auth/gmail.send" || scope === "https://mail.google.com/");
      if (!canSend) throw new Failure(403, "SEND_SCOPE_REQUIRED", "Reconnect this account with mail-send consent.");
      const files = await attachments(client, draft.attachment_ids, connection.provider);
      const review = (await client.query<{ id: string }>("INSERT INTO tantu.send_reviews(workspace_id,draft_id,connection_id,draft_version,connection_version,attachment_fingerprint) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [scope.workspaceId, draft.id, draft.connection_id, draft.version, connection.version, files.fingerprint])).rows[0];
      if (!review) throw new Error("Send review was not created.");
      return { id: review.id, from: connection.address, recipients: draft.recipients, subject: draft.subject, body: draft.body, attachments: files.items.map(({ id, name, bytes, version }) => ({ id, name, bytes, version })), mode: draft.mode, sourceId: draft.source_id, expiresInSeconds: 600 };
    });
  });
  app.post<{ Params: { workspaceId: string }; Body: { reviewId: string; operationId: string } }>("/api/v1/workspaces/:workspaceId/mail/sends", { schema: { params: workspaceParams, body: object({ reviewId: uuid, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "mail.send-intent", ...request.body }, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.send_reviews WHERE id=$1", [request.body.reviewId])).rowCount) throw new Failure(404, "NOT_FOUND", "Send review is unavailable.");
    }, async (client) => {
      const review = (await client.query<{ draft_id: string; connection_id: string; draft_version: number; connection_version: number }>("SELECT * FROM tantu.send_reviews WHERE id=$1 AND expires_at>now() FOR UPDATE", [request.body.reviewId])).rows[0];
      if (!review) throw new Failure(409, "REVIEW_EXPIRED", "Review the draft again before sending.");
      const currentDraft = (await client.query<{ version: number }>("SELECT version FROM tantu.mail_drafts WHERE id=$1 FOR UPDATE", [review.draft_id])).rows[0];
      if (!currentDraft || currentDraft.version !== review.draft_version) versionConflict();
      const connection = await providers.connection(client, review.connection_id);
      if (connection.version !== review.connection_version) versionConflict();
      const id = randomUUID(); await client.query("INSERT INTO tantu.send_intents(id,workspace_id,connection_id,draft_id,draft_version,review_id,message_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,'pending') ON CONFLICT(draft_id,draft_version) DO NOTHING", [id, scope.workspaceId, review.connection_id, review.draft_id, review.draft_version, request.body.reviewId, id + "@tantu.invalid"]);
      const intent = (await client.query<{ id: string }>("SELECT id FROM tantu.send_intents WHERE draft_id=$1 AND draft_version=$2", [review.draft_id, review.draft_version])).rows[0];
      if (!intent) throw new Error("Send intent was not created."); return { id: intent.id, version: 1 };
    });
  });
  app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/mail/sends", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => ({ items: (await client.query('SELECT id,draft_id AS "draftId",state,created_at AS "createdAt" FROM tantu.send_intents ORDER BY created_at DESC,id LIMIT 50')).rows }));
  });
  for (const action of ["execute", "reconcile"] as const) app.post<{ Params: { workspaceId: string; intentId: string } }>(`/api/v1/workspaces/:workspaceId/mail/sends/:intentId/${action}`, { schema: { params: object({ workspaceId: uuid, intentId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return action === "execute" ? executeSend(providers, scope, request.params.intentId) : reconcileSend(providers, scope, request.params.intentId);
  });
}
export async function processProviderSync(providers: Providers, queue: Queue, data: unknown): Promise<void> {
  if (typeof data !== "object" || data === null || !("workspaceId" in data) || typeof data.workspaceId !== "string" || !("userId" in data) || typeof data.userId !== "string" || !("recordId" in data) || typeof data.recordId !== "string" || !("providerKind" in data) || !(data.providerKind === "mail" || data.providerKind === "calendar")) throw new Error("Invalid provider job.");
  const scope = { workspaceId: data.workspaceId, userId: data.userId };
  const recordId = data.recordId; const providerKind = data.providerKind;
  const result = await syncPage(providers, scope, recordId, providerKind);
  if (["failed", "throttled"].includes(result.state)) throw new Error("Provider synchronization requires retry or renewed consent.");
  if (["pending", "rebuilding"].includes(result.state)) await providers.database.transaction(scope, async (client) => { await providers.connection(client, recordId); await queue.enqueue(client, providerQueue, randomUUID(), { ...scope, recordId, providerKind }); });
}
