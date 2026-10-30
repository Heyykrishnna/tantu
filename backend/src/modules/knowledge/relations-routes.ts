import { insertDocument } from "./rich-text.js";
import type { FastifyInstance } from "fastify";
import { object, text, uuid } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type { Records } from "../work-management/service.js";
import type { CanonicalRecord } from "../work-management/contracts.js";
import { change, receipt, versionConflict } from "../connected-work/change.js";
import { hydrate, pageDocument, persistDocument } from "./collaboration.js";

const params = object({ workspaceId: uuid, recordId: uuid });
export function relationRoutes(app: FastifyInstance, identity: Identity, records: Records): void {
  const db = identity.database; const base = "/api/v1/workspaces/:workspaceId/records/:recordId";
  app.get<{ Params: { workspaceId: string; recordId: string } }>(base + "/context", { schema: { params } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1", [request.params.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
      return { relations: (await client.query('SELECT e.source_id AS "sourceId",e.target_id AS "targetId",e.type,r.title,r.kind FROM tantu.record_relations e JOIN tantu.records r ON r.id=CASE WHEN e.source_id=$1 THEN e.target_id ELSE e.source_id END WHERE (e.source_id=$1 OR e.target_id=$1) ORDER BY e.source_id,e.target_id,e.type LIMIT 100', [request.params.recordId])).rows, comments: (await client.query('SELECT c.id,c.body,c.author_id AS "authorId",u.display_name AS author,c.created_at AS "createdAt" FROM tantu.record_comments c JOIN tantu.users u ON u.id=c.author_id WHERE c.record_id=$1 ORDER BY c.created_at DESC,c.id LIMIT 50', [request.params.recordId])).rows };
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { targetId: string; type: "related" | "source" | "blocks"; linked: boolean; operationId: string } }>(base + "/relations", { schema: { params, body: object({ targetId: uuid, type: { enum: ["related", "source", "blocks"] }, linked: { type: "boolean" }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    if (request.params.recordId === request.body.targetId) throw new Failure(400, "INVALID_RELATION", "Choose a different source record.");
    return change(db, scope, request.body.operationId, { command: "record.relation", ...request.params, ...request.body }, async (client) => {
      for (const id of [request.params.recordId, request.body.targetId].sort()) if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND tantu.can_access(id,true) FOR UPDATE", [id])).rowCount) throw new Failure(404, "NOT_FOUND", "An endpoint is unavailable.");
    }, async (client) => {
      if (request.body.linked) await client.query("INSERT INTO tantu.record_relations VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [scope.workspaceId, request.params.recordId, request.body.targetId, request.body.type]);
      else await client.query("DELETE FROM tantu.record_relations WHERE source_id=$1 AND target_id=$2 AND type=$3", [request.params.recordId, request.body.targetId, request.body.type]);
      return { id: request.params.recordId, version: 1 };
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { body: string; mentions: string[]; operationId: string } }>(base + "/comments", { schema: { params, body: object({ body: { ...text(4000), pattern: "\\S" }, mentions: { type: "array", maxItems: 20, uniqueItems: true, items: uuid }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { command: "record.comment", ...request.params, ...request.body }, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND tantu.can_access(id,true) FOR UPDATE", [request.params.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
      for (const id of request.body.mentions) if (!(await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active AND tantu.can_access_as($3,$2) FOR SHARE", [scope.workspaceId, id, request.params.recordId])).rowCount) throw new Failure(400, "MENTION_UNAVAILABLE", "A mentioned person cannot currently access this record.");
    }, async (client) => {
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.record_comments WHERE record_id=$1", [request.params.recordId])).rows[0]?.count) >= 1000) throw new Failure(409, "QUOTA_EXCEEDED", "Comment limit reached.");
      return receipt((await client.query("INSERT INTO tantu.record_comments(workspace_id,record_id,author_id,body,mentions) VALUES($1,$2,$3,$4,$5) RETURNING id,1 AS version", [scope.workspaceId, request.params.recordId, scope.userId, request.body.body.trim(), request.body.mentions])).rows[0]);
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { title: string; operationId: string } }>(base + "/duplicate-page", { schema: { params, body: object({ title: { ...text(200), pattern: "\\S" }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { command: "page.duplicate", ...request.params, ...request.body }, async (client) => { await pageDocument(client, request.params.recordId, false); }, async (client) => {
      const { record } = await pageDocument(client, request.params.recordId, false);
      const result = await records.mutateIn(client, scope, "page", request.body.operationId, { title: request.body.title, body: record.body, visibility: "private" }); return { id: result.id, version: 1 };
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { revision: number; expectedVersion: number; operationId: string } }>(base + "/restore-body", { schema: { params, body: object({ revision: { type: "integer", minimum: 1 }, expectedVersion: { type: "integer", minimum: 1 }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { command: "page.restore-body", ...request.params, ...request.body }, async (client) => { await pageDocument(client, request.params.recordId, true); }, async (client) => {
      const { record, state } = await pageDocument(client, request.params.recordId, true); if (record.version !== request.body.expectedVersion) versionConflict();
      const revision = (await client.query<{ snapshot: CanonicalRecord }>("SELECT snapshot FROM tantu.revisions WHERE record_id=$1 AND version=$2", [record.id, request.body.revision])).rows[0];
      if (!revision) throw new Failure(404, "NOT_FOUND", "Revision is unavailable.");
      const doc = hydrate(record.body, state);
      try { doc.transact(() => { const text = doc.getText("body"); text.delete(0, text.length); insertDocument(text,revision.snapshot.body); }); return await persistDocument(client, scope, records, record, doc); }
      finally { doc.destroy(); }
    });
  });
}
