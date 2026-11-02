import type { FastifyInstance } from "fastify";
import { invitationRoutes } from "./invitation-routes.js";
import { email, object, password, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import { digest } from "./credentials.js";
import { cookies } from "./service.js";
import type { Identity } from "./service.js";



export function identityRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  app.addHook("onSend", async (_request, reply) => { reply.header("cache-control", "no-store"); });
  app.post<{ Body: { email: string; password: string } }>("/api/v1/auth/login", { schema: { body: object({ email, password: text(256) }) } }, async (request, reply) => {
    identity.requireOrigin(request);
    const userId = await identity.login(request.body.email.toLowerCase(), request.body.password, request.ip);
    return identity.issueSession(userId, reply, cookies(request).get("tantu_session"));
  });
  app.post<{ Body: { email: string; name: string; password: string } }>("/api/v1/auth/register", { schema: { body: object({ email, name: text(100), password }) } }, async (request, reply) => {
    identity.requireOrigin(request);
    const result = await identity.register(request.body.email.toLowerCase(), request.body.name, request.body.password, request.ip);
    const session = await identity.issueSession(result.userId, reply, cookies(request).get("tantu_session"));
    return reply.code(201).send({
      user: { id: result.userId, email: request.body.email.toLowerCase(), name: request.body.name },
      workspaceId: result.workspaceId,
      ...session,
    });
  });
  app.post<{ Body: { email: string; name: string; password: string } }>("/api/v1/auth/signup/start", { schema: { body: object({ email, name: text(100), password }) } }, async (request) => {
    identity.requireOrigin(request);
    return identity.requestSignupVerification(request.body.email.toLowerCase(), request.body.name, request.body.password, request.ip);
  });
  app.post<{ Body: { email: string; code: string } }>("/api/v1/auth/signup/verify", { schema: { body: object({ email, code: text(10) }) } }, async (request, reply) => {
    identity.requireOrigin(request);
    const result = await identity.verifySignup(request.body.email.toLowerCase(), request.body.code);
    const session = await identity.issueSession(result.userId, reply, cookies(request).get("tantu_session"));
    return reply.code(201).send({
      user: { id: result.userId, email: request.body.email.toLowerCase(), name: result.name },
      workspaceId: result.workspaceId,
      ...session,
    });
  });
  app.post<{ Body: { email: string } }>("/api/v1/auth/signup/resend", { schema: { body: object({ email }) } }, async (request) => {
    identity.requireOrigin(request);
    return identity.resendSignupVerification(request.body.email.toLowerCase(), request.ip);
  });
  app.get("/api/v1/auth/session", async (request) => {
    const session = await identity.session(request);
    const csrf = cookies(request).get("tantu_csrf") ?? "";
    if (digest(csrf) !== session.csrfHash) throw new Failure(401, "SESSION_EXPIRED", "Sign in to continue.");
    return { user: { id: session.userId, email: session.email, name: session.name }, csrf };
  });
  app.get("/api/v1/auth/me", async (request) => {
    const session = await identity.session(request);
    return { user: { id: session.userId, email: session.email, name: session.name } };
  });
  app.post<{ Body: { currentPassword: string; newPassword: string } }>("/api/v1/auth/change-password", { schema: { body: object({ currentPassword: text(256), newPassword: password }) } }, async (request) => {
    const session = await identity.session(request, true);
    await identity.changePassword(session.userId, request.body.currentPassword, request.body.newPassword, cookies(request).get("tantu_session") ?? "");
    return { updated: true };
  });
  app.get("/api/v1/auth/sessions", async (request) => {
    const session = await identity.session(request);
    const items = await identity.listSessions(session.userId, cookies(request).get("tantu_session") ?? "");
    return { items };
  });
  app.delete<{ Params: { sessionId: string } }>("/api/v1/auth/sessions/:sessionId", { schema: { params: object({ sessionId: text(64) }) } }, async (request, reply) => {
    const session = await identity.session(request, true);
    const revoked = await identity.revokeSession(session.userId, request.params.sessionId);
    const currentToken = cookies(request).get("tantu_session") ?? "";
    if (digest(currentToken).startsWith(request.params.sessionId)) {
      reply.header("set-cookie", ["tantu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", "tantu_csrf=; Path=/; SameSite=Strict; Max-Age=0"]);
    }
    return { revoked };
  });
  app.post("/api/v1/auth/logout", async (request, reply) => {
    await identity.session(request, true);
    await db.pool.query("UPDATE tantu.sessions SET revoked_at=now() WHERE token_hash=$1", [digest(cookies(request).get("tantu_session") ?? "")]);
    reply.header("set-cookie", ["tantu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", "tantu_csrf=; Path=/; SameSite=Strict; Max-Age=0"]);
    return { signedOut: true };
  });
  app.post("/api/v1/auth/logout-all", async (request, reply) => {
    const session = await identity.session(request, true);
    await identity.logoutAll(session.userId);
    reply.header("set-cookie", ["tantu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", "tantu_csrf=; Path=/; SameSite=Strict; Max-Age=0"]);
    return { signedOut: true, revokedAll: true };
  });
  app.get("/api/v1/workspaces", async (request) => {
    const session = await identity.session(request);
    const result = await db.pool.query("SELECT w.id,w.name,w.icon,m.role FROM tantu.workspaces w JOIN tantu.memberships m ON m.workspace_id=w.id WHERE m.user_id=$1 AND m.active ORDER BY w.id LIMIT 100", [session.userId]);
    return { items: result.rows };
  });
  app.post<{ Body: { name: string } }>("/api/v1/workspaces", { schema: { body: object({ name: text(100) }) } }, async (request, reply) => {
    const session = await identity.session(request, true);
    const workspace = await db.transaction(undefined, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [session.userId]);
      const counts = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM tantu.memberships WHERE user_id=$1 AND active", [session.userId]);
      if ((counts.rows[0]?.count ?? 100) >= 100) throw new Failure(409, "QUOTA_EXCEEDED", "Workspace limit reached.");
      const result = await client.query<{ id: string; name: string }>("INSERT INTO tantu.workspaces(name) VALUES($1) RETURNING id,name,icon", [request.body.name]);
      const row = result.rows[0];
      if (!row) throw new Error("Workspace creation failed.");
      await client.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [row.id, session.userId]);
      return row;
    });
    return reply.code(201).send(workspace);
  });
  app.patch<{ Params: { workspaceId: string }; Body: { name?: string; icon?: string } }>("/api/v1/workspaces/:workspaceId", { schema: { params: workspaceParams, body: { ...object({ name: { ...text(100), pattern: "\\S" }, icon: { enum: ["⚡", "🚀", "💡", "🎯", "📚", "🏢", "🛠️", "🌐"] } }, []), minProperties: 1 } } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return db.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      const result = await client.query<{ id: string; name: string }>("UPDATE tantu.workspaces SET name=coalesce($1,name),icon=coalesce($3,icon) WHERE id=$2 RETURNING id,name,icon", [request.body.name?.trim(), scope.workspaceId, request.body.icon]);
      const row = result.rows[0];
      if (!row) throw new Failure(404, "NOT_FOUND", "Workspace not found.");
      return row;
    });
  });
  app.get<{ Params: { workspaceId: string } }>("/api/v1/workspaces/:workspaceId/members", { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      await identity.requireManager(client, scope);
      return { items: (await client.query("SELECT u.id,u.display_name AS name,u.email,m.role,m.active FROM tantu.memberships m JOIN tantu.users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.active ORDER BY u.id LIMIT 100", [scope.workspaceId])).rows };
    });
  });
  invitationRoutes(app, identity);
  app.patch<{ Params: { workspaceId: string; userId: string }; Body: { role: "owner" | "admin" | "member" | "guest" } }>("/api/v1/workspaces/:workspaceId/members/:userId", { schema: { params: object({ workspaceId: uuid, userId: uuid }), body: object({ role: { enum: ["owner", "admin", "member", "guest"] } }, ["role"]) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return db.transaction(scope, async (client) => {
      await client.query("SELECT id FROM tantu.workspaces WHERE id=$1 FOR UPDATE", [scope.workspaceId]);
      await identity.requireManager(client, scope);
      const member = await client.query<{ role: string }>("SELECT role FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active", [scope.workspaceId, request.params.userId]);
      if (!member.rows[0]) throw new Failure(404, "NOT_FOUND", "Member not found.");
      if (["owner", "admin"].includes(request.body.role) || ["owner", "admin"].includes(member.rows[0].role)) await identity.requireManager(client, scope, true);
      if (request.body.role === "owner") {
        if (member.rows[0].role === "guest") throw new Failure(409, "ROLE_TRANSITION_REQUIRED", "Promote this guest to member before transferring ownership.");
        if (request.params.userId === scope.userId) return { updated: true, role: "owner" };
        await client.query("UPDATE tantu.memberships SET role='admin' WHERE workspace_id=$1 AND user_id=$2", [scope.workspaceId, scope.userId]);
        await client.query("UPDATE tantu.memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2", [scope.workspaceId, request.params.userId]);
        return { updated: true, role: "owner", transferred: true };
      }
      if (member.rows[0].role === "owner") throw new Failure(409, "OWNER_PROTECTED", "Owner role cannot be changed directly. Transfer ownership instead.");
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
      await client.query("SELECT tantu.clear_member_access($1)", [request.params.userId]);
      await client.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [scope.workspaceId, request.params.userId]);
    });
    return { removed: true };
  });
}
