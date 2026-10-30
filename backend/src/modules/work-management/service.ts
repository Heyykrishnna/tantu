import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type { Database, Scope } from "../../platform/database/database.js";
import type { Queue } from "../../workers/queue.js";
import { eventQueue } from "../../workers/queue.js";
import { Failure } from "../../platform/failure.js";
import { digest } from "../workspace-access/credentials.js";
import { recordColumns } from "./contracts.js";
import type { CanonicalRecord, RecordInput } from "./contracts.js";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && value !== null) return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

export class Records {
  constructor(readonly database: Database, readonly queue: Queue) {}

  async mutate(scope: Scope, kind: "task" | "page", operationId: string, input: RecordInput | undefined, recordId?: string, expectedVersion?: number): Promise<CanonicalRecord | { deleted: true; id: string }> {
    return this.database.transaction(scope, (client) => this.mutateIn(client, scope, kind, operationId, input, recordId, expectedVersion));
  }

  async mutateIn(client: PoolClient, scope: Scope, kind: "task" | "page", operationId: string, input: RecordInput | undefined, recordId?: string, expectedVersion?: number): Promise<CanonicalRecord | { deleted: true; id: string }> {
    const fingerprint = digest(canonical({ kind, input: input ?? null, recordId: recordId ?? null, expectedVersion: expectedVersion ?? null }));
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [scope.workspaceId + scope.userId + operationId]);
      const member = await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId]);
      if (!member.rowCount) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
      const previous = await client.query<{ digest: string; record_id: string; result: CanonicalRecord | { deleted: true; id: string } }>("SELECT digest,record_id,result FROM tantu.operations WHERE workspace_id=$1 AND user_id=$2 AND operation_id=$3", [scope.workspaceId, scope.userId, operationId]);
      const replay = previous.rows[0];
      if (replay) {
        if (replay.digest !== fingerprint) throw new Failure(409, "OPERATION_CONFLICT", "This operation key was already used for different content.");
        if (!("deleted" in replay.result) && !(await client.query("SELECT id FROM tantu.records WHERE id=$1", [replay.record_id])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
        return replay.result;
      }
      let result: CanonicalRecord | { deleted: true; id: string };
      let version: number;
      if (!recordId) {
        if (!input) throw new Error("Record input is required.");
        if (!(await client.query("UPDATE tantu.workspaces SET record_count=record_count+1 WHERE id=$1 AND record_count<10000 RETURNING id", [scope.workspaceId])).rowCount) throw new Failure(409, "QUOTA_EXCEEDED", "Workspace record limit reached.");
        if (input.parentId) {
          const parent = await client.query("SELECT id FROM tantu.records WHERE id=$1 AND kind='page' AND tantu.can_access(id,true)", [input.parentId]);
          if (!parent.rowCount) throw new Failure(404, "NOT_FOUND", "Parent page is unavailable.");
        }
        const created = await client.query<CanonicalRecord>(`INSERT INTO tantu.records(workspace_id,owner_id,kind,title,visibility,parent_id,body,status,priority,deadline,estimate_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${recordColumns}`, [scope.workspaceId, scope.userId, kind, input.title.trim(), input.visibility ?? "private", input.parentId ?? null, JSON.stringify(input.body ?? { type: "doc", content: [] }), input.status ?? "open", input.priority ?? "normal", input.deadline ?? null, input.estimateMinutes ?? null]);
        const row = created.rows[0];
        if (!row) throw new Error("Record was not created.");
        result = row;
        version = row.version;
      } else {
        const existing = await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE id=$1 AND kind=$2 AND tantu.can_access(id,true) FOR UPDATE`, [recordId, kind]);
        const current = existing.rows[0];
        if (!current) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
        if (current.version !== expectedVersion) throw new Failure(409, "VERSION_CONFLICT", "This record changed. Reload before applying your edit.");
        if (input && input.parentId !== undefined && input.parentId !== current.parentId) throw new Failure(400, "PARENT_IMMUTABLE", "Create a page under its intended parent; moving subtrees requires a separate reviewed operation.");
        if (input?.visibility !== undefined && input.visibility !== current.visibility && current.ownerId !== scope.userId) throw new Failure(403, "FORBIDDEN", "Only the record owner can change visibility.");
        version = current.version + 1;
        if (!input) {
          await client.query("UPDATE tantu.records SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1", [recordId]);
          result = { deleted: true, id: recordId };
        } else {
          const updated = await client.query<CanonicalRecord>(`UPDATE tantu.records SET title=$2,visibility=$3,body=$4,status=$5,priority=$6,deadline=$7,estimate_minutes=$8,version=version+1,updated_at=now() WHERE id=$1 RETURNING ${recordColumns}`, [recordId, input.title.trim(), input.visibility ?? current.visibility, JSON.stringify(input.body ?? current.body), input.status ?? current.status, input.priority ?? current.priority, input.deadline === undefined ? current.deadline : input.deadline, input.estimateMinutes === undefined ? current.estimateMinutes : input.estimateMinutes]);
          const row = updated.rows[0];
          if (!row) throw new Error("Record was not updated.");
          result = row;
        }
      }
      const eventId = randomUUID();
      const id = result.id;
      await client.query("INSERT INTO tantu.operations(workspace_id,user_id,operation_id,digest,record_id,result) VALUES($1,$2,$3,$4,$5,$6)", [scope.workspaceId, scope.userId, operationId, fingerprint, id, JSON.stringify(result)]);
      await client.query("INSERT INTO tantu.events(id,workspace_id,actor_id,record_id,type,record_version,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [eventId, scope.workspaceId, scope.userId, id, `${kind}.${!input ? "deleted" : recordId ? "updated" : "created"}`, version, operationId]);
      if (input) await client.query("INSERT INTO tantu.revisions(record_id,version,workspace_id,snapshot) VALUES($1,$2,$3,$4)", [id, version, scope.workspaceId, JSON.stringify(result)]);
      await this.queue.enqueue(client, eventQueue, eventId, { ...scope, recordId: id });
      return result;
  }
}
