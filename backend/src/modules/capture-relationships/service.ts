import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";
import type { CanonicalRecord } from "../work-management/contracts.js";
import { recordColumns } from "../work-management/contracts.js";

export type CaptureKind = "note" | "link" | "mail" | "request";
export type CaptureSourceType = "manual" | "mail" | "url" | "task";
export type CaptureStatus = "inbox" | "converted" | "dismissed";
export type PromiseConfirmationState = "inferred" | "confirmed";
export type PromiseStatus = "pending" | "fulfilled" | "broken";

export interface CaptureItem {
  id: string;
  workspaceId: string;
  userId: string;
  kind: CaptureKind;
  title: string;
  content: string;
  sourceType: CaptureSourceType;
  sourceId: string | null;
  sourceUrl: string | null;
  status: CaptureStatus;
  convertedRecordId: string | null;
  createdAt: string;
  version: number;
}

export interface PromiseItem {
  id: string;
  workspaceId: string;
  creatorId: string;
  creatorName?: string;
  responsibleId: string;
  responsibleName?: string;
  title: string;
  agreedDate: string | null;
  confirmationState: PromiseConfirmationState;
  status: PromiseStatus;
  sourceRecordId: string | null;
  taskId: string | null;
  taskTitle?: string | null;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureReviewPayload {
  captureId: string;
  title: string;
  visibility: "private" | "workspace";
  projectId: string | null;
  milestoneId: string | null;
  deadline: string | null;
  assigneeId: string | null;
  estimateMinutes: number | null;
  selectedExcerpts: string;
}

export function captureFingerprint(input: CaptureReviewPayload): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export async function createCaptureRecord(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  input: {
    kind: CaptureKind;
    title: string;
    content?: string;
    sourceType?: CaptureSourceType;
    sourceId?: string | null;
    sourceUrl?: string | null;
  }
): Promise<CaptureItem> {
  const result = await client.query<CaptureItem>(
    `INSERT INTO tantu.capture_items(
      workspace_id, user_id, kind, title, content, source_type, source_id, source_url
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
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
      version`,
    [
      workspaceId,
      userId,
      input.kind,
      input.title.trim(),
      input.content ?? "",
      input.sourceType ?? "manual",
      input.sourceId ?? null,
      input.sourceUrl ?? null,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Failure(500, "DATABASE_ERROR", "Capture could not be created.");
  return row;
}

export async function convertCaptureToTask(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  captureId: string,
  payload: CaptureReviewPayload
): Promise<{ task: CanonicalRecord; capture: CaptureItem }> {
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
    WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    [captureId, workspaceId]
  );
  const existingCapture = captureResult.rows[0];
  if (!existingCapture) {
    throw new Failure(404, "NOT_FOUND", "Capture item not found.");
  }
  if (existingCapture.status === "converted" && existingCapture.convertedRecordId) {
    const existingTask = await client.query<CanonicalRecord>(
      `SELECT ${recordColumns} FROM tantu.records WHERE id = $1`,
      [existingCapture.convertedRecordId]
    );
    if (existingTask.rows[0]) {
      return { task: existingTask.rows[0], capture: existingCapture };
    }
  }

  const taskBody = {
    type: "doc",
    content: payload.selectedExcerpts
      ? [{ type: "paragraph", content: [{ type: "text", text: payload.selectedExcerpts }] }]
      : existingCapture.content
        ? [{ type: "paragraph", content: [{ type: "text", text: existingCapture.content }] }]
        : [],
  };

  const taskResult = await client.query<CanonicalRecord>(
    `INSERT INTO tantu.records(
      workspace_id, owner_id, kind, visibility, title, body, deadline, estimate_minutes
    ) VALUES($1, $2, 'task', $3, $4, $5, $6, $7)
    RETURNING ${recordColumns}`,
    [
      workspaceId,
      userId,
      payload.visibility,
      payload.title.trim(),
      JSON.stringify(taskBody),
      payload.deadline,
      payload.estimateMinutes,
    ]
  );
  const createdTask = taskResult.rows[0];
  if (!createdTask) {
    throw new Failure(500, "DATABASE_ERROR", "Task record could not be created.");
  }

  if (payload.projectId) {
    await client.query(
      `INSERT INTO tantu.project_tasks(project_id, task_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
      [payload.projectId, createdTask.id]
    );
  }

  if (payload.assigneeId || payload.milestoneId) {
    await client.query(
      `INSERT INTO tantu.task_coordination(workspace_id, task_id, assignee_id, milestone_id)
       VALUES($1, $2, $3, $4)
       ON CONFLICT(task_id) DO UPDATE SET
         assignee_id = COALESCE(excluded.assignee_id, tantu.task_coordination.assignee_id),
         milestone_id = COALESCE(excluded.milestone_id, tantu.task_coordination.milestone_id),
         version = tantu.task_coordination.version + 1`,
      [workspaceId, createdTask.id, payload.assigneeId, payload.milestoneId]
    );
  }

  const updatedCaptureResult = await client.query<CaptureItem>(
    `UPDATE tantu.capture_items
     SET status = 'converted', converted_record_id = $1, version = version + 1
     WHERE id = $2
     RETURNING
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
       version`,
    [createdTask.id, captureId]
  );
  const updatedCapture = updatedCaptureResult.rows[0];
  if (!updatedCapture) {
    throw new Failure(500, "DATABASE_ERROR", "Capture status could not be updated.");
  }

  return { task: createdTask, capture: updatedCapture };
}
