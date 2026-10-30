import type { FastifyInstance } from "fastify";
import type { Identity } from "../workspace-access/service.js";
import { object, uuid } from "../../http/schema.js";
import { notificationSettings } from "./subscriptions.js";
export function providerHealthRoutes(app: FastifyInstance, identity: Identity): void {
  app.get<{ Params: { workspaceId: string; connectionId: string } }>("/api/v1/workspaces/:workspaceId/providers/:connectionId/health", { schema: { params: object({ workspaceId: uuid, connectionId: uuid }) } }, async request => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return identity.database.transaction(scope, async client => ({ account: (await client.query('SELECT status,retry_at AS "retryAt",last_synced_at AS "lastSyncedAt" FROM tantu.provider_connections WHERE id=$1', [request.params.connectionId])).rows[0] ?? null, coverage: (await client.query('SELECT kind,coverage,updated_at AS "updatedAt" FROM tantu.provider_cursors WHERE connection_id=$1 ORDER BY kind', [request.params.connectionId])).rows, subscriptions: (await client.query('SELECT kind,expires_at AS "expiresAt" FROM tantu.provider_subscriptions WHERE connection_id=$1 ORDER BY kind', [request.params.connectionId])).rows, notificationsConfigured: !!notificationSettings(), reconciliation: "A running worker checks due accounts every 30 seconds and queues reconciliation at least every five minutes. Provider retry windows may delay work." }));
  });
}
