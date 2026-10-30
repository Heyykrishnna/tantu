import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { PoolClient } from "pg";
import type { Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import type { CanonicalRecord, Document } from "../work-management/contracts.js";
import type { Records } from "../work-management/service.js";
import { recordColumns } from "../work-management/contracts.js";

export function documentText(body: Document): string { return body.content.map((block) => (block.type === "heading" ? "# " : "") + block.content.map((text) => text.text).join("")).join("\n"); }
export function textDocument(text: string): Document {
  const lines = text.split("\n");
  if (text.length > 100000 || lines.length > 200 || lines.some((line) => line.length > 4000)) throw new Failure(413, "DOCUMENT_LIMIT", "Page text supports at most 200 lines, 4,000 characters per line and 100,000 characters in total.");
  return { type: "doc", content: lines.map((line) => ({ type: line.startsWith("# ") ? "heading" : "paragraph", content: line ? [{ type: "text", text: line.replace(/^# /, "") }] : [] })) };
}
export function updateBytes(value: string): Buffer {
  const bytes = Buffer.from(value, "base64"); if (!bytes.length || bytes.length > 131072 || bytes.toString("base64") !== value) throw new Failure(400, "INVALID_UPDATE", "Use a canonical base64 document update of at most 128 KiB."); return bytes;
}
export async function pageDocument(client: PoolClient, id: string, editing: boolean): Promise<{ record: CanonicalRecord; state: Buffer | null }> {
  const record = (await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE id=$1 AND kind='page' ${editing ? "AND tantu.can_access(id,true) FOR UPDATE" : ""}`, [id])).rows[0];
  if (!record) throw new Failure(404, "NOT_FOUND", "Page is unavailable.");
  const state = (await client.query<{ state: Buffer }>("SELECT state FROM tantu.page_collaboration WHERE record_id=$1", [id])).rows[0]?.state ?? null;
  return { record, state };
}
export function hydrate(body: Document, state: Buffer | null): Y.Doc {
  const doc = new Y.Doc(); if (state) Y.applyUpdate(doc, state); else doc.getText("body").insert(0, documentText(body)); return doc;
}
export async function persistDocument(client: PoolClient, scope: Scope, records: Records, record: CanonicalRecord, doc: Y.Doc, operationId = randomUUID()): Promise<{ id: string; version: number }> {
  if ([...doc.share.keys()].some((name) => name !== "body")) throw new Failure(400, "INVALID_UPDATE", "Only the page-body text is collaborative.");
  const body = textDocument(doc.getText("body").toString()); const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  if (state.length > 262144) throw new Failure(413, "DOCUMENT_CAPACITY", "This collaborative document reached its snapshot capacity. Keep your browser draft and export its text before starting a new page.");
  const result = await records.mutateIn(client, scope, "page", operationId, { title: record.title, body }, record.id, record.version, true);
  if ("deleted" in result) throw new Error("Page update unexpectedly deleted its record.");
  await client.query("INSERT INTO tantu.page_collaboration(workspace_id,record_id,state,version) VALUES($1,$2,$3,$4) ON CONFLICT(record_id) DO UPDATE SET state=excluded.state,version=excluded.version", [scope.workspaceId, record.id, state, result.version]);
  return { id: record.id, version: result.version };
}
