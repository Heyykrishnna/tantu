import type * as Y from "yjs";
import type { Document } from "../work-management/contracts.js";
import { Failure } from "../../platform/failure.js";
const marks = ["bold", "italic", "strike", "code"] as const;
export function insertDocument(target: Y.Text, body: Document): void {
  let offset = 0;
  for (const [index, block] of body.content.entries()) {
    if (index) { target.insert(offset, "\n", {}); offset++; }
    if (block.type === "heading") { target.insert(offset, "# ", {}); offset += 2; }
    for (const run of block.content) { if (run.text) target.insert(offset, run.text, Object.fromEntries((run.marks ?? []).map(mark => [mark.type, true]))); offset += run.text.length; }
  }
}
export function richDocument(shared: Y.Text): Document {
  const delta: unknown[] = shared.toDelta(); const runs: { start: number; end: number; text: string; marks: NonNullable<Document["content"][number]["content"][number]["marks"]> }[] = []; let offset = 0;
  if (Object.keys(shared.getAttributes()).length) throw new Failure(400, "INVALID_UPDATE", "Document attributes are unsupported.");
  for (const value of delta) {
    if (typeof value !== "object" || !value || !("insert" in value) || typeof value.insert !== "string") throw new Failure(400, "INVALID_UPDATE", "Embedded objects are unsupported.");
    const attributes = "attributes" in value ? value.attributes : undefined;
    if (attributes !== undefined && (typeof attributes !== "object" || !attributes || Object.entries(attributes).some(([key, value]) => !marks.some(mark => mark === key) || value !== true))) throw new Failure(400, "INVALID_UPDATE", "Only bold, italic, strike and code marks are supported.");
    const active = marks.filter(mark => attributes && mark in attributes).map(type => ({ type })); runs.push({ start: offset, end: offset + value.insert.length, text: value.insert, marks: active }); offset += value.insert.length;
  }
  const text = shared.toString(); const lines = text.split("\n"); if (text.length > 100000 || lines.length > 200 || lines.some(line => line.length > 4000)) throw new Failure(413, "DOCUMENT_LIMIT", "Page bodies support 200 lines, 4,000 characters per line and 100,000 total characters.");
  let position = 0;
  return { type: "doc", content: lines.map(line => {
    const heading = line.startsWith("# "); const start = position + (heading ? 2 : 0); const end = position + line.length; position = end + 1;
    const content = runs.filter(run => run.end > start && run.start < end).map(run => ({ type: "text" as const, text: run.text.slice(Math.max(0, start - run.start), Math.min(run.text.length, end - run.start)), ...(run.marks.length ? { marks: run.marks } : {}) })); if (content.length > 100) throw new Failure(413, "DOCUMENT_LIMIT", "A line supports at most 100 formatting runs."); return { type: heading ? "heading" : "paragraph", content };
  }) };
}
