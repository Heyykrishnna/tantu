import type { FastifyInstance } from "fastify";
import type { Identity } from "../workspace-access/service.js";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { change, editableTask, receipt, versionConflict } from "../connected-work/change.js";
import { Failure } from "../../platform/failure.js";
import { recordColumns } from "../work-management/contracts.js";
import type { CanonicalRecord } from "../work-management/contracts.js";

interface Project { id: string; title: string; ownerId: string; visibility: "private" | "workspace"; state: string; deadline: string | null; version: number }
const columns = 'id,title,owner_id AS "ownerId",visibility,state,deadline::text,version,tantu.can_project(id,true) AS "canEdit"';
const projectParams = object({ workspaceId: uuid, projectId: uuid });
const version = { type: "integer", minimum: 1 };
const fields = { title: { ...text(200), pattern: "\\S" }, visibility: { enum: ["private", "workspace"] }, state: { enum: ["planning", "active", "at-risk", "completed", "archived"] }, deadline: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] }, operationId: uuid };
export function projectRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const base = "/api/v1/workspaces/:workspaceId/projects";
  app.get<{ Params: { workspaceId: string }; Querystring: { cursor?: string } }>(base, { schema: { params: workspaceParams, querystring: object({ cursor: uuid }, []) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      const rows = (await client.query<Project>(`SELECT ${columns} FROM tantu.projects WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 51`, [request.query.cursor ?? null])).rows;
      return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]?.id : null };
    });
  });
  for (const creating of [true, false]) {
    app.route<{ Params: { workspaceId: string; projectId?: string }; Body: { title: string; visibility: "private" | "workspace"; state: string; deadline: string | null; operationId: string; expectedVersion?: number } }>({
      method: creating ? "POST" : "PATCH", url: base + (creating ? "" : "/:projectId"), schema: { params: creating ? workspaceParams : projectParams, body: object({ ...fields, ...(creating ? {} : { expectedVersion: version }) }) },
      handler: async (request) => {
        const scope = await identity.scope(request, request.params.workspaceId, true);
        const input = request.body;
        return change(db, scope, input.operationId, { action: creating ? "project.create" : "project.update", id: request.params.projectId, input }, async (client) => {
          if (creating) {
            if (!(await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active AND role<>'guest'", [scope.workspaceId, scope.userId])).rowCount) throw new Failure(403, "FORBIDDEN", "Project creation requires membership.");
            if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.projects")).rows[0]?.count) >= 1000) throw new Failure(409, "QUOTA_EXCEEDED", "Project limit reached.");
          } else if (!(await client.query("SELECT id FROM tantu.projects WHERE id=$1 AND tantu.can_project(id,true) FOR UPDATE", [request.params.projectId])).rowCount) throw new Failure(404, "NOT_FOUND", "Project is unavailable.");
        }, async (client) => {
          if (!creating && (await client.query("SELECT id FROM tantu.projects WHERE id=$1 AND owner_id<>$2 AND visibility<>$3", [request.params.projectId,scope.userId,input.visibility])).rowCount) throw new Failure(403,"FORBIDDEN","Only the project owner can change visibility.");
          const result = creating
            ? await client.query("INSERT INTO tantu.projects(workspace_id,owner_id,title,visibility,state,deadline) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version", [scope.workspaceId, scope.userId, input.title.trim(), input.visibility, input.state, input.deadline])
            : await client.query("UPDATE tantu.projects SET title=$2,visibility=$3,state=$4,deadline=$5,version=version+1 WHERE id=$1 AND version=$6 RETURNING id,version", [request.params.projectId, input.title.trim(), input.visibility, input.state, input.deadline, input.expectedVersion]);
          if (!result.rows[0]) versionConflict();
          return receipt(result.rows[0]);
        });
      },
    });
  }
  app.get<{ Params: { workspaceId: string; projectId: string } }>(base + "/:projectId", { schema: { params: projectParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      const project = (await client.query<Project>(`SELECT ${columns} FROM tantu.projects WHERE id=$1`, [request.params.projectId])).rows[0];
      if (!project) throw new Failure(404, "NOT_FOUND", "Project is unavailable.");
      const tasks = (await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE kind='task' AND NOT EXISTS(SELECT 1 FROM tantu.task_coordination c WHERE c.task_id=records.id AND c.archived) AND id IN (SELECT task_id FROM tantu.project_tasks WHERE project_id=$1) ORDER BY deadline NULLS LAST,id LIMIT 501`, [project.id])).rows;
      const counts = (await client.query<{ total: number; done: number; estimated: number; minutes: number }>("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='done')::int AS done,count(estimate_minutes)::int AS estimated,coalesce(sum(estimate_minutes),0)::int AS minutes FROM tantu.records WHERE kind='task' AND NOT EXISTS(SELECT 1 FROM tantu.task_coordination c WHERE c.task_id=records.id AND c.archived) AND id IN (SELECT task_id FROM tantu.project_tasks WHERE project_id=$1)", [project.id])).rows[0];
      const dependencies = (await client.query('SELECT prerequisite_id AS "prerequisiteId",dependent_id AS "dependentId" FROM tantu.task_dependencies WHERE dependent_id IN (SELECT task_id FROM tantu.project_tasks WHERE project_id=$1) ORDER BY prerequisite_id,dependent_id LIMIT 1000', [project.id])).rows;
      return { project, items: tasks.slice(0, 500), truncated: tasks.length > 500, rollup: counts, coverage: "current-access-only", dependencies };
    });
  });
  app.post<{ Params: { workspaceId: string; projectId: string }; Body: { taskId: string; linked: boolean; operationId: string; expectedVersion: number } }>(base + "/:projectId/tasks", { schema: { params: projectParams, body: object({ taskId: uuid, linked: { type: "boolean" }, operationId: uuid, expectedVersion: version }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "project.link", ...request.params, ...request.body }, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.projects WHERE id=$1 AND tantu.can_project(id,true) FOR UPDATE", [request.params.projectId])).rowCount) throw new Failure(404, "NOT_FOUND", "Project is unavailable.");
      await editableTask(client, request.body.taskId);
    }, async (client) => {
      const updated = (await client.query("UPDATE tantu.projects SET version=version+1 WHERE id=$1 AND version=$2 RETURNING id,version", [request.params.projectId, request.body.expectedVersion])).rows[0];
      if (!updated) versionConflict();
      if (request.body.linked) await client.query("INSERT INTO tantu.project_tasks VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [scope.workspaceId, request.params.projectId, request.body.taskId]);
      else await client.query("DELETE FROM tantu.project_tasks WHERE project_id=$1 AND task_id=$2", [request.params.projectId, request.body.taskId]);
      return receipt(updated);
    });
  });
  app.post<{ Params: { workspaceId: string }; Body: { prerequisiteId: string; dependentId: string; linked: boolean; operationId: string } }>("/api/v1/workspaces/:workspaceId/dependencies", { schema: { params: workspaceParams, body: object({ prerequisiteId: uuid, dependentId: uuid, linked: { type: "boolean" }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    try {
      return await change(db, scope, request.body.operationId, { action: "dependency", ...request.body }, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,123))", [scope.workspaceId]);
        for (const id of [request.body.prerequisiteId, request.body.dependentId].sort()) await editableTask(client, id);
      }, async (client) => {
        if (request.body.linked) await client.query("INSERT INTO tantu.task_dependencies VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [scope.workspaceId, request.body.prerequisiteId, request.body.dependentId]);
        else await client.query("DELETE FROM tantu.task_dependencies WHERE prerequisite_id=$1 AND dependent_id=$2", [request.body.prerequisiteId, request.body.dependentId]);
        return { id: request.body.dependentId, version: 1 };
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23514") throw new Failure(409, "DEPENDENCY_CYCLE", "This dependency would create a cycle.");
      throw error;
    }
  });
}
