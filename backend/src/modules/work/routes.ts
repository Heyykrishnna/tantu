import type { FastifyInstance } from "fastify";
import { object, text, uuid } from "../../http/schema.js";
import type { Identity } from "../identity/service.js";
import type { Records } from "./service.js";
import { createSchema, deleteSchema, recordColumns, recordParams, updateSchema } from "./contracts.js";
import type { CanonicalRecord, RecordInput } from "./contracts.js";
import { Failure } from "../../platform/failure.js";

export function recordRoutes(app: FastifyInstance, identity: Identity, records: Records): void {
  const db = identity.database;
  for (const [plural, kind] of [["tasks", "task"], ["pages", "page"]] as const) {
    const base = `/api/v1/workspaces/:workspaceId/${plural}`;
    app.get<{ Params: { workspaceId: string }; Querystring: { cursor?: string; limit?: string; q?: string } }>(base, { schema: { params: object({ workspaceId: uuid }), querystring: object({ cursor: uuid, limit: { type: "string", pattern: "^(?:[1-9]|[1-4][0-9]|50)$" }, q: text(100) }, []) } }, async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      const limit = Number(request.query.limit ?? "25");
      return db.transaction(scope, async (client) => {
        const result = await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE kind=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3::text IS NULL OR strpos(lower(title),lower($3))>0) ORDER BY id LIMIT $4`, [kind, request.query.cursor ?? null, request.query.q ?? null, limit + 1]);
        const items = result.rows.slice(0, limit);
        return { items, nextCursor: result.rows.length > limit ? items.at(-1)?.id ?? null : null };
      });
    });
    app.post<{ Params: { workspaceId: string }; Body: RecordInput & { operationId: string } }>(base, { schema: { params: object({ workspaceId: uuid }), body: createSchema } }, async (request, reply) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return reply.code(201).send(await records.mutate(scope, kind, request.body.operationId, request.body));
    });
    app.get<{ Params: { workspaceId: string; recordId: string } }>(base + "/:recordId", { schema: { params: recordParams } }, async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const result = await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE id=$1 AND kind=$2`, [request.params.recordId, kind]);
        const row = result.rows[0];
        if (!row) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
        return row;
      });
    });
    app.patch<{ Params: { workspaceId: string; recordId: string }; Body: RecordInput & { operationId: string; expectedVersion: number } }>(base + "/:recordId", { schema: { params: recordParams, body: updateSchema } }, async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return records.mutate(scope, kind, request.body.operationId, request.body, request.params.recordId, request.body.expectedVersion);
    });
    app.delete<{ Params: { workspaceId: string; recordId: string }; Body: { operationId: string; expectedVersion: number } }>(base + "/:recordId", { schema: { params: recordParams, body: deleteSchema } }, async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return records.mutate(scope, kind, request.body.operationId, undefined, request.params.recordId, request.body.expectedVersion);
    });
    app.get<{ Params: { workspaceId: string; recordId: string } }>(base + "/:recordId/history", { schema: { params: recordParams } }, async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND kind=$2", [request.params.recordId, kind])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
        return { items: (await client.query("SELECT version,created_at AS \"createdAt\" FROM tantu.revisions WHERE record_id=$1 ORDER BY version DESC LIMIT 50", [request.params.recordId])).rows };
      });
    });
  }
}
