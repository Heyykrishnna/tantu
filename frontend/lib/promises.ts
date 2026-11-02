import { choice, items, list, record, string } from "./api.ts";

export interface PromiseItem {
  id: string;
  workspaceId: string;
  creatorId: string;
  creatorName?: string;
  responsibleId: string;
  responsibleName?: string;
  title: string;
  agreedDate: string | null;
  confirmationState: "inferred" | "confirmed";
  status: "pending" | "fulfilled" | "broken";
  sourceRecordId: string | null;
  taskId: string | null;
  taskTitle?: string | null;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function nullable(value: unknown) {
  return value === null ? null : string(value);
}

export function promiseItem(value: unknown): PromiseItem {
  const data = record(value);
  if (
    typeof data.version !== "number" ||
    !Number.isSafeInteger(data.version) ||
    data.version < 1
  )
    throw new Error("The server returned an invalid promise version.");
  return {
    id: string(data.id),
    workspaceId: string(data.workspaceId),
    creatorId: string(data.creatorId),
    responsibleId: string(data.responsibleId),
    title: string(data.title),
    agreedDate: nullable(data.agreedDate),
    confirmationState: choice(data.confirmationState, [
      "inferred",
      "confirmed",
    ]),
    status: choice(data.status, ["pending", "fulfilled", "broken"]),
    sourceRecordId: nullable(data.sourceRecordId),
    taskId: nullable(data.taskId),
    notes: string(data.notes),
    version: data.version,
    createdAt: string(data.createdAt),
    updatedAt: string(data.updatedAt),
    ...(data.creatorName === undefined
      ? {}
      : { creatorName: string(data.creatorName) }),
    ...(data.responsibleName === undefined
      ? {}
      : { responsibleName: string(data.responsibleName) }),
    ...(data.taskTitle === undefined
      ? {}
      : { taskTitle: nullable(data.taskTitle) }),
  };
}

export function promises(value: unknown): PromiseItem[] {
  return list(record(value).promises, promiseItem);
}
export function promiseResponse(value: unknown) {
  return { promise: promiseItem(record(value).promise) };
}
export const promisePeople = items((value) => {
  const data = record(value);
  return { id: string(data.id), name: string(data.name) };
});
