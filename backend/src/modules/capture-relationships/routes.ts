import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import { change, receipt, versionConflict } from "../connected-work/change.js";
import type {
  CaptureItem,
  CaptureKind,
  CaptureSourceType,
  CaptureStatus,
  CaptureReviewPayload,
  PromiseConfirmationState,
  PromiseItem,
  PromiseStatus,
} from "./service.js";
import {
  convertCaptureToTask,
  createCaptureRecord,
} from "./service.js";

const captureKindEnum = { enum: ["note", "link", "mail", "request"] };
const captureSourceTypeEnum = { enum: ["manual", "mail", "url", "task"] };
const captureStatusEnum = { enum: ["inbox", "converted", "dismissed"] };
const promiseStateEnum = { enum: ["inferred", "confirmed"] };
const promiseStatusEnum = { enum: ["pending", "fulfilled", "broken"] };
const nullableUuid = { anyOf: [uuid, { type: "null" }] };

export function captureRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{
    Params: { workspaceId: string };
    Querystring: { status?: CaptureStatus };
  }>(
    root + "/capture",
    {
      schema: {
        params: workspaceParams,
        querystring: object({ status: { ...captureStatusEnum } }, []),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const statusFilter = request.query.status ? "AND status = $3" : "";
        const queryParams: unknown[] = [scope.workspaceId, scope.userId];
        if (request.query.status) queryParams.push(request.query.status);

        const result = await client.query<CaptureItem>(
          `SELECT
            id,
            workspace_id AS "workspaceId",
            user_id AS "userId",
            kind,
            title,
            content,
            source_type AS "sourceType",
            source_id AS "sourceId",
            source_url AS "sourceUrl",
            status,
            converted_record_id AS "convertedRecordId",
            created_at::text AS "createdAt",
            version
          FROM tantu.capture_items
          WHERE workspace_id = $1 AND user_id = $2 ${statusFilter}
          ORDER BY created_at DESC
          LIMIT 100`,
          queryParams
        );
        return { items: result.rows };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      kind: CaptureKind;
      title: string;
      content?: string;
      sourceType?: CaptureSourceType;
      sourceId?: string | null;
      sourceUrl?: string | null;
    };
  }>(
    root + "/capture",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            kind: captureKindEnum,
            title: { ...text(200), pattern: "\\S" },
            content: { type: "string", maxLength: 10000 },
            sourceType: captureSourceTypeEnum,
            sourceId: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] },
            sourceUrl: { anyOf: [{ type: "string", maxLength: 2000 }, { type: "null" }] },
          },
          ["kind", "title"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const item = await createCaptureRecord(client, scope.workspaceId, scope.userId, request.body);
        return { item };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; captureId: string };
  }>(
    root + "/capture/:captureId/review",
    {
      schema: {
        params: object({ workspaceId: uuid, captureId: uuid }),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const captureResult = await client.query<CaptureItem>(
          `SELECT
            id,
            workspace_id AS "workspaceId",
            user_id AS "userId",
            kind,
            title,
            content,
            source_type AS "sourceType",
            source_id AS "sourceId",
            source_url AS "sourceUrl",
            status,
            converted_record_id AS "convertedRecordId",
            created_at::text AS "createdAt",
            version
          FROM tantu.capture_items
          WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
          [request.params.captureId, scope.workspaceId, scope.userId]
        );
        const capture = captureResult.rows[0];
        if (!capture) throw new Failure(404, "NOT_FOUND", "Capture item not found.");

        const projects = (
          await client.query<{ id: string; title: string }>(
            `SELECT id, title FROM tantu.projects WHERE workspace_id = $1 ORDER BY title LIMIT 50`,
            [scope.workspaceId]
          )
        ).rows;

        const members = (
          await client.query<{ id: string; name: string }>(
            `SELECT u.id, u.display_name AS name
             FROM tantu.memberships m
             JOIN tantu.users u ON u.id = m.user_id
             WHERE m.workspace_id = $1 AND m.active
             ORDER BY u.display_name LIMIT 100`,
            [scope.workspaceId]
          )
        ).rows;

        return {
          capture,
          candidateProjects: projects,
          candidateMembers: members,
          audienceNotice:
            capture.sourceType === "mail"
              ? "This capture originated from private mail. Converting to a workspace or project task copies an excerpt into shared space. The original mailbox remains private."
              : "Review title, destination, deadline, and visibility before conversion.",
        };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; captureId: string };
    Body: CaptureReviewPayload & { operationId: string };
  }>(
    root + "/capture/:captureId/convert",
    {
      schema: {
        params: object({ workspaceId: uuid, captureId: uuid }),
        body: object(
          {
            captureId: uuid,
            title: { ...text(200), pattern: "\\S" },
            visibility: { enum: ["private", "workspace"] },
            projectId: nullableUuid,
            milestoneId: nullableUuid,
            deadline: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
            assigneeId: nullableUuid,
            estimateMinutes: { anyOf: [{ type: "integer", minimum: 1, maximum: 10080 }, { type: "null" }] },
            selectedExcerpts: { type: "string", maxLength: 10000 },
            operationId: uuid,
          },
          ["captureId", "title", "visibility", "operationId"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      const input = request.body;
      return change(
        db,
        scope,
        input.operationId,
        { command: "capture.convert", ...input },
        async (client) => {
          const item = (
            await client.query<{ status: string }>(
              `SELECT status FROM tantu.capture_items WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
              [request.params.captureId, scope.workspaceId]
            )
          ).rows[0];
          if (!item) throw new Failure(404, "NOT_FOUND", "Capture item not found.");
        },
        async (client) => {
          const { task, capture } = await convertCaptureToTask(
            client,
            scope.workspaceId,
            scope.userId,
            request.params.captureId,
            input
          );
          return receipt({ task, capture });
        }
      );
    }
  );

  app.delete<{
    Params: { workspaceId: string; captureId: string };
  }>(
    root + "/capture/:captureId",
    {
      schema: {
        params: object({ workspaceId: uuid, captureId: uuid }),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const result = await client.query(
          `UPDATE tantu.capture_items SET status = 'dismissed', version = version + 1
           WHERE id = $1 AND workspace_id = $2 AND user_id = $3
           RETURNING id`,
          [request.params.captureId, scope.workspaceId, scope.userId]
        );
        if (!result.rowCount) throw new Failure(404, "NOT_FOUND", "Capture item not found.");
        return { success: true };
      });
    }
  );

  app.get<{ Params: { workspaceId: string } }>(root + "/promises/people", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      const people = await client.query<{ id: string; name: string }>(
        "SELECT u.id,u.display_name AS name FROM tantu.memberships m JOIN tantu.users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.active AND (m.user_id=$2 OR tantu.member_role(m.workspace_id) IN ('owner','admin','member')) ORDER BY (m.user_id=$2) DESC,u.display_name,u.id LIMIT 100",
        [scope.workspaceId, scope.userId],
      );
      return { items: people.rows };
    });
  });

  app.get<{
    Params: { workspaceId: string };
    Querystring: {
      confirmationState?: PromiseConfirmationState;
      status?: PromiseStatus;
    };
  }>(
    root + "/promises",
    {
      schema: {
        params: workspaceParams,
        querystring: object(
          {
            confirmationState: { ...promiseStateEnum },
            status: { ...promiseStatusEnum },
          },
          []
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const filters: string[] = ["p.workspace_id = $1"];
        const values: unknown[] = [scope.workspaceId];
        if (request.query.confirmationState) {
          values.push(request.query.confirmationState);
          filters.push(`p.confirmation_state = $${values.length}`);
        }
        if (request.query.status) {
          values.push(request.query.status);
          filters.push(`p.status = $${values.length}`);
        }

        const result = await client.query<PromiseItem>(
          `SELECT
            p.id,
            p.workspace_id AS "workspaceId",
            p.creator_id AS "creatorId",
            u1.display_name AS "creatorName",
            p.responsible_id AS "responsibleId",
            u2.display_name AS "responsibleName",
            p.title,
            p.agreed_date::text AS "agreedDate",
            p.confirmation_state AS "confirmationState",
            p.status,
            p.source_record_id AS "sourceRecordId",
            p.task_id AS "taskId",
            r.title AS "taskTitle",
            p.notes,
            p.version,
            p.created_at::text AS "createdAt",
            p.updated_at::text AS "updatedAt"
          FROM tantu.promises p
          JOIN tantu.users u1 ON u1.id = p.creator_id
          JOIN tantu.users u2 ON u2.id = p.responsible_id
          LEFT JOIN tantu.records r ON r.id = p.task_id
          WHERE ${filters.join(" AND ")}
          ORDER BY p.agreed_date ASC NULLS LAST, p.created_at DESC
          LIMIT 100`,
          values
        );
        return { promises: result.rows };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      responsibleId: string;
      title: string;
      agreedDate?: string | null;
      confirmationState?: PromiseConfirmationState;
      sourceRecordId?: string | null;
      taskId?: string | null;
      notes?: string;
    };
  }>(
    root + "/promises",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            responsibleId: uuid,
            title: { ...text(200), pattern: "\\S" },
            agreedDate: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
            confirmationState: promiseStateEnum,
            sourceRecordId: nullableUuid,
            taskId: nullableUuid,
            notes: { type: "string", maxLength: 2000 },
          },
          ["responsibleId", "title"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      const input = request.body;
      return db.transaction(scope, async (client) => {
        const memberCheck = await client.query(
          `SELECT 1 FROM tantu.memberships WHERE workspace_id = $1 AND user_id = $2 AND active`,
          [scope.workspaceId, input.responsibleId]
        );
        if (!memberCheck.rowCount) {
          throw new Failure(400, "INVALID_RESPONSIBLE", "Responsible person must be an active member.");
        }

        const result = await client.query<PromiseItem>(
          `INSERT INTO tantu.promises(
            workspace_id, creator_id, responsible_id, title, agreed_date,
            confirmation_state, source_record_id, task_id, notes
          ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING
            id,
            workspace_id AS "workspaceId",
            creator_id AS "creatorId",
            responsible_id AS "responsibleId",
            title,
            agreed_date::text AS "agreedDate",
            confirmation_state AS "confirmationState",
            status,
            source_record_id AS "sourceRecordId",
            task_id AS "taskId",
            notes,
            version,
            created_at::text AS "createdAt",
            updated_at::text AS "updatedAt"`,
          [
            scope.workspaceId,
            scope.userId,
            input.responsibleId,
            input.title.trim(),
            input.agreedDate ?? null,
            input.confirmationState ?? "confirmed",
            input.sourceRecordId ?? null,
            input.taskId ?? null,
            input.notes ?? "",
          ]
        );
        return { promise: result.rows[0] };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; promiseId: string };
    Body: { operationId: string };
  }>(
    root + "/promises/:promiseId/confirm",
    {
      schema: {
        params: object({ workspaceId: uuid, promiseId: uuid }),
        body: object({ operationId: uuid }, ["operationId"]),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return change(
        db,
        scope,
        request.body.operationId,
        { command: "promise.confirm", promiseId: request.params.promiseId },
        async (client) => {
          const promise = (
            await client.query<{ confirmation_state: string }>(
              `SELECT confirmation_state FROM tantu.promises WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
              [request.params.promiseId, scope.workspaceId]
            )
          ).rows[0];
          if (!promise) throw new Failure(404, "NOT_FOUND", "Promise not found.");
        },
        async (client) => {
          const result = await client.query<PromiseItem>(
            `UPDATE tantu.promises
             SET confirmation_state = 'confirmed', updated_at = now(), version = version + 1
             WHERE id = $1 AND workspace_id = $2
             RETURNING
               id,
               workspace_id AS "workspaceId",
               creator_id AS "creatorId",
               responsible_id AS "responsibleId",
               title,
               agreed_date::text AS "agreedDate",
               confirmation_state AS "confirmationState",
               status,
               source_record_id AS "sourceRecordId",
               task_id AS "taskId",
               notes,
               version,
               created_at::text AS "createdAt",
               updated_at::text AS "updatedAt"`,
            [request.params.promiseId, scope.workspaceId]
          );
          return receipt({ promise: result.rows[0] });
        }
      );
    }
  );

  app.patch<{
    Params: { workspaceId: string; promiseId: string };
    Body: {
      status?: PromiseStatus;
      notes?: string;
      taskId?: string | null;
      expectedVersion: number;
    };
  }>(
    root + "/promises/:promiseId",
    {
      schema: {
        params: object({ workspaceId: uuid, promiseId: uuid }),
        body: object(
          {
            status: promiseStatusEnum,
            notes: { type: "string", maxLength: 2000 },
            taskId: nullableUuid,
            expectedVersion: { type: "integer", minimum: 1 },
          },
          ["expectedVersion"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      const input = request.body;
      return db.transaction(scope, async (client) => {
        const existing = (
          await client.query<{ version: number }>(
            `SELECT version FROM tantu.promises WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
            [request.params.promiseId, scope.workspaceId]
          )
        ).rows[0];
        if (!existing) throw new Failure(404, "NOT_FOUND", "Promise not found.");
        if (existing.version !== input.expectedVersion) versionConflict();

        const updates: string[] = ["version = version + 1", "updated_at = now()"];
        const values: unknown[] = [request.params.promiseId, scope.workspaceId];

        if (input.status) {
          values.push(input.status);
          updates.push(`status = $${values.length}`);
        }
        if (typeof input.notes === "string") {
          values.push(input.notes);
          updates.push(`notes = $${values.length}`);
        }
        if (input.taskId !== undefined) {
          values.push(input.taskId);
          updates.push(`task_id = $${values.length}`);
        }

        const result = await client.query<PromiseItem>(
          `UPDATE tantu.promises
           SET ${updates.join(", ")}
           WHERE id = $1 AND workspace_id = $2
           RETURNING
             id,
             workspace_id AS "workspaceId",
             creator_id AS "creatorId",
             responsible_id AS "responsibleId",
             title,
             agreed_date::text AS "agreedDate",
             confirmation_state AS "confirmationState",
             status,
             source_record_id AS "sourceRecordId",
             task_id AS "taskId",
             notes,
             version,
             created_at::text AS "createdAt",
             updated_at::text AS "updatedAt"`,
          values
        );
        return { promise: result.rows[0] };
      });
    }
  );
}
