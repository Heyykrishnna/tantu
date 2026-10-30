export interface Actor {
  readonly id: string;
  readonly tenant: string;
  readonly role: "owner" | "admin" | "member" | "guest";
  readonly active: boolean;
}

export interface RecordScope {
  readonly id: string;
  readonly tenant: string;
  readonly owner: string;
  readonly visibility: "private" | "shared";
  readonly readers: readonly string[];
  readonly deleted: boolean;
  readonly version: number;
}

export function canReadFixture(actor: Actor, record: RecordScope): boolean {
  if (!actor.active || actor.tenant !== record.tenant || record.deleted) return false;
  if (record.owner === actor.id || record.readers.includes(actor.id)) return true;
  return record.visibility === "shared" && actor.role !== "guest";
}

export function canSeeFixtureRelationship(actor: Actor, left: RecordScope, right: RecordScope): boolean {
  return canReadFixture(actor, left) && canReadFixture(actor, right);
}

export function validateFixtureExecution(actor: Actor, record: RecordScope, expectedVersion: number, reviewed: boolean): void {
  if (!reviewed) throw new Error("Review required.");
  if (!canReadFixture(actor, record)) throw new Error("Current access denied.");
  if (record.version !== expectedVersion) throw new Error("Preview is stale.");
}

export type SendState = "draft" | "reviewed" | "pending" | "unknown" | "confirmed" | "failed";
export type SendEvent = "review" | "submit" | "timeout" | "provider-confirmation" | "reconciled-sent" | "definite-failure";

export function nextFixtureSendState(state: SendState, event: SendEvent): SendState {
  if (state === "draft" && event === "review") return "reviewed";
  if (state === "reviewed" && event === "submit") return "pending";
  if (state === "pending" && event === "timeout") return "unknown";
  if (state === "pending" && event === "provider-confirmation") return "confirmed";
  if (state === "unknown" && event === "reconciled-sent") return "confirmed";
  if ((state === "pending" || state === "unknown") && event === "definite-failure") return "failed";
  throw new Error("Unsupported transition; do not blindly repeat an external send.");
}
