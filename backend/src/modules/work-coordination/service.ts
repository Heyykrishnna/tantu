import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";
import { digest } from "../workspace-access/credentials.js";
import { editableTask } from "../connected-work/change.js";
export interface WorkTarget { id: string; version: number }
export type WorkAction = "complete" | "reopen" | "archive" | "unarchive" | "delete" | "restore";
export async function graphLock(client: PoolClient, workspaceId: string): Promise<void> { await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,123))", [workspaceId]); }
export async function projectEdit(client: PoolClient, id: string): Promise<void> { if (!(await client.query("SELECT id FROM tantu.projects WHERE id=$1 AND tantu.can_project(id,true) FOR UPDATE", [id])).rowCount) throw new Failure(404, "NOT_FOUND", "Project is unavailable."); }
export async function workFingerprint(client: PoolClient, targets: WorkTarget[], action: WorkAction): Promise<{ fingerprint: string; blocks: unknown[]; dependencies: unknown[] }> {
  if (action === "restore") await client.query("SELECT set_config('tantu.restoring','on',true)");
  for (const target of [...targets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (action === "restore") { if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND kind='task' AND tantu.restorable(id) FOR UPDATE", [target.id])).rowCount) throw new Failure(404, "NOT_FOUND", "Deleted task is unavailable or its parent must be restored first."); }
    else await editableTask(client, target.id);
    const version = (await client.query<{ version: number }>("SELECT version FROM tantu.records WHERE id=$1", [target.id])).rows[0]?.version;
    if (version !== target.version) throw new Failure(409, "VERSION_CONFLICT", "A task changed. Review the action again.");
  }
  const ids = targets.map(target => target.id);
  const blocks = (await client.query('SELECT id,task_id AS "taskId",version,locked,starts_at AS "startsAt" FROM tantu.work_blocks WHERE task_id=ANY($1::uuid[]) AND NOT cancelled AND ends_at>now() ORDER BY id FOR UPDATE', [ids])).rows;
  const dependencies = (await client.query('SELECT d.prerequisite_id AS "prerequisiteId",d.dependent_id AS "dependentId",r.version,r.status,r.title,r.deadline::text,p.deadline::text AS "prerequisiteDeadline",(p.deadline IS NOT NULL AND r.deadline IS NOT NULL AND p.deadline>r.deadline) AS "deadlineRisk" FROM tantu.task_dependencies d JOIN tantu.records r ON r.id=d.dependent_id JOIN tantu.records p ON p.id=d.prerequisite_id WHERE d.prerequisite_id=ANY($1::uuid[]) ORDER BY d.prerequisite_id,d.dependent_id', [ids])).rows;
  const coordination = (await client.query("SELECT task_id,version FROM tantu.task_coordination WHERE task_id=ANY($1::uuid[]) ORDER BY task_id", [ids])).rows;
  return { fingerprint: digest(JSON.stringify({ targets, blocks, dependencies, coordination })), blocks, dependencies };
}
