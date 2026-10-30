import type { FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import type { RuntimeSettings } from "../../config/runtime.js";
import type { Database, Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import { digest, hashPassword, secret, verifyPassword } from "./credentials.js";

export interface Session { userId: string; email: string; name: string; csrfHash: string }

export function cookies(request: FastifyRequest): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (result.has(key)) throw new Failure(400, "INVALID_COOKIE", "Invalid session cookie.");
    result.set(key, part.slice(separator + 1).trim());
  }
  return result;
}

export class Identity {
  constructor(readonly database: Database, readonly settings: RuntimeSettings) {}

  requireOrigin(request: FastifyRequest): void {
    if (request.headers.origin !== this.settings.origin) throw new Failure(403, "ORIGIN_REJECTED", "Open the application at its configured address.");
  }

  async session(request: FastifyRequest, mutation = false): Promise<Session> {
    const token = cookies(request).get("tantu_session") ?? "";
    const result = await this.database.pool.query<Session>(
      'SELECT u.id AS "userId",u.email,u.display_name AS name,s.csrf_hash AS "csrfHash" FROM tantu.sessions s JOIN tantu.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()', [digest(token)],
    );
    const session = result.rows[0];
    if (!session) throw new Failure(401, "SESSION_EXPIRED", "Sign in to continue.");
    if (mutation) {
      this.requireOrigin(request);
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || digest(csrf) !== session.csrfHash) throw new Failure(403, "CSRF_REJECTED", "Refresh the application and try again.");
    }
    return session;
  }

  async scope(request: FastifyRequest, workspaceId: string, mutation = false): Promise<Scope> {
    const session = await this.session(request, mutation);
    const member = await this.database.pool.query("SELECT 1 FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active", [workspaceId, session.userId]);
    if (!member.rowCount) throw new Failure(404, "NOT_FOUND", "Workspace is unavailable.");
    return { userId: session.userId, workspaceId };
  }

  async requireManager(client: PoolClient, scope: Scope, ownerOnly = false): Promise<void> {
    const member = await client.query<{ role: string }>("SELECT role FROM tantu.memberships WHERE workspace_id=$1 AND user_id=$2 AND active FOR UPDATE", [scope.workspaceId, scope.userId]);
    if (!member.rows[0] || !(ownerOnly ? ["owner"] : ["owner", "admin"]).includes(member.rows[0].role)) throw new Failure(403, "FORBIDDEN", "Workspace management permission is required.");
  }

  async issueSession(userId: string, reply: FastifyReply, previous?: string): Promise<{ csrf: string }> {
    const token = secret();
    const csrf = secret();
    await this.database.transaction(undefined, async (client) => {
      if (previous) await client.query("UPDATE tantu.sessions SET revoked_at=now() WHERE token_hash=$1", [digest(previous)]);
      await client.query("INSERT INTO tantu.sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')", [digest(token), userId, digest(csrf)]);
    });
    const secure = this.settings.secureCookies ? "; Secure" : "";
    reply.header("set-cookie", [`tantu_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`, `tantu_csrf=${csrf}; Path=/; SameSite=Strict; Max-Age=28800${secure}`]);
    return { csrf };
  }

  async login(email: string, password: string, ip: string): Promise<string> {
    for (const [key, limit] of [["email:" + email, 8], ["ip:" + ip, 60]] as const) {
      const counts = await this.database.pool.query<{ attempts: number }>("INSERT INTO tantu.login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN tantu.login_limits.reset_at<now() THEN 1 ELSE tantu.login_limits.attempts+1 END,reset_at=CASE WHEN tantu.login_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE tantu.login_limits.reset_at END RETURNING attempts", [digest(key)]);
      if ((counts.rows[0]?.attempts ?? limit + 1) > limit) throw new Failure(429, "RATE_LIMITED", "Too many sign-in attempts. Try again in 15 minutes.");
    }
    const result = await this.database.pool.query<{ id: string; password_hash: string }>("SELECT id,password_hash FROM tantu.users WHERE email=$1", [email]);
    const user = result.rows[0];
    const fallback = "scrypt:00000000000000000000000000000000:" + "0".repeat(128);
    const valid = await verifyPassword(password, user?.password_hash ?? fallback);
    if (!user || !valid) throw new Failure(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    return user.id;
  }
}

export async function createAccount(client: PoolClient, email: string, name: string, password: string): Promise<string> {
  const passwordHash = await hashPassword(password);
  const user = await client.query<{ id: string }>("INSERT INTO tantu.users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id", [email.toLowerCase(), name, passwordHash]);
  const id = user.rows[0]?.id;
  if (!id) throw new Error("Account was not created.");
  return id;
}
