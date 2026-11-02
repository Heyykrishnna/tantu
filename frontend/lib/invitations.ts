import { choice, record, string } from "./api.ts";

export type InvitationRole = "admin" | "member" | "guest";
export interface PendingInvitation { id: string; email: string; role: InvitationRole; recordId: string | null; permission: "read" | "edit"; expiresAt: string }

export function invitationToken(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  try {
    const url = new URL(value, "http://invitation.local");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hash = new URLSearchParams(url.hash.slice(1));
    const token = hash.get("invite") ?? hash.get("invitation") ?? hash.get("token") ?? url.searchParams.get("invite") ?? url.searchParams.get("invitation") ?? url.searchParams.get("token");
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch { return null; }
}

export function locationInvitation(location: { search: string; hash: string }): string | null { return invitationToken("/" + location.search + location.hash); }
export function invitationDestination(workspaceId: string): string { return `/settings?w=${encodeURIComponent(workspaceId)}&section=members`; }
export function pendingInvitation(value: unknown): PendingInvitation {
  const data = record(value);
  return { id: string(data.id), email: string(data.email), role: choice(data.role, ["admin", "member", "guest"]), recordId: data.recordId === null ? null : string(data.recordId), permission: choice(data.permission, ["read", "edit"]), expiresAt: string(data.expiresAt) };
}
export function invitationCreated(value: unknown) {
  const data = record(value);
  const delivery = record(data.delivery);
  return { id: string(data.id), token: string(data.token), link: string(data.link), delivery: { status: choice(delivery.status, ["sent", "unconfirmed", "not-requested"]), message: delivery.message === undefined ? "" : string(delivery.message) } };
}
export function invitationPreview(value: unknown) {
  const data = record(record(value).invitation);
  return { workspaceId: string(data.workspaceId), workspaceName: string(data.workspaceName), email: string(data.email), role: choice(data.role, ["admin", "member", "guest"]), expiresAt: string(data.expiresAt) };
}
export function invitationAccepted(value: unknown) { const data = record(value); return { workspaceId: string(data.workspaceId), csrf: string(data.csrf) }; }
