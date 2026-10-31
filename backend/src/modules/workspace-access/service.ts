import type { FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import type { RuntimeSettings } from "../../config/runtime.js";
import type { Database, Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import { digest, hashPassword, secret, validatePassword, verifyPassword } from "./credentials.js";
import { sendMail } from "../mail/smtp.js";
import { buildVerificationEmail, generateVerificationCode, normalizeVerificationCode } from "../mail/verification.js";

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
  constructor(readonly database: Database, readonly settings: RuntimeSettings) { }

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

  async register(email: string, name: string, password: string, ip: string): Promise<{ userId: string; workspaceId: string }> {
    const counts = await this.database.pool.query<{ attempts: number }>(
      "INSERT INTO tantu.login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN tantu.login_limits.reset_at<now() THEN 1 ELSE tantu.login_limits.attempts+1 END,reset_at=CASE WHEN tantu.login_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE tantu.login_limits.reset_at END RETURNING attempts",
      [digest("register:" + ip)],
    );
    if ((counts.rows[0]?.attempts ?? 31) > 30) throw new Failure(429, "RATE_LIMITED", "Too many account registrations from this network. Try again later.");
    return this.database.transaction(undefined, async (client) => {
      const existing = await client.query("SELECT id FROM tantu.users WHERE email=$1", [email.toLowerCase()]);
      if (existing.rowCount) throw new Failure(409, "ACCOUNT_EXISTS", "An account with this email address already exists.");
      const userId = await createAccount(client, email, name, password);
      const workspaceName = `${name.trim()}'s Workspace`;
      const workspace = await client.query<{ id: string }>("INSERT INTO tantu.workspaces(name) VALUES($1) RETURNING id", [workspaceName]);
      const workspaceId = workspace.rows[0]?.id;
      if (!workspaceId) throw new Error("Workspace creation failed.");
      await client.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspaceId, userId]);
      return { userId, workspaceId };
    });
  }

  async requestSignupVerification(email: string, name: string, password: string, ip: string): Promise<{ sent: boolean; email: string }> {
    validatePassword(password);
    for (const [key, limit] of [["signup-email:" + email.toLowerCase(), 5], ["signup-ip:" + ip, 20]] as const) {
      const counts = await this.database.pool.query<{ attempts: number }>(
        "INSERT INTO tantu.login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN tantu.login_limits.reset_at<now() THEN 1 ELSE tantu.login_limits.attempts+1 END,reset_at=CASE WHEN tantu.login_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE tantu.login_limits.reset_at END RETURNING attempts",
        [digest(key)],
      );
      if ((counts.rows[0]?.attempts ?? limit + 1) > limit) {
        throw new Failure(429, "RATE_LIMITED", "Too many verification requests. Please try again in 15 minutes.");
      }
    }
    const existing = await this.database.pool.query("SELECT id FROM tantu.users WHERE email=$1", [email.toLowerCase()]);
    if (existing.rowCount) throw new Failure(409, "ACCOUNT_EXISTS", "An account with this email address already exists.");

    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    await this.database.pool.query(
      "INSERT INTO tantu.email_verifications(email, code_hash, name, password_hash, attempts, expires_at, created_at) VALUES($1, $2, $3, $4, 0, now() + interval '15 minutes', now()) ON CONFLICT (email) DO UPDATE SET code_hash=excluded.code_hash, name=excluded.name, password_hash=excluded.password_hash, attempts=0, expires_at=now() + interval '15 minutes', created_at=now()",
      [email.toLowerCase(), digest(code), name.trim(), passwordHash],
    );

    const message = buildVerificationEmail(name.trim(), code);
    await sendMail(this.settings.smtp, { to: email.toLowerCase(), ...message });
    return { sent: true, email: email.toLowerCase() };
  }

  async verifySignup(email: string, code: string): Promise<{ userId: string; workspaceId: string; name: string }> {
    const cleanCode = normalizeVerificationCode(code);
    const result = await this.database.pool.query<{ name: string; password_hash: string; code_hash: string; attempts: number; expired: boolean }>(
      "SELECT name, password_hash, code_hash, attempts, (expires_at < now()) AS expired FROM tantu.email_verifications WHERE email=$1",
      [email.toLowerCase()],
    );
    const verification = result.rows[0];
    if (!verification || verification.expired) {
      throw new Failure(400, "CODE_EXPIRED", "Verification code has expired or was not requested. Please request a new code.");
    }
    if (verification.attempts >= 5) {
      await this.database.pool.query("DELETE FROM tantu.email_verifications WHERE email=$1", [email.toLowerCase()]);
      throw new Failure(429, "TOO_MANY_ATTEMPTS", "Too many incorrect verification attempts. Please request a new code.");
    }
    if (digest(cleanCode) !== verification.code_hash) {
      await this.database.pool.query("UPDATE tantu.email_verifications SET attempts=attempts+1 WHERE email=$1", [email.toLowerCase()]);
      throw new Failure(400, "INVALID_CODE", "Invalid verification code.");
    }

    return this.database.transaction(undefined, async (client) => {
      await client.query("DELETE FROM tantu.email_verifications WHERE email=$1", [email.toLowerCase()]);
      const existing = await client.query("SELECT id FROM tantu.users WHERE email=$1", [email.toLowerCase()]);
      if (existing.rowCount) throw new Failure(409, "ACCOUNT_EXISTS", "An account with this email address already exists.");

      const user = await client.query<{ id: string }>(
        "INSERT INTO tantu.users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id",
        [email.toLowerCase(), verification.name, verification.password_hash],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new Error("Account creation failed.");

      const workspaceName = `${verification.name.trim()}'s Workspace`;
      const workspace = await client.query<{ id: string }>("INSERT INTO tantu.workspaces(name) VALUES($1) RETURNING id", [workspaceName]);
      const workspaceId = workspace.rows[0]?.id;
      if (!workspaceId) throw new Error("Workspace creation failed.");

      await client.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspaceId, userId]);
      return { userId, workspaceId, name: verification.name };
    });
  }

  async resendSignupVerification(email: string, ip: string): Promise<{ sent: boolean; email: string }> {
    for (const [key, limit] of [["signup-resend:" + email.toLowerCase(), 3], ["signup-resend-ip:" + ip, 10]] as const) {
      const counts = await this.database.pool.query<{ attempts: number }>(
        "INSERT INTO tantu.login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN tantu.login_limits.reset_at<now() THEN 1 ELSE tantu.login_limits.attempts+1 END,reset_at=CASE WHEN tantu.login_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE tantu.login_limits.reset_at END RETURNING attempts",
        [digest(key)],
      );
      if ((counts.rows[0]?.attempts ?? limit + 1) > limit) {
        throw new Failure(429, "RATE_LIMITED", "Too many resend attempts. Please wait 15 minutes before requesting again.");
      }
    }

    const result = await this.database.pool.query<{ name: string }>(
      "SELECT name FROM tantu.email_verifications WHERE email=$1",
      [email.toLowerCase()],
    );
    const row = result.rows[0];
    if (!row) throw new Failure(404, "SIGNUP_NOT_FOUND", "No pending sign-up found for this email address. Please sign up again.");

    const code = generateVerificationCode();
    await this.database.pool.query(
      "UPDATE tantu.email_verifications SET code_hash=$1, attempts=0, expires_at=now()+interval '15 minutes' WHERE email=$2",
      [digest(code), email.toLowerCase()],
    );

    const message = buildVerificationEmail(row.name, code);
    await sendMail(this.settings.smtp, { to: email.toLowerCase(), ...message });
    return { sent: true, email: email.toLowerCase() };
  }

  async changePassword(userId: string, current: string, next: string, currentSessionToken: string): Promise<void> {
    if (current === next) throw new Failure(400, "PASSWORD_REUSED", "New password must be different from current password.");
    const user = await this.database.pool.query<{ password_hash: string }>("SELECT password_hash FROM tantu.users WHERE id=$1", [userId]);
    const currentHash = user.rows[0]?.password_hash;
    if (!currentHash || !(await verifyPassword(current, currentHash))) {
      throw new Failure(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }
    const nextHash = await hashPassword(next);
    await this.database.transaction(undefined, async (client) => {
      await client.query("UPDATE tantu.users SET password_hash=$1 WHERE id=$2", [nextHash, userId]);
      await client.query("UPDATE tantu.sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL", [userId, digest(currentSessionToken)]);
    });
  }

  async listSessions(userId: string, currentToken: string): Promise<Array<{ id: string; createdAt: string; expiresAt: string; current: boolean }>> {
    const currentHash = digest(currentToken);
    const result = await this.database.pool.query<{ token_hash: string; created_at: string; expires_at: string }>(
      "SELECT token_hash,created_at,expires_at FROM tantu.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 50",
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.token_hash.slice(0, 16),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      current: row.token_hash === currentHash,
    }));
  }

  async revokeSession(userId: string, sessionPrefix: string): Promise<boolean> {
    const cleanPrefix = sessionPrefix.replace(/[^a-f0-9]/gi, "");
    if (cleanPrefix.length < 8) throw new Failure(400, "INVALID_SESSION_ID", "Session identifier is invalid.");
    const result = await this.database.pool.query(
      "UPDATE tantu.sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash LIKE $2 || '%' AND revoked_at IS NULL",
      [userId, cleanPrefix],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async logoutAll(userId: string): Promise<void> {
    await this.database.pool.query("UPDATE tantu.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
  }
}

export async function createAccount(client: PoolClient, email: string, name: string, password: string): Promise<string> {
  const passwordHash = await hashPassword(password);
  try {
    const user = await client.query<{ id: string }>("INSERT INTO tantu.users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id", [email.toLowerCase(), name, passwordHash]);
    const id = user.rows[0]?.id;
    if (!id) throw new Error("Account was not created.");
    return id;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505") {
      throw new Failure(409, "ACCOUNT_EXISTS", "An account with this email address already exists.");
    }
    throw error;
  }
}
