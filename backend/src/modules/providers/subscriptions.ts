import { randomBytes, randomUUID } from "node:crypto";
import type { Scope } from "../../platform/database/database.js";
import type { Providers } from "./service.js";
import { object, string } from "../../platform/value.js";
import { ProviderFailure } from "./http.js";
export interface NotificationSettings { origin: string; googleTopic: string | null; googleAudience: string | null; googleEmail: string | null; googleSubscription: string | null }
export function notificationSettings(environment = process.env): NotificationSettings | null {
  const origin = environment.PROVIDER_NOTIFICATION_ORIGIN; if (!origin) return null;
  const url = new URL(origin); if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw new Error("PROVIDER_NOTIFICATION_ORIGIN must be an HTTPS origin.");
  const googleTopic = environment.GOOGLE_PUBSUB_TOPIC ?? null; const googleAudience = environment.GOOGLE_PUBSUB_AUDIENCE ?? null; const googleEmail = environment.GOOGLE_PUBSUB_SERVICE_EMAIL ?? null; const googleSubscription = environment.GOOGLE_PUBSUB_SUBSCRIPTION ?? null;
  if ([googleTopic, googleAudience, googleEmail, googleSubscription].some(Boolean) && ![googleTopic, googleAudience, googleEmail, googleSubscription].every(Boolean)) throw new Error("Google Pub/Sub requires topic, audience, service email and subscription configuration together.");
  if (googleTopic && !/^projects\/[a-z0-9-]+\/topics\/[A-Za-z0-9._~-]+$/.test(googleTopic)) throw new Error("Invalid Google Pub/Sub topic.");
  return { origin, googleTopic, googleAudience, googleEmail, googleSubscription };
}
export async function renewSubscriptions(providers: Providers, scope: Scope, connectionId: string): Promise<void> {
  const settings = notificationSettings(); if (!settings) return;
  await providers.database.transaction(scope, async client => {
    const account = await providers.connection(client, connectionId); const token = await providers.access(client, account);
    for (const kind of ["mail", "calendar"] as const) {
      if (account.provider === "google" && kind === "mail" && !settings.googleTopic) continue;
      const previous = (await client.query<{ external_id: string; client_state: string; expires_at: Date; resource_id: string | null }>("SELECT * FROM tantu.provider_subscriptions WHERE connection_id=$1 AND kind=$2 FOR UPDATE", [connectionId, kind])).rows[0]; if (previous && previous.expires_at.getTime() > Date.now() + 86400000) continue;
      const clientState = previous?.client_state ?? randomBytes(32).toString("base64url"); const callback = settings.origin + `/api/v1/provider-notifications/${account.provider}/${scope.workspaceId}/${scope.userId}/${connectionId}`;
      let id: string; let expires: Date; let resource: string | null = null;
      try {
        if (account.provider === "google" && kind === "mail") { const result = object(await providers.http.request("google", token, "/gmail/v1/users/me/watch", "POST", { topicName: settings.googleTopic })); id = "gmail-watch"; expires = new Date(Number(result.expiration)); }
        else if (account.provider === "google") { id = randomUUID(); const result = object(await providers.http.request("google", token, "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch", "POST", { id, type: "web_hook", address: callback + "/calendar", token: clientState, params: { ttl: "604800" } })); resource = string(result.resourceId); expires = new Date(Number(result.expiration)); }
        else { const expirationDateTime = new Date(Date.now() + 3 * 86400000).toISOString(); const result = object(await providers.http.request("microsoft", token, previous ? "/v1.0/subscriptions/" + encodeURIComponent(previous.external_id) : "/v1.0/subscriptions", previous ? "PATCH" : "POST", previous ? { expirationDateTime } : { changeType: "created,updated,deleted", notificationUrl: callback, lifecycleNotificationUrl: callback, resource: kind === "mail" ? "/me/messages" : "/me/events", expirationDateTime, clientState })); id = string(result.id); expires = new Date(string(result.expirationDateTime)); }
      } catch (error) { if (error instanceof ProviderFailure && error.providerStatus === 404 && previous) { await client.query("DELETE FROM tantu.provider_subscriptions WHERE connection_id=$1 AND kind=$2", [connectionId, kind]); continue; } throw error; }
      if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error("Provider subscription expiration invalid.");
      await client.query("INSERT INTO tantu.provider_subscriptions(workspace_id,connection_id,kind,external_id,client_state,expires_at,resource_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(connection_id,kind) DO UPDATE SET external_id=excluded.external_id,client_state=excluded.client_state,expires_at=excluded.expires_at,resource_id=excluded.resource_id", [scope.workspaceId, connectionId, kind, id, clientState, expires, resource]);
      if (account.provider === "google" && kind === "calendar" && previous?.resource_id) await providers.http.request("google", token, "https://www.googleapis.com/calendar/v3/channels/stop", "POST", { id: previous.external_id, resourceId: previous.resource_id });
    }
  });
}
