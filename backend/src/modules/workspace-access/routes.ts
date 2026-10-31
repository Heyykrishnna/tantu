import type { FastifyInstance } from "fastify";
import { email, object, password, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import { digest, secret } from "./credentials.js";
import { cookies, createAccount } from "./service.js";
import type { Identity } from "./service.js";

interface Invitation { email: string; role: "admin" | "member" | "guest"; recordId?: string; permission: "read" | "edit" }

export function identityRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  app.addHook("onSend", async (_request, reply) => { reply.header("cache-control", "no-store"); });
  app.post<{ Body: { email: string; password: string } }>("/api/v1/auth/login", { schema: { body: object({ email, password: text(256) }) } }, async (request, reply) => {
    identity.requireOrigin(request);
    const userId = await identity.login(request.body.email.toLowerCase(), request.body.password, request.ip);
    return identity.issueSession(userId, reply, cookies(request).get("tantu_session"));
  });
  app.get("/api/v1/auth/session", async (request) => {
    const session = await identity.session(request);
    const csrf = cookies(request).get("tantu_csrf") ?? "";
    if (digest(csrf) !== session.csrfHash) throw new Failure(401, "SESSION_EXPIRED", "Sign in to continue.");
    return { user: { id: session.userId, email: session.email, name: session.name }, csrf };
  });
  app.post("/api/v1/auth/logout", async (request, reply) => {
    await identity.session(request, true);
    await db.pool.query("UPDATE tantu.sessions SET revoked_at=now() WHERE token_hash=$1", [digest(cookies(request).get("tantu_session") ?? "")]);
    reply.header("set-cookie", ["tantu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", "tantu_csrf=; Path=/; SameSite=Strict; Max-Age=0"]);
    return { signedOut: true };
  });
  app.get("/api/v1/workspaces", async (request) => {
    const session = await identity.session(request);
    const result = await db.pool.query("SELECT w.id,w.name,m.role FROM tantu.workspaces w JOIN tantu.memberships m ON m.workspace_id=w.id WHERE m.user_id=$1 AND m.active ORDER BY w.id LIMIT 100", [session.userId]);
    return { items: result.rows };
  });
  app.post<{ Body: { name: string } }>("/api/v1/workspaces", { schema: { body: object({ name: text(100) }) } }, async (request, reply) => {
    const session = await identity.session(request, true);
    const workspace = await db.transaction(undefined, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [session.userId]);
      const counts = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tantu.memberships WHERE user_id=$1 AND active", [session.userId]);
      if ((counts.rows[0]?.count ?? 100) >= 100) throw new Failure(409, "QUOTA_EXCEEDED", "Workspace limit reached.");
      const result = await client.query<{ id: string; name: string }>("INSERT INTO tantu.workspaces(name) VALUES($1) RETURNING id,name", [request.body.name]);
      const row = result.rows[0];
      if (!row) throw new Error("Workspace creation failed.");
      await client.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [row.id, session.userId]);
      return row;
    });
    return reply.code(201).send(workspace);
  });
  app.patch<{ Params: { workspaceId: string }; Body: { name: string } }>("/api/v1/workspaces/:workspaceId", { schema: { params: workspaceParams, body: object({ name: text(100) }, ["name"]) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return db.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      const result = await client.query<{ id: string; name: string }>("UPDATE tantu.workspaces SET name=$1 WHERE id=$2 RETURNING id,name", [request.body.name.trim(), scope.workspaceId]);
      const row = result.rows[0];
      if (!row) throw new Failure(404, "NOT_FOUND", "Workspace not found.");
      return row;
    });
  });
  app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/members", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      return { items: (await client.query("SELECT u.id,u.display_name AS name,u.email,m.role,m.active FROM tantu.memberships m JOIN tantu.users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY u.id LIMIT 100", [scope.workspaceId])).rows };
    });
  });
  app.post<{ Params: { workspaceId: string }; Body: Invitation }>("/api/v1/workspaces/:workspaceId/invitations", { schema: { params: workspaceParams, body: object({ email, role: { enum: ["admin", "member", "guest"] }, recordId: uuid, permission: { enum: ["read", "edit"] } }, ["email", "role", "permission"]) } }, async (request, reply) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    const token = secret();
    await db.transaction(scope, async (client) => {
      await identity.requireManager(client, scope, request.body.role === "admin");
      if (request.body.role === "guest" && !request.body.recordId) throw new Failure(400, "RECORD_REQUIRED", "Choose a record to invite this guest to.");
      if (request.body.recordId && !(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND tantu.can_access(id,true)", [request.body.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
      const active = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tantu.invitations WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at>now()", [scope.workspaceId]);
      if ((active.rows[0]?.count ?? 100) >= 100) throw new Failure(409, "QUOTA_EXCEEDED", "Invitation limit reached.");
      await client.query("INSERT INTO tantu.invitations(token_hash,workspace_id,email,role,record_id,permission,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '72 hours',$7)", [digest(token), scope.workspaceId, request.body.email.toLowerCase(), request.body.role, request.body.recordId ?? null, request.body.permission, scope.userId]);
    });
    return reply.code(201).send({ token, expiresInSeconds: 259200 });
  });
  app.post<{ Body: { token: string; name?: string; password?: string } }>("/api/v1/invitations/accept", { schema: { body: object({ token: text(100), name: text(100), password }, ["token"]) } }, async (request, reply) => {
    identity.requireOrigin(request);
    const authenticated = cookies(request).has("tantu_session") ? await identity.session(request, true) : undefined;
    const accepted = await db.transaction(undefined, async (client) => {
      const result = await client.query<{ workspace_id: string; email: string; role: string; record_id: string | null; permission: string; created_by: string }>("SELECT * FROM tantu.invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE", [digest(request.body.token)]);
      const invitation = result.rows[0];
      if (!invitation) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable or expired.");
      const inviter = await client.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active AND role IN ('owner','admin')", [invitation.workspace_id, invitation.created_by]);
      if (!inviter.rowCount) throw new Failure(404, "INVITATION_UNAVAILABLE", "Invitation is unavailable or expired.");
      const existing = await client.query<{ id: string }>("SELECT id FROM tantu.users WHERE email=$1", [invitation.email]);
      let userId = existing.rows[0]?.id;
      if (userId) {
        if (authenticated?.userId !== userId) throw new Failure(401, "SIGN_IN_REQUIRED", "Sign in to the invited account before accepting.");
      } else {
        if (authenticated || !request.body.name || !request.body.password) throw new Failure(400, "ACCOUNT_REQUIRED", "Provide a name and password to create the invited account.");
        userId = await createAccount(client, invitation.email, request.body.name, request.body.password);
      }
      await client.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET active=true,role=CASE WHEN tantu.memberships.role='owner' THEN 'owner' ELSE excluded.role END", [invitation.workspace_id, userId, invitation.role]);
      if (invitation.record_id) await client.query("INSERT INTO tantu.grants(workspace_id,record_id,user_id,permission) VALUES($1,$2,$3,$4) ON CONFLICT(record_id,user_id) DO UPDATE SET permission=excluded.permission", [invitation.workspace_id, invitation.record_id, userId, invitation.permission]);
      await client.query("UPDATE tantu.invitations SET accepted_at=now() WHERE token_hash=$1", [digest(request.body.token)]);
      return { userId, workspaceId: invitation.workspace_id };
    });
    return { workspaceId: accepted.workspaceId, ...await identity.issueSession(accepted.userId, reply, cookies(request).get("tantu_session")) };
  });
  app.patch<{ Params: { workspaceId: string; userId: string }; Body: { role: "admin" | "member" | "guest" } }>("/api/v1/workspaces/:workspaceId/members/:userId", { schema: { params: object({ workspaceId: uuid, userId: uuid }), body: object({ role: { enum: ["admin", "member", "guest"] } }, ["role"]) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return db.transaction(scope, async (client) => {
      await identity.requireManager(client, scope, true);
      const member = await client.query<{ role: string }>("SELECT role FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active", [scope.workspaceId, request.params.userId]);
      if (!member.rows[0]) throw new Failure(404, "NOT_FOUND", "Member not found.");
      if (member.rows[0].role === "owner") throw new Failure(409, "OWNER_PROTECTED", "Owner role cannot be changed.");
      await client.query("UPDATE tantu.memberships SET role=$1 WHERE workspace_id=$2 AND user_id=$3", [request.body.role, scope.workspaceId, request.params.userId]);
      return { updated: true, role: request.body.role };
    });
  });
  app.delete<{ Params: { workspaceId: string; userId: string } }>("/api/v1/workspaces/:workspaceId/members/:userId", { schema: { params: object({ workspaceId: uuid, userId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    await db.transaction(scope, async (client) => {
      await client.query("SELECT id FROM tantu.workspaces WHERE id=$1 FOR UPDATE", [scope.workspaceId]);
      if (request.params.userId !== scope.userId) await identity.requireManager(client, scope);
      const member = await client.query<{ role: string }>("SELECT role FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active", [scope.workspaceId, request.params.userId]);
      if (member.rows[0]?.role === "owner") throw new Failure(409, "OWNER_PROTECTED", "An owner cannot be removed through this endpoint.");
      if (member.rows[0]?.role === "admin" && request.params.userId !== scope.userId) await identity.requireManager(client, scope, true);
      await client.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [scope.workspaceId, request.params.userId]);
    });
    return { removed: true };
  });
}
