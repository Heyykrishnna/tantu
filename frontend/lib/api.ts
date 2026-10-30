import type { CanonicalRecord, Document } from "./contracts";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The server returned an invalid response.");
  return { ...value };
}
export function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("The server returned invalid text.");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("The server returned an invalid number.");
  return value;
}
export function choice<const T extends string>(value: unknown, options: readonly T[]): T {
  const found = options.find((option) => option === value);
  if (!found) throw new Error("The server returned an unsupported value.");
  return found;
}
function nullable(value: unknown): string | null { return value === null ? null : string(value); }
export function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("The server returned an invalid list.");
  return value.map(parse);
}
function document(value: unknown): Document {
  const data = record(value);
  if (data.type !== "doc") throw new Error("The document format is unsupported.");
  return {
    type: "doc", content: list(data.content, (value) => {
      const block = record(value);
      return {
        type: choice(block.type, ["paragraph", "heading"]), content: list(block.content, (value) => {
          const text = record(value);
          if (text.type !== "text") throw new Error("The document text is unsupported.");
          return { type: "text", text: string(text.text) };
        })
      };
    })
  };
}
export function canonical(value: unknown): CanonicalRecord {
  const data = record(value);
  if (typeof data.canEdit !== "boolean") throw new Error("The server returned invalid permissions.");
  return { id: string(data.id), workspaceId: string(data.workspaceId), ownerId: string(data.ownerId), kind: choice(data.kind, ["task", "page"]), title: string(data.title), visibility: choice(data.visibility, ["private", "workspace"]), parentId: nullable(data.parentId), body: document(data.body), status: choice(data.status, ["open", "done"]), priority: choice(data.priority, ["low", "normal", "high", "urgent"]), deadline: nullable(data.deadline), estimateMinutes: data.estimateMinutes === null ? null : number(data.estimateMinutes), version: number(data.version), canEdit: data.canEdit, createdAt: string(data.createdAt), updatedAt: string(data.updatedAt) };
}
export interface Workspace { id: string; name: string; role: "owner" | "admin" | "member" | "guest" }
export function workspace(value: unknown): Workspace { const data = record(value); return { id: string(data.id), name: string(data.name), role: choice(data.role, ["owner", "admin", "member", "guest"]) }; }
export interface User { id: string; email: string; name: string }
export function session(value: unknown) { const data = record(value); const user = record(data.user); return { csrf: string(data.csrf), user: { id: string(user.id), email: string(user.email), name: string(user.name) } }; }
export interface FileItem { id: string; name: string; state: "pending" | "clean" | "unavailable" | "rejected" | "deleted"; bytes: number }
export function file(value: unknown): FileItem { const data = record(value); return { id: string(data.id), name: string(data.name), state: choice(data.state, ["pending", "clean", "unavailable", "rejected", "deleted"]), bytes: number(data.bytes) }; }
export function items<T>(parse: (value: unknown) => T) { return (value: unknown) => list(record(value).items, parse); }
export function page(value: unknown) { const data = record(value); return { items: list(data.items, canonical), nextCursor: nullable(data.nextCursor) }; }
export function acknowledgment(value: unknown): void { record(value); }

export async function api<T>(path: string, parser: (value: unknown) => T, options: { method?: string; csrf?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, { method: options.method ?? "GET", credentials: "same-origin", cache: "no-store", headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.csrf ? { "x-csrf-token": options.csrf } : {}) }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), ...(options.signal ? { signal: options.signal } : {}) });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(0, "CONNECTION_LOST", "Could not confirm the request. Retry without changing your edit to reuse its operation key.");
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ApiError(response.status, "SERVICE_UNAVAILABLE", "The application service is unavailable. Try again shortly."); }
  if (!response.ok) {
    const failure = record(body);
    throw new ApiError(response.status, string(failure.code), string(failure.message));
  }
  return parser(body);
}
