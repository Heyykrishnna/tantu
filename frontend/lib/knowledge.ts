import { canonical, choice, list, record, string } from "./api";
import { integer } from "./projects";
export interface Property { id: string; name: string; type: "text" | "number" | "boolean" | "date" | "select" | "formula"; options: string[]; formula: { operator: "add" | "subtract" | "multiply" | "divide"; left: string; right: string } | null }
export function property(value: unknown): Property {
  const item = record(value); const formula = item.formula ? record(item.formula) : null;
  return { id: string(item.id), name: string(item.name), type: choice(item.type, ["text", "number", "boolean", "date", "select", "formula"]), options: list(item.options, string), formula: formula ? { operator: choice(formula.operator, ["add", "subtract", "multiply", "divide"]), left: string(formula.left), right: string(formula.right) } : null };
}
export function collection(value: unknown) {
  const item = record(value);
  return { id: string(item.id), version: integer(item.version), properties: list(item.properties, property), canEdit: item.canEdit === true, nextCursor: item.nextCursor === null ? null : string(item.nextCursor), items: list(item.items, (value) => { const row = record(value); return { record: canonical(row.record), version: integer(row.itemVersion), storedValues: record(row.storedValues), values: record(row.values), repairs: list(row.repairs, (value) => { const repair = record(value); return { propertyId: string(repair.propertyId), message: string(repair.message) }; }) }; }) };
}
export function schemaReview(value: unknown) { const item = record(value); return { id: string(item.id), removed: list(item.removed, string), affected: integer(item.affectedVisibleRows), repair: string(item.repair) }; }
export function context(value: unknown) { const item = record(value); return { relations: list(item.relations, (value) => { const entry = record(value); return { sourceId: string(entry.sourceId), targetId: string(entry.targetId), type: string(entry.type), title: string(entry.title), kind: choice(entry.kind, ["task", "page"]) }; }), comments: list(item.comments, (value) => { const entry = record(value); return { id: string(entry.id), body: string(entry.body), author: string(entry.author), createdAt: string(entry.createdAt) }; }) }; }
