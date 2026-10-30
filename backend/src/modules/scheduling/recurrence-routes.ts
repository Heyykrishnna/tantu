import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { FastifyInstance } from "fastify";
import { object, text, uuid } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type { Records } from "../work-management/service.js";
import type { CanonicalRecord } from "../work-management/contracts.js";
import { recordColumns } from "../work-management/contracts.js";
import { change, editableTask, receipt } from "../connected-work/change.js";
import { expandCivilRecurrence } from "./time.js";

export function recurrenceRoutes(app: FastifyInstance, identity: Identity, records: Records): void {
  const db = identity.database;
  const taskParams = object({ workspaceId: uuid, recordId: uuid });
  const base = "/api/v1/workspaces/:workspaceId/tasks/:recordId/recurrence";
  app.get<{ Params: { workspaceId: string; recordId: string } }>(base, { schema: { params: taskParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND kind='task'", [request.params.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Task is unavailable.");
      const definition = (await client.query("SELECT id,rule,timezone,instants FROM tantu.recurrences WHERE source_id=$1", [request.params.recordId])).rows[0] ?? null;
      return { definition, items: (await client.query('SELECT instant,state,task_id AS "taskId" FROM tantu.recurrence_occurrences WHERE recurrence_id IN (SELECT id FROM tantu.recurrences WHERE source_id=$1) ORDER BY instant LIMIT 1000', [request.params.recordId])).rows };
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { rule: string; timezone: string; operationId: string } }>(base, { schema: { params: taskParams, body: object({ rule: text(1000), timezone: text(100), operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    const instants = expandCivilRecurrence(request.body.rule, request.body.timezone);
    return change(db, scope, request.body.operationId, { action: "recurrence.create", ...request.params, ...request.body }, (client) => editableTask(client, request.params.recordId), async (client) => {
      if ((await client.query("SELECT id FROM tantu.recurrences WHERE source_id=$1", [request.params.recordId])).rowCount) throw new Failure(409, "RECURRENCE_EXISTS", "This task already has a recurrence. Existing occurrences are preserved.");
      const created = (await client.query<{ id: string }>("INSERT INTO tantu.recurrences(workspace_id,source_id,rule,timezone,instants) VALUES($1,$2,$3,$4,$5) RETURNING id", [scope.workspaceId, request.params.recordId, request.body.rule, request.body.timezone, JSON.stringify(instants)])).rows[0];
      if (!created) throw new Error("Recurrence was not created.");
      return { id: created.id, version: 1 };
    });
  });
  app.post<{ Params: { workspaceId: string; recordId: string }; Body: { instant: string; action: "materialize" | "skip"; operationId: string } }>(base + "/occurrences", { schema: { params: taskParams, body: object({ instant: { type: "string", format: "date-time" }, action: { enum: ["materialize", "skip"] }, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { ...request.params, ...request.body, command: "recurrence.occurrence" }, (client) => editableTask(client, request.params.recordId), async (client) => {
      const definition = (await client.query<{ id: string; instants: unknown; timezone: string }>("SELECT id,instants,timezone FROM tantu.recurrences WHERE source_id=$1 FOR UPDATE", [request.params.recordId])).rows[0];
      const instant = new Date(request.body.instant).toISOString();
      if (!definition || !Array.isArray(definition.instants) || !definition.instants.includes(instant)) throw new Failure(400, "INVALID_OCCURRENCE", "Select an occurrence from this recurrence.");
      const previous = (await client.query<{ task_id: string | null; state: string }>("SELECT task_id,state FROM tantu.recurrence_occurrences WHERE recurrence_id=$1 AND instant=$2", [definition.id, instant])).rows[0];
      if (previous) {
        if (previous.state !== (request.body.action === "skip" ? "skipped" : "materialized")) throw new Failure(409, "OCCURRENCE_RESOLVED", "This occurrence was already materialized or skipped.");
        if (previous.task_id && !(await client.query("SELECT id FROM tantu.records WHERE id=$1", [previous.task_id])).rowCount) throw new Failure(404, "NOT_FOUND", "Occurrence task is unavailable.");
        return { id: previous.task_id ?? definition.id, version: 1 };
      }
      let taskId: string | null = null;
      if (request.body.action === "materialize") {
        const source = (await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE id=$1`, [request.params.recordId])).rows[0];
        if (!source) throw new Failure(404, "NOT_FOUND", "Source task is unavailable.");
        const deadline = Temporal.Instant.from(instant).toZonedDateTimeISO(definition.timezone).toPlainDate().toString();
        const task = await records.mutateIn(client, scope, "task", randomUUID(), { title: source.title, body: source.body, priority: source.priority, estimateMinutes: source.estimateMinutes, deadline, visibility: "private" });
        taskId = task.id;
      }
      await client.query("INSERT INTO tantu.recurrence_occurrences VALUES($1,$2,$3,$4,$5)", [scope.workspaceId, definition.id, instant, request.body.action === "skip" ? "skipped" : "materialized", taskId]);
      return receipt({ id: taskId ?? definition.id, version: 1 });
    });
  });
}
