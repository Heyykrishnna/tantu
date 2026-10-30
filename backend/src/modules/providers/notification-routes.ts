import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { object, text, uuid } from "../../http/schema.js";
import { array, object as valueObject, string } from "../../platform/value.js";
import { Failure } from "../../platform/failure.js";
import { digest } from "../workspace-access/credentials.js";
import type { Providers } from "./service.js";
import type { Queue } from "../../workers/queue.js";
import { providerQueue } from "../../workers/queue.js";
import { notificationSettings } from "./subscriptions.js";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000, cooldownDuration: 30000 });
export async function verifyGoogleNotification(authorization: string | undefined, audience: string, email: string, keys: JWTVerifyGetKey = googleKeys): Promise<void> {
  if (!authorization?.startsWith("Bearer ") || authorization.length > 16384) throw new Failure(401, "INVALID_NOTIFICATION", "Notification authentication failed.");
  try { const { payload } = await jwtVerify(authorization.slice(7), keys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "email", "email_verified"], maxTokenAge: "1h" }); if (payload.email !== email || payload.email_verified !== true) throw new Error("Notification identity mismatch."); } catch { throw new Failure(401, "INVALID_NOTIFICATION", "Notification authentication failed."); }
}
export function notificationRoutes(app: FastifyInstance, providers: Providers, queue: Queue): void {
  const base = "/api/v1/provider-notifications/:provider/:workspaceId/:userId/:connectionId";
  const params = object({ provider: { enum: ["google", "microsoft"] }, workspaceId: uuid, userId: uuid, connectionId: uuid });
  app.post<{ Params: { provider: "google" | "microsoft"; workspaceId: string; userId: string; connectionId: string }; Querystring: { validationToken?: string }; Body: unknown }>(base + "/calendar", { schema: { params }, bodyLimit: 65536 }, async (request, reply) => {
    if (request.params.provider !== "google" || !notificationSettings()) throw new Failure(404, "NOT_FOUND", "Notifications unavailable.");
    await accept(request.params, "calendar", { id: request.headers["x-goog-channel-id"], secret: request.headers["x-goog-channel-token"], resourceId: request.headers["x-goog-resource-id"], notification: request.headers["x-goog-message-number"] }); return reply.code(204).send();
  });
  app.post<{ Params: { provider: "google" | "microsoft"; workspaceId: string; userId: string; connectionId: string }; Querystring: { validationToken?: string }; Body: unknown }>(base, { schema: { params, querystring: object({ validationToken: text(4096) }, []) }, bodyLimit: 65536 }, async (request, reply) => {
    const settings = notificationSettings(); if (!settings) throw new Failure(404, "NOT_FOUND", "Notifications unavailable.");
    if (request.params.provider === "microsoft") {
      if (request.query.validationToken) return reply.type("text/plain").send(request.query.validationToken);
      const values = array(valueObject(request.body).value); if (values.length > 100) throw new Failure(413, "NOTIFICATION_LIMIT", "Notification batch too large.");
      for (const value of values) { const row = valueObject(value); await accept(request.params, null, { id: row.subscriptionId, secret: row.clientState, notification: digest(JSON.stringify(row)), lifecycle: typeof row.lifecycleEvent === "string" ? row.lifecycleEvent : null }); }
    } else {
      if (!settings.googleAudience || !settings.googleEmail || !settings.googleSubscription) throw new Failure(503, "NOTIFICATIONS_DISABLED", "Google notification authentication is not configured.");
      await verifyGoogleNotification(request.headers.authorization, settings.googleAudience, settings.googleEmail);
      const envelope = valueObject(request.body); if (envelope.subscription !== settings.googleSubscription) throw new Failure(401, "INVALID_NOTIFICATION", "Unexpected subscription."); const message = valueObject(envelope.message); const payload = valueObject(JSON.parse(Buffer.from(string(message.data), "base64").toString("utf8")));
      await accept(request.params, "mail", { id: "gmail-watch", notification: message.messageId, address: payload.emailAddress });
    }
    return reply.code(202).send({ accepted: true });
  });
  async function accept(scope: { workspaceId: string; userId: string; connectionId: string; provider: "google" | "microsoft" }, kind: "mail" | "calendar" | null, hint: { id: unknown; secret?: unknown; notification: unknown; resourceId?: unknown; address?: unknown; lifecycle?: string | null }): Promise<void> {
    if (typeof hint.id !== "string" || typeof hint.notification !== "string" || hint.notification.length > 1024) throw new Failure(401, "INVALID_NOTIFICATION", "Notification authentication failed.");
    await providers.database.transaction(scope, async client => {
      const account = await providers.connection(client, scope.connectionId); if (account.provider !== scope.provider) throw new Failure(401, "INVALID_NOTIFICATION", "Provider mismatch.");
      const subscription = (await client.query<{ kind: "mail" | "calendar"; client_state: string; resource_id: string | null }>("SELECT kind,client_state,resource_id FROM tantu.provider_subscriptions WHERE connection_id=$1 AND external_id=$2 AND ($3::text IS NULL OR kind=$3) AND expires_at>now() FOR UPDATE", [scope.connectionId, hint.id, kind])).rows[0]; if (!subscription) throw new Failure(401, "INVALID_NOTIFICATION", "Unknown notification subscription.");
      if (scope.provider === "google" && kind === "mail") { if (hint.address !== account.address) throw new Failure(401, "INVALID_NOTIFICATION", "Mailbox mismatch."); }
      else if (typeof hint.secret !== "string" || !timingSafeEqual(Buffer.from(digest(hint.secret)), Buffer.from(digest(subscription.client_state))) || subscription.resource_id && hint.resourceId !== subscription.resource_id) throw new Failure(401, "INVALID_NOTIFICATION", "Notification authentication failed.");
      await client.query("DELETE FROM tantu.provider_notifications WHERE connection_id=$1 AND received_at<now()-interval '7 days'", [scope.connectionId]);
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM (SELECT 1 FROM tantu.provider_notifications WHERE connection_id=$1 LIMIT 10000)s", [scope.connectionId])).rows[0]?.count) >= 10000) return;
      const inserted = await client.query("INSERT INTO tantu.provider_notifications VALUES($1,$2,$3,now()) ON CONFLICT DO NOTHING RETURNING notification_id", [scope.workspaceId, scope.connectionId, digest(hint.id + ":" + hint.notification)]); if (!inserted.rowCount) return;
      if (hint.lifecycle) await client.query("UPDATE tantu.provider_subscriptions SET expires_at=now() WHERE connection_id=$1 AND kind=$2", [scope.connectionId, subscription.kind]);
      await queue.enqueue(client, providerQueue, randomUUID(), { ...scope, recordId: scope.connectionId, providerKind: subscription.kind });
    });
  }
}
