import { choice, list, record, string } from "./api";
import { canonical } from "./api";
export function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Invalid number returned by the server.");
  return value;
}
export function project(value: unknown) {
  const data = record(value);
  return { id: string(data.id), title: string(data.title), ownerId: string(data.ownerId), visibility: choice(data.visibility, ["private", "workspace"]), state: choice(data.state, ["planning", "active", "at-risk", "completed", "archived"]), deadline: data.deadline === null ? null : string(data.deadline), version: integer(data.version) };
}
export function projects(value: unknown) { const data = record(value); return { items: list(data.items, project), nextCursor: data.nextCursor === null ? null : string(data.nextCursor) }; }
export function projectDetail(value: unknown) {
  const data = record(value); const rollup = record(data.rollup);
  return { project: project(data.project), items: list(data.items, canonical), truncated: data.truncated === true, total: integer(rollup.total), done: integer(rollup.done), estimated: integer(rollup.estimated), minutes: integer(rollup.minutes), dependencies: list(data.dependencies, (item) => { const edge = record(item); return { prerequisiteId: string(edge.prerequisiteId), dependentId: string(edge.dependentId) }; }) };
}
