import type { PoolClient } from "pg";
import type { Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import { buildInvitationEmail, invitationLink } from "../mail/invitation.js";
import { sendMail } from "../mail/smtp.js";
import { digest, secret } from "./credentials.js";
import { createAccount } from "./service.js";
import type { Identity, Session } from "./service.js";

export interface InvitationInput {
  email: string;
  role: "admin" | "member" | "guest";
  recordId?: string | null;
  permission: "read" | "edit";
  delivery?: "link" | "email";
}
export type InvitationUpdate = Omit<InvitationInput, "email" | "delivery">;
interface InvitationRow {
  token_hash: string;
  workspace_id: string;
  email: string;
  role: InvitationInput["role"];
  record_id: string | null;
  permission: "read" | "edit";
  created_by: string;
  accepted_at: string | null;
  expired: boolean;
}

export async function invitationLimit(identity: Identity, key: string, limit: number): Promise<void> {
  const result = await identity.database.pool.query<{ attempts: number }>("INSERT INTO tantu.login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN tantu.login_limits.reset_at<now() THEN 1 ELSE tantu.login_limits.attempts+1 END,reset_at=CASE WHEN tantu.login_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE tantu.login_limits.reset_at END RETURNING attempts", [digest(key)]);
  if ((result.rows[0]?.attempts ?? limit + 1) > limit) throw new Failure(429, "INVITATION_RATE_LIMITED", "Too many invitation requests. Try again later.");
}

async function lockWorkspace(client: PoolClient, workspaceId: string) {
  const result = await client.query<{ name: string }>("SELECT name FROM tantu.workspaces WHERE id=$1 FOR UPDATE", [workspaceId]);
  if (!result.rows[0]) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
  return result.rows[0];
}
async function validateScope(client: PoolClient, input: InvitationUpdate) {
  if (input.role === "guest" && !input.recordId) throw new Failure(400, "RECORD_REQUIRED", "Choose a record to invite this guest to.");
  if (input.recordId && !(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND tantu.can_access(id,true)", [input.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "The shared record is unavailable or cannot be shared by you.");
}
async function pending(client: PoolClient, workspaceId: string, id: string, accepting = false): Promise<InvitationRow> {
  const result = await client.query<InvitationRow>("SELECT *,expires_at<=now() AS expired FROM tantu.invitations WHERE workspace_id=$1 AND token_hash=$2 FOR UPDATE", [workspaceId, id]);
  const invitation = result.rows[0];
  if (!invitation) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable or already revoked.");
  if (invitation.accepted_at && accepting) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable, revoked, or expired.");
  if (invitation.accepted_at) throw new Failure(409, "INVITATION_ALREADY_ACCEPTED", "This invitation has already been accepted. Manage or remove the person's membership in People & Roles.");
  if (invitation.expired) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation has expired. Create a new invitation.");
  return invitation;
}

export async function createInvitation(identity: Identity, scope: Scope, input: InvitationInput) {
  const email = input.email.toLowerCase().trim();
  const token = secret();
  const id = digest(token);
  const workspace = await identity.database.transaction(scope, async client => {
    const workspace = await lockWorkspace(client, scope.workspaceId);
    await identity.requireManager(client, scope, input.role === "admin");
    await validateScope(client, input);
    if ((await client.query("SELECT 1 FROM tantu.memberships m JOIN tantu.users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND u.email=$2 AND m.active", [scope.workspaceId, email])).rowCount) throw new Failure(409, "ALREADY_A_MEMBER", "This person already belongs to the workspace. Change their access in People & Roles.");
    const count = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tantu.invitations WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at>now() AND email<>$2", [scope.workspaceId, email]);
    if ((count.rows[0]?.count ?? 100) >= 100) throw new Failure(409, "QUOTA_EXCEEDED", "Invitation limit reached.");
    await client.query("UPDATE tantu.invitations SET expires_at=least(expires_at,now()) WHERE workspace_id=$1 AND email=$2 AND accepted_at IS NULL", [scope.workspaceId, email]);
    await client.query("INSERT INTO tantu.invitations(token_hash,workspace_id,email,role,record_id,permission,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '72 hours',$7)", [id, scope.workspaceId, email, input.role, input.recordId ?? null, input.permission, scope.userId]);
    return workspace;
  });
  let delivery: { status: "not-requested" | "sent" | "unconfirmed"; message?: string } = { status: "not-requested" };
  if (input.delivery === "email") {
    try {
      await invitationLimit(identity, `invite-mail:${scope.workspaceId}:${email}`, 5);
      const inviter = await identity.database.pool.query<{ name: string }>("SELECT display_name AS name FROM tantu.users WHERE id=$1", [scope.userId]);
      if (!inviter.rows[0]) throw new Error("Inviter is unavailable.");
      await sendMail(identity.settings.smtp, buildInvitationEmail(email, workspace.name, inviter.rows[0].name, input.role, invitationLink(identity.settings.origin, token)));
      delivery = { status: "sent" };
    } catch {
      delivery = { status: "unconfirmed", message: "The invitation link is ready, but email delivery could not be confirmed. Copy and share the link." };
    }
  }
  return { id, token, link: invitationLink(identity.settings.origin, token), expiresInSeconds: 259200, delivery };
}

export async function updateInvitation(identity: Identity, scope: Scope, id: string, input: InvitationUpdate) {
  return identity.database.transaction(scope, async client => {
    await lockWorkspace(client, scope.workspaceId);
    await identity.requireManager(client, scope);
    const invitation = await pending(client, scope.workspaceId, id);
    if (input.role === "admin" || invitation.role === "admin") await identity.requireManager(client, scope, true);
    await validateScope(client, input);
    await client.query("UPDATE tantu.invitations SET role=$1,record_id=$2,permission=$3,created_by=$4 WHERE token_hash=$5 AND workspace_id=$6", [input.role, input.recordId ?? null, input.permission, scope.userId, id, scope.workspaceId]);
    return { updated: true };
  });
}

export async function revokeInvitation(identity: Identity, scope: Scope, id: string) {
  return identity.database.transaction(scope, async client => {
    await lockWorkspace(client, scope.workspaceId);
    await identity.requireManager(client, scope);
    const invitation = await pending(client, scope.workspaceId, id);
    if (invitation.role === "admin") await identity.requireManager(client, scope, true);
    await client.query("UPDATE tantu.invitations SET expires_at=now() WHERE token_hash=$1 AND workspace_id=$2 AND accepted_at IS NULL", [id, scope.workspaceId]);
    return { revoked: true };
  });
}

export async function previewInvitation(identity: Identity, token: string) {
  const result = await identity.database.pool.query<{ workspaceId: string; workspaceName: string; email: string; role: string; expiresAt: string }>("SELECT i.workspace_id AS \"workspaceId\",w.name AS \"workspaceName\",i.email,i.role,i.expires_at::text AS \"expiresAt\" FROM tantu.invitations i JOIN tantu.workspaces w ON w.id=i.workspace_id JOIN tantu.memberships m ON m.workspace_id=i.workspace_id AND m.user_id=i.created_by WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at>now() AND m.active AND (m.role='owner' OR (m.role='admin' AND i.role<>'admin'))", [digest(token.trim())]);
  const invitation = result.rows[0];
  if (!invitation) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable, revoked, or expired.");
  return { invitation };
}

export async function acceptInvitation(identity: Identity, token: string, input: { name?: string; password?: string }, authenticated?: Session) {
  return identity.database.transaction(undefined, async client => {
    const id = digest(token.trim());
    const lookup = await client.query<{ workspace_id: string }>("SELECT workspace_id FROM tantu.invitations WHERE token_hash=$1", [id]);
    const workspaceId = lookup.rows[0]?.workspace_id;
    if (!workspaceId) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable, revoked, or expired.");
    await lockWorkspace(client, workspaceId);
    const invitation = await pending(client, workspaceId, id, true);
    const inviter = await client.query<{ role: string }>("SELECT role FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active", [workspaceId, invitation.created_by]);
    const role = inviter.rows[0]?.role;
    if (!(role === "owner" || role === "admin" && invitation.role !== "admin")) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable, revoked, or expired.");
    await client.query("SELECT set_config('tantu.actor',$1,true),set_config('tantu.tenant',$2,true)", [invitation.created_by, workspaceId]);
    await validateScope(client, { role: invitation.role, recordId: invitation.record_id, permission: invitation.permission });
    const existing = await client.query<{ id: string }>("SELECT id FROM tantu.users WHERE email=$1", [invitation.email]);
    let userId = existing.rows[0]?.id;
    if (userId) {
      if (authenticated?.userId !== userId) throw new Failure(401, "SIGN_IN_REQUIRED", "Sign in to the invited account before accepting.");
    } else {
      if (authenticated || !input.name?.trim() || !input.password) throw new Failure(400, "ACCOUNT_REQUIRED", "Provide a name and password to create the invited account.");
      userId = await createAccount(client, invitation.email, input.name.trim(), input.password);
    }
    const current = await client.query<{ active: boolean }>("SELECT active FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE", [workspaceId, userId]);
    if (!current.rows[0]?.active) {
      await client.query("SELECT tantu.clear_member_access($1)", [userId]);
      await client.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET active=true,role=excluded.role", [workspaceId, userId, invitation.role]);
      if (invitation.record_id) await client.query("INSERT INTO tantu.grants(workspace_id,record_id,user_id,permission) VALUES($1,$2,$3,$4) ON CONFLICT(record_id,user_id) DO UPDATE SET permission=excluded.permission", [workspaceId, invitation.record_id, userId, invitation.permission]);
    }
    await client.query("UPDATE tantu.invitations SET accepted_at=now() WHERE token_hash=$1", [id]);
    return { userId, workspaceId };
  });
}
