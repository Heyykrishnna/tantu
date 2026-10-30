import type { FastifyInstance } from "fastify";
import { object, uuid, workspaceParams } from "../schema.js";
import type { Identity } from "../../modules/workspace-access/service.js";
import type { Queue } from "../../workers/queue.js";
import { Failure } from "../../platform/failure.js";
import { sqlAdapter } from "../../platform/database/adapter.js";

export function operationalRoutes(app: FastifyInstance, identity: Identity, queue: Queue): void {
  app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/audit", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return identity.database.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      return { items: (await client.query("SELECT id,type,subject_id AS \"subjectId\",created_at AS \"createdAt\" FROM tantu.audit WHERE workspace_id=$1 AND (record_id IS NULL OR tantu.can_access(record_id)) ORDER BY created_at DESC,id LIMIT 50", [scope.workspaceId])).rows };
    });
  });
  app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/activity", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return identity.database.transaction(scope, async (client) => ({ items: (await client.query("SELECT id,type,record_id AS \"recordId\",record_version AS \"recordVersion\",created_at AS \"createdAt\",delivery_state AS \"deliveryState\" FROM tantu.events WHERE workspace_id=$1 AND (tantu.can_access(record_id) OR actor_id=$2) ORDER BY created_at DESC,id LIMIT 50", [scope.workspaceId, scope.userId])).rows }));
  });
  app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/operations", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return identity.database.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      const result = await client.query("SELECT j.id,j.name,j.state,j.retry_count AS attempts,j.created_on AS \"createdAt\",j.start_after AS \"availableAt\" FROM tantu_jobs.job j WHERE j.data->>'workspaceId'=$1 AND j.name IN ('canonical-events','file-scans','dead-letters') AND (j.data->>'userId'=$2 OR tantu.can_access((j.data->>'recordId')::uuid)) ORDER BY j.created_on DESC,j.id LIMIT 50", [scope.workspaceId, scope.userId]);
      return { items: result.rows };
    });
  });
  app.post<{ Params: { workspaceId: string; jobId: string }; Body: { action: "cancel" | "retry" } }>("/api/v1/workspaces/:workspaceId/jobs/:jobId", { schema: { params: object({ workspaceId: uuid, jobId: uuid }), body: object({ action: { enum: ["cancel", "retry"] } }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return identity.database.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      const result = await client.query<{ name: string; state: string }>("SELECT name,state FROM tantu_jobs.job WHERE id=$1 AND data->>'workspaceId'=$2 AND name IN ('canonical-events','file-scans') AND (data->>'userId'=$3 OR tantu.can_access((data->>'recordId')::uuid)) FOR UPDATE", [request.params.jobId, scope.workspaceId, scope.userId]);
      const job = result.rows[0];
      if (!job) throw new Failure(404, "NOT_FOUND", "Job is unavailable.");
      if (request.body.action === "retry" && job.state !== "failed") throw new Failure(409, "JOB_CONFLICT", "Only failed jobs can be retried.");
      if (request.body.action === "cancel" && !["created", "retry", "active"].includes(job.state)) throw new Failure(409, "JOB_CONFLICT", "This job can no longer be cancelled.");
      if (request.body.action === "cancel") await queue.boss.cancel(job.name, request.params.jobId, { db: sqlAdapter(client) });
      else await queue.boss.retry(job.name, request.params.jobId, { db: sqlAdapter(client) });
      return { accepted: true };
    });
  });
}
