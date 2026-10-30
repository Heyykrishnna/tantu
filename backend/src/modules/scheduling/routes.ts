import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import type { Identity } from "../workspace-access/service.js";
import { change, editableTask, receipt, versionConflict } from "../connected-work/change.js";
import { Failure } from "../../platform/failure.js";
import { civilInstant } from "./time.js";

interface Selection { taskId: string; taskVersion: number; startsAt: string; endsAt: string; timezone: string; blockId: string | null; blockVersion: number | null; locked: boolean; cancelled: boolean }
function selection(value: unknown): Selection {
  if (typeof value !== "object" || value === null || !("taskId" in value) || typeof value.taskId !== "string" || !("taskVersion" in value) || typeof value.taskVersion !== "number" || !("startsAt" in value) || typeof value.startsAt !== "string" || !("endsAt" in value) || typeof value.endsAt !== "string" || !("timezone" in value) || typeof value.timezone !== "string" || !("blockId" in value) || !(value.blockId === null || typeof value.blockId === "string") || !("blockVersion" in value) || !(value.blockVersion === null || typeof value.blockVersion === "number") || !("locked" in value) || typeof value.locked !== "boolean" || !("cancelled" in value) || typeof value.cancelled !== "boolean") throw new Error("Invalid persisted schedule review.");
  return { taskId: value.taskId, taskVersion: value.taskVersion, startsAt: value.startsAt, endsAt: value.endsAt, timezone: value.timezone, blockId: value.blockId, blockVersion: value.blockVersion, locked: value.locked, cancelled: value.cancelled };
}
async function checkSelection(client: PoolClient, input: Selection): Promise<void> {
  await editableTask(client, input.taskId);
  const task = (await client.query<{ version: number; status: string }>("SELECT version,status FROM tantu.records WHERE id=$1", [input.taskId])).rows[0];
  if (task?.version !== input.taskVersion) versionConflict();
  if (task.status === "done" && !input.cancelled) throw new Failure(409, "TASK_COMPLETED", "Reopen the task before scheduling work.");
  if (input.blockId) {
    const block = (await client.query<{ version: number; locked: boolean; task_id: string }>("SELECT version,locked,task_id FROM tantu.work_blocks WHERE id=$1 FOR UPDATE", [input.blockId])).rows[0];
    if (!block || block.task_id !== input.taskId) throw new Failure(404, "NOT_FOUND", "Work block is unavailable.");
    if (block.version !== input.blockVersion) versionConflict();
    if (block.locked) throw new Failure(409, "BLOCK_LOCKED", "This work block is locked. Unlock it in a separate reviewed edit before rescheduling.");
  } else if (input.cancelled) throw new Failure(400, "INVALID_SELECTION", "Select an existing block to cancel.");
}
export function schedulingRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const base = "/api/v1/workspaces/:workspaceId/schedule";
  app.get<{ Params: { workspaceId: string }; Querystring: { from: string; to: string } }>(base, { schema: { params: workspaceParams, querystring: object({ from: { type: "string", format: "date-time" }, to: { type: "string", format: "date-time" } }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    if (Date.parse(request.query.to) <= Date.parse(request.query.from) || Date.parse(request.query.to) - Date.parse(request.query.from) > 93 * 86400000) throw new Failure(400, "INVALID_WINDOW", "Select a window of at most 93 days.");
    return db.transaction(scope, async (client) => {
      const rows = (await client.query('SELECT b.id,b.task_id AS "taskId",r.title,r.version AS "taskVersion",r.status,b.starts_at AS "startsAt",b.ends_at AS "endsAt",b.timezone,b.locked,b.version FROM tantu.work_blocks b JOIN tantu.records r ON r.id=b.task_id WHERE NOT b.cancelled AND b.starts_at<$2 AND b.ends_at>$1 ORDER BY b.starts_at,b.id LIMIT 501', [request.query.from, request.query.to])).rows;
      return { items: rows.slice(0, 500), truncated: rows.length > 500, coverage: "personal-local-work-blocks" };
    });
  });
  app.post<{ Params: { workspaceId: string }; Body: { taskId: string; taskVersion: number; start: string; end: string; timezone: string; blockId?: string; blockVersion?: number; locked?: boolean; cancelled?: boolean } }>(base + "/review", { schema: { params: workspaceParams, body: object({ taskId: uuid, taskVersion: { type: "integer", minimum: 1 }, start: text(30), end: text(30), timezone: text(100), blockId: uuid, blockVersion: { type: "integer", minimum: 1 }, locked: { type: "boolean" }, cancelled: { type: "boolean" } }, ["taskId", "taskVersion", "start", "end", "timezone"]) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    const input: Selection = { taskId: request.body.taskId, taskVersion: request.body.taskVersion, startsAt: civilInstant(request.body.start, request.body.timezone), endsAt: civilInstant(request.body.end, request.body.timezone), timezone: request.body.timezone, blockId: request.body.blockId ?? null, blockVersion: request.body.blockVersion ?? null, locked: request.body.locked ?? false, cancelled: request.body.cancelled ?? false };
    const duration = Date.parse(input.endsAt) - Date.parse(input.startsAt);
    if (duration < 60000 || duration > 7 * 86400000) throw new Failure(400, "INVALID_DURATION", "Work blocks must last between one minute and seven days.");
    return db.transaction(scope, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,53))", [scope.workspaceId + scope.userId]);
      await checkSelection(client, input);
      await client.query("INSERT INTO tantu.calendar_states(workspace_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [scope.workspaceId, scope.userId]);
      const state = (await client.query<{ version: number }>("SELECT version FROM tantu.calendar_states FOR UPDATE")).rows[0];
      if (!state) throw new Error("Calendar state missing.");
      const conflicts = (await client.query('SELECT id,starts_at AS "startsAt",ends_at AS "endsAt" FROM tantu.work_blocks WHERE NOT cancelled AND id IS DISTINCT FROM $3::uuid AND starts_at<$2 AND ends_at>$1 ORDER BY starts_at LIMIT 100', [input.startsAt, input.endsAt, input.blockId])).rows;
      const dependencies = (await client.query('SELECT d.prerequisite_id AS "taskId",r.title FROM tantu.task_dependencies d JOIN tantu.records r ON r.id=d.prerequisite_id WHERE d.dependent_id=$1 AND r.status<>\'done\' LIMIT 100', [input.taskId])).rows;
      await client.query("DELETE FROM tantu.schedule_reviews WHERE expires_at<now()");
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.schedule_reviews")).rows[0]?.count) >= 100) throw new Failure(429, "REVIEW_LIMIT", "Apply an existing review or wait for it to expire.");
      const review = (await client.query<{ id: string }>("INSERT INTO tantu.schedule_reviews(workspace_id,user_id,payload,calendar_version) VALUES($1,$2,$3,$4) RETURNING id", [scope.workspaceId, scope.userId, JSON.stringify(input), state.version])).rows[0];
      if (!review) throw new Error("Schedule review missing.");
      return { id: review.id, selection: input, conflicts, dependencies, warnings: ["Task deadlines remain unchanged.", "This review covers personal local work blocks; external calendars are not included.", "Applying confirms any displayed overlaps and incomplete prerequisites."], expiresInSeconds: 600 };
    });
  });
  app.post<{ Params: { workspaceId: string }; Body: { reviewId: string; operationId: string } }>(base + "/apply", { schema: { params: workspaceParams, body: object({ reviewId: uuid, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "schedule.apply", reviewId: request.body.reviewId }, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,53))", [scope.workspaceId + scope.userId]);
      const review = (await client.query<{ payload: unknown }>("SELECT payload FROM tantu.schedule_reviews WHERE id=$1", [request.body.reviewId])).rows[0];
      if (!review) throw new Failure(404, "NOT_FOUND", "Schedule review is unavailable.");
      const input = selection(review.payload); await editableTask(client, input.taskId);
    }, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,53))", [scope.workspaceId + scope.userId]);
      const review = (await client.query<{ payload: unknown; calendar_version: number }>("SELECT payload,calendar_version FROM tantu.schedule_reviews WHERE id=$1 AND expires_at>now() FOR UPDATE", [request.body.reviewId])).rows[0];
      if (!review) throw new Failure(409, "REVIEW_EXPIRED", "Create a fresh schedule review.");
      const state = (await client.query<{ version: number }>("SELECT version FROM tantu.calendar_states FOR UPDATE")).rows[0];
      if (state?.version !== review.calendar_version) versionConflict();
      const input = selection(review.payload); await checkSelection(client, input);
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.work_blocks")).rows[0]?.count) >= 10000 && !input.blockId) throw new Failure(409, "QUOTA_EXCEEDED", "Calendar block limit reached.");
      const result = input.blockId ? await client.query("UPDATE tantu.work_blocks SET starts_at=$2,ends_at=$3,timezone=$4,locked=$5,cancelled=$6,version=version+1 WHERE id=$1 RETURNING id,version", [input.blockId, input.startsAt, input.endsAt, input.timezone, input.locked, input.cancelled]) : await client.query("INSERT INTO tantu.work_blocks(workspace_id,user_id,task_id,starts_at,ends_at,timezone,locked) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,version", [scope.workspaceId, scope.userId, input.taskId, input.startsAt, input.endsAt, input.timezone, input.locked]);
      await client.query("UPDATE tantu.calendar_states SET version=version+1");
      return receipt(result.rows[0]);
    });
  });
  app.post<{ Params: { workspaceId: string; blockId: string }; Body: { expectedVersion: number; operationId: string } }>(base + "/:blockId/unlock", { schema: { params: object({ workspaceId: uuid, blockId: uuid }), body: object({ expectedVersion: { type: "integer", minimum: 1 }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { action: "schedule.unlock", ...request.params, ...request.body }, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,53))", [scope.workspaceId + scope.userId]);
      if (!(await client.query("SELECT id FROM tantu.work_blocks WHERE id=$1 FOR UPDATE", [request.params.blockId])).rowCount) throw new Failure(404, "NOT_FOUND", "Work block is unavailable.");
    }, async (client) => {
      const result = (await client.query("UPDATE tantu.work_blocks SET locked=false,version=version+1 WHERE id=$1 AND version=$2 RETURNING id,version", [request.params.blockId, request.body.expectedVersion])).rows[0];
      if (!result) versionConflict();
      await client.query("UPDATE tantu.calendar_states SET version=version+1"); return receipt(result);
    });
  });
}
