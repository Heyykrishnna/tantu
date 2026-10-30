import { object, text, uuid } from "../../http/schema.js";

const inlineText = object({ type: { const: "text" }, text: { type: "string", maxLength: 4000 } });
const block = object({ type: { enum: ["paragraph", "heading"] }, content: { type: "array", maxItems: 100, items: inlineText } });
export const documentSchema = object({ type: { const: "doc" }, content: { type: "array", maxItems: 200, items: block } });
export interface Document { type: "doc"; content: { type: "paragraph" | "heading"; content: { type: "text"; text: string }[] }[] }
export interface RecordInput {
  title: string;
  visibility?: "private" | "workspace";
  parentId?: string | null;
  body?: Document;
  status?: "open" | "done";
  priority?: "low" | "normal" | "high" | "urgent";
  deadline?: string | null;
  estimateMinutes?: number | null;
}
export interface CanonicalRecord {
  id: string; workspaceId: string; ownerId: string; kind: "task" | "page"; title: string;
  visibility: "private" | "workspace"; parentId: string | null; body: Document; status: "open" | "done";
  priority: "low" | "normal" | "high" | "urgent"; deadline: string | null; estimateMinutes: number | null;
  version: number; createdAt: string; updatedAt: string;
}
export const recordColumns = 'id,workspace_id AS "workspaceId",owner_id AS "ownerId",kind,title,visibility,parent_id AS "parentId",body,status,priority,deadline::text,estimate_minutes AS "estimateMinutes",version,created_at AS "createdAt",updated_at AS "updatedAt"';
const fields = { title: { ...text(200), pattern: "\\S" }, visibility: { enum: ["private", "workspace"] }, parentId: { anyOf: [uuid, { type: "null" }] }, body: documentSchema, status: { enum: ["open", "done"] }, priority: { enum: ["low", "normal", "high", "urgent"] }, deadline: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] }, estimateMinutes: { anyOf: [{ type: "integer", minimum: 1, maximum: 10080 }, { type: "null" }] }, operationId: uuid };
export const createSchema = object(fields, ["title", "operationId"]);
export const updateSchema = object({ ...fields, expectedVersion: { type: "integer", minimum: 1 } }, ["operationId", "expectedVersion", "title"]);
export const recordParams = object({ workspaceId: uuid, recordId: uuid });
export const deleteSchema = object({ operationId: uuid, expectedVersion: { type: "integer", minimum: 1 } });
