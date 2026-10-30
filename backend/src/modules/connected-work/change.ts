import type { PoolClient } from "pg";
import type { Database, Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import { digest } from "../workspace-access/credentials.js";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
export interface Receipt { id: string; version: number }
export function receipt(value: unknown): Receipt {
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string" || !("version" in value) || typeof value.version !== "number" || !Number.isSafeInteger(value.version)) throw new Error("Invalid operation receipt.");
  return { id: value.id, version: value.version };
}
export async function change(database: Database, scope: Scope, operationId: string, payload: unknown, authorize: (client: PoolClient) => Promise<void>, apply: (client: PoolClient) => Promise<Receipt>): Promise<Receipt> {
  return database.transaction(scope, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,79))", [scope.workspaceId + scope.userId + operationId]);
    if (!(await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId])).rowCount) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
    await authorize(client);
    const fingerprint = digest(canonical(payload));
    const previous = (await client.query<{ digest: string; result: unknown }>("SELECT digest,result FROM tantu.connected_operations WHERE workspace_id=$1 AND user_id=$2 AND operation_id=$3", [scope.workspaceId, scope.userId, operationId])).rows[0];
    if (previous) {
      if (previous.digest !== fingerprint) throw new Failure(409, "OPERATION_CONFLICT", "This operation key was used for different content.");
      return receipt(previous.result);
    }
    const result = await apply(client);
    await client.query("INSERT INTO tantu.connected_operations(workspace_id,user_id,operation_id,digest,result) VALUES($1,$2,$3,$4,$5)", [scope.workspaceId, scope.userId, operationId, fingerprint, JSON.stringify(result)]);
    return result;
  });
}
export async function editableTask(client: PoolClient, id: string): Promise<void> {
  if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND kind='task' AND tantu.can_access(id,true) FOR UPDATE", [id])).rowCount) throw new Failure(404, "NOT_FOUND", "Task is unavailable.");
}
export function versionConflict(): never { throw new Failure(409, "VERSION_CONFLICT", "This item changed. Reload and review before applying your edit."); }
