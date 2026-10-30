import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { object, text, uuid } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import { fileColumns } from "./service.js";
import type { FileMetadata, Files, Upload } from "./service.js";
import { scanQueue } from "../../workers/queue.js";

export function fileRoutes(app: FastifyInstance, identity: Identity, files: Files): void {
  const db = identity.database;
  const base = "/api/v1/workspaces/:workspaceId/records/:recordId/files";
  const params = object({ workspaceId: uuid, recordId: uuid });
  const fileParams = object({ workspaceId: uuid, recordId: uuid, fileId: uuid });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: Upload }>(base, { bodyLimit: 7_100_000, schema: { params, body: object({ operationId: uuid, name: { ...text(200), pattern: "^[^\\x00-\\x1f/\\\\]+$" }, mediaType: { enum: ["text/plain", "application/pdf", "application/octet-stream"] }, content: text(6_990_508) }) } }, async (request, reply) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return reply.code(201).send(await files.upload(scope, request.params.recordId, request.body));
  });
  app.get<{ Params: { workspaceId: string; recordId: string } }>(base, { schema: { params } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1", [request.params.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
      return { items: (await client.query<FileMetadata>(`SELECT ${fileColumns} FROM tantu.files WHERE record_id=$1 AND state<>'deleted' ORDER BY id LIMIT 100`, [request.params.recordId])).rows };
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string; fileId: string } }>(base + "/:fileId/access", { schema: { params: fileParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return db.transaction(scope, async (client) => {
      const result = await client.query<FileMetadata>(`SELECT ${fileColumns} FROM tantu.files WHERE id=$1 AND record_id=$2 AND state='clean'`, [request.params.fileId, request.params.recordId]);
      const file = result.rows[0];
      if (!file) throw new Failure(404, "FILE_UNAVAILABLE", "File is unavailable or has not passed scanning.");
      return { token: files.signature(scope, file), expiresInSeconds: 60 };
    });
  });
  app.get<{ Params: { workspaceId: string; recordId: string; fileId: string }; Querystring: { token: string } }>(base + "/:fileId/content", { schema: { params: fileParams, querystring: object({ token: text(100) }) } }, async (request, reply) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    const file = await db.transaction(scope, async (client) => {
      const result = await client.query<FileMetadata>(`SELECT ${fileColumns} FROM tantu.files WHERE id=$1 AND record_id=$2 AND state='clean'`, [request.params.fileId, request.params.recordId]);
      const metadata = result.rows[0];
      if (!metadata || !files.verify(scope, metadata, request.query.token)) throw new Failure(404, "FILE_UNAVAILABLE", "File access is unavailable or expired.");
      return metadata;
    });
    const bytes = await files.store.read(file.id);
    reply.header("content-type", "application/octet-stream").header("content-disposition", `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name)}`).header("content-security-policy", "default-src 'none'; sandbox");
    return reply.send(bytes);
  });
  app.delete<{ Params: { workspaceId: string; recordId: string; fileId: string } }>(base + "/:fileId", { schema: { params: fileParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    await db.transaction(scope, async (client) => {
      const result = await client.query("UPDATE tantu.files SET state='deleted',version=version+1 WHERE id=$1 AND record_id=$2 RETURNING id", [request.params.fileId, request.params.recordId]);
      if (!result.rowCount) throw new Failure(404, "NOT_FOUND", "File is unavailable.");
      await client.query("INSERT INTO tantu.deletions(file_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [request.params.fileId, scope.workspaceId]);
      await files.queue.enqueue(client, scanQueue, randomUUID(), { ...scope, recordId: request.params.recordId, fileId: request.params.fileId });
    });
    return { deleted: true };
  });
  app.post<{ Params: { workspaceId: string; recordId: string; fileId: string } }>(base + "/:fileId/rescan", { schema: { params: fileParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    await db.transaction(scope, async (client) => {
      const updated = await client.query("UPDATE tantu.files SET state='pending',version=version+1 WHERE id=$1 AND record_id=$2 AND state='unavailable' RETURNING id", [request.params.fileId, request.params.recordId]);
      if (!updated.rowCount) throw new Failure(409, "RESCAN_UNAVAILABLE", "Only an unavailable scan can be retried.");
      await files.queue.enqueue(client, scanQueue, randomUUID(), { ...scope, recordId: request.params.recordId, fileId: request.params.fileId });
    });
    return { pending: true };
  });
}
