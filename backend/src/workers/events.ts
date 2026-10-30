import type { PoolClient } from "pg";

export interface JobScope { workspaceId: string; userId: string; recordId: string; fileId?: string }

export function jobScope(data: unknown): JobScope {
  if (typeof data !== "object" || data === null || !("workspaceId" in data) || !("userId" in data) || !("recordId" in data) || typeof data.workspaceId !== "string" || typeof data.userId !== "string" || typeof data.recordId !== "string") throw new Error("Invalid job envelope.");
  const fileId = "fileId" in data ? data.fileId : undefined;
  if (fileId !== undefined && typeof fileId !== "string") throw new Error("Invalid job file.");
  return { workspaceId: data.workspaceId, userId: data.userId, recordId: data.recordId, ...(fileId === undefined ? {} : { fileId }) };
}

export async function currentJobAccess(client: PoolClient, scope: JobScope): Promise<boolean> {
  await client.query("SELECT set_config('tantu.actor',$1,true),set_config('tantu.tenant',$2,true)", [scope.userId, scope.workspaceId]);
  const member = await client.query("SELECT user_id FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR SHARE", [scope.workspaceId, scope.userId]);
  return member.rowCount === 1;
}

export function publishEvents() {
  return async (client: PoolClient, data: unknown): Promise<void> => {
    const scope = jobScope(data);
    const member = await currentJobAccess(client, scope);
    const readable = member && (await client.query("SELECT id FROM tantu.records WHERE id=$1", [scope.recordId])).rowCount === 1;
    await client.query("UPDATE tantu.events SET published_at=now(),delivery_state=$4 WHERE workspace_id=$1 AND actor_id=$2 AND record_id=$3 AND published_at IS NULL", [scope.workspaceId, scope.userId, scope.recordId, readable ? "published" : "discarded"]);
  };
}
