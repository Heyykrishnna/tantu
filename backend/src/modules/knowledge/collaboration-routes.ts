import * as Y from "yjs";
import type { FastifyInstance } from "fastify";
import { object, text, uuid } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type { Records } from "../work-management/service.js";
import { change } from "../connected-work/change.js";
import { hydrate, pageDocument, persistDocument, updateBytes } from "./collaboration.js";

export function collaborationRoutes(app: FastifyInstance, identity: Identity, records: Records): void {
  const base = "/api/v1/workspaces/:workspaceId/pages/:recordId/collaboration"; const params = object({ workspaceId: uuid, recordId: uuid });
  app.get<{ Params: { workspaceId: string; recordId: string } }>(base, { schema: { params } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return identity.database.transaction(scope, async (client) => {
      let source = await pageDocument(client, request.params.recordId, false);
      if (!source.state && source.record.canEdit) {
        source = await pageDocument(client, request.params.recordId, true);
        if (!source.state) { const initial = hydrate(source.record.body, null); try { await client.query("INSERT INTO tantu.page_collaboration(workspace_id,record_id,state,version) VALUES($1,$2,$3,$4)", [scope.workspaceId, source.record.id, Buffer.from(Y.encodeStateAsUpdate(initial)), source.record.version]); source.state = Buffer.from(Y.encodeStateAsUpdate(initial)); } finally { initial.destroy(); } }
      }
      const { record, state } = source; const doc = hydrate(record.body, state);
      try { return { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"), version: record.version, canEdit: record.canEdit, presence: (await client.query('SELECT p.user_id AS "userId",u.display_name AS name FROM tantu.page_presence p JOIN tantu.users u ON u.id=p.user_id WHERE p.record_id=$1 AND p.expires_at>now() ORDER BY p.user_id LIMIT 50', [record.id])).rows }; }
      finally { doc.destroy(); }
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { operationId: string; update: string } }>(base, { schema: { params, body: object({ operationId: uuid, update: text(180000) }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true); const bytes = updateBytes(request.body.update);
    return change(identity.database, scope, request.body.operationId, { command: "page.collaboration", ...request.params, ...request.body }, async (client) => { await pageDocument(client, request.params.recordId, true); }, async (client) => {
      const { record, state } = await pageDocument(client, request.params.recordId, true); const doc = hydrate(record.body, state);
      try {
        try { Y.applyUpdate(doc, bytes); } catch { throw new Failure(400, "INVALID_UPDATE", "The collaborative update could not be decoded. Your local draft is preserved."); }
        const result = await persistDocument(client, scope, records, record, doc);
        await client.query("INSERT INTO tantu.page_presence(workspace_id,record_id,user_id) VALUES($1,$2,$3) ON CONFLICT(record_id,user_id) DO UPDATE SET expires_at=now()+interval '30 seconds'", [scope.workspaceId, record.id, scope.userId]); return result;
      } finally { doc.destroy(); }
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string } }>(base + "/presence", { schema: { params } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return identity.database.transaction(scope, async (client) => { await pageDocument(client, request.params.recordId, false); await client.query("INSERT INTO tantu.page_presence(workspace_id,record_id,user_id) VALUES($1,$2,$3) ON CONFLICT(record_id,user_id) DO UPDATE SET expires_at=now()+interval '30 seconds'", [scope.workspaceId, request.params.recordId, scope.userId]); return { ok: true }; });
  });
}
