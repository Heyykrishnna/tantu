import type { JSONContent } from "@tiptap/react";
import type * as Y from "yjs";
const marks = ["bold", "italic", "strike", "code"] as const;
interface Run { insert: string; attributes: Record<string, boolean> }
function mask(attributes: Record<string, unknown> | undefined): number { return marks.reduce((value, mark, index) => value + (attributes?.[mark] === true ? 1 << index : 0), 0); }
export function editorDocument(text: Y.Text): JSONContent {
  const delta: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta(); let offset = 0; const runs = delta.map(run => { const start = offset; offset += run.insert.length; return { ...run, start, end: offset }; }); let position = 0;
  return { type: "doc", content: text.toString().split("\n").map(line => { const heading = line.startsWith("# "); const start = position + (heading ? 2 : 0); const end = position + line.length; position = end + 1; const content = runs.filter(run => run.end > start && run.start < end).map(run => ({ type: "text", text: run.insert.slice(Math.max(0, start - run.start), Math.min(run.insert.length, end - run.start)), marks: marks.filter(mark => run.attributes?.[mark] === true).map(type => ({ type })) })); return { type: heading ? "heading" : "paragraph", ...(heading ? { attrs: { level: 1 } } : {}), content }; }) };
}
export function applyEditorDocument(target: Y.Text, document: JSONContent): void {
  const runs: Run[] = [];
  for (const [index, block] of (document.content ?? []).entries()) { if (index) runs.push({ insert: "\n", attributes: {} }); if (block.type === "heading") runs.push({ insert: "# ", attributes: {} }); for (const text of block.content ?? []) if (text.type === "text" && text.text) runs.push({ insert: text.text, attributes: Object.fromEntries((text.marks ?? []).filter(mark => marks.some(type => type === mark.type)).map(mark => [mark.type, true])) }); }
  const value = runs.map(run => run.insert).join(""); if (value.length > 100000 || value.split("\n").length > 200 || value.split("\n").some(line => line.length > 4000)) throw new Error("Page bodies support 200 lines, 4,000 characters per line and 100,000 characters total.");
  const before = target.toString(); let prefix = 0; while (prefix < before.length && prefix < value.length && before[prefix] === value[prefix]) prefix++; let suffix = 0; while (suffix < before.length - prefix && suffix < value.length - prefix && before[before.length - suffix - 1] === value[value.length - suffix - 1]) suffix++;
  target.doc?.transact(() => {
    const removed = before.length - prefix - suffix; if (removed) target.delete(prefix, removed); const inserted = value.slice(prefix, value.length - suffix); if (inserted) target.insert(prefix, inserted, {});
    const existing: { insert: string; attributes?: Record<string, unknown> }[] = target.toDelta(); let offset = 0; const segments = existing.map(run => { const start = offset; offset += run.insert.length; return { start, end: offset, mask: mask(run.attributes) }; }); let position = 0;
    for (const run of runs) { const end = position + run.insert.length; for (const segment of segments) { const start = Math.max(position, segment.start); const until = Math.min(end, segment.end); if (until > start && mask(run.attributes) !== segment.mask) target.format(start, until - start, Object.fromEntries(marks.map(mark => [mark, run.attributes[mark] === true ? true : null]))); } position = end; }
  });
}
