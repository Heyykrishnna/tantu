import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import {
  createApiKey,
  createWebhook,
  deleteWebhook,
  getIntegrationProviders,
  listApiKeys,
  listWebhookDeliveries,
  listWebhooks,
  recordWebhookDelivery,
  revokeApiKey,
  rotateWebhookSecret,
  updateWebhook
} from "./service.js";

const apiKeyParams = object({ workspaceId: uuid, keyId: uuid });
const webhookParams = object({ workspaceId: uuid, webhookId: uuid });

export function integrationsWebhooksRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/api-keys",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const apiKeys = await listApiKeys(client, scope.workspaceId);
        return { apiKeys };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      name: string;
      scopes: string[];
      expiresInDays?: number;
    };
  }>(
    root + "/api-keys",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            name: text(100),
            scopes: { type: "array", items: { type: "string" } },
            expiresInDays: { type: "integer", minimum: 1, maximum: 365 }
          },
          ["name", "scopes"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const result = await createApiKey(
          client,
          scope.workspaceId,
          request.body.name,
          request.body.scopes,
          request.body.expiresInDays
        );
        return result;
      });
    }
  );

  app.delete<{
    Params: { workspaceId: string; keyId: string };
  }>(
    root + "/api-keys/:keyId",
    { schema: { params: apiKeyParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const revoked = await revokeApiKey(client, scope.workspaceId, request.params.keyId);
        if (!revoked) {
          throw new Failure(404, "NOT_FOUND", "API key not found or already revoked");
        }
        return { success: true };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/webhooks",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const webhooks = await listWebhooks(client, scope.workspaceId);
        return { webhooks };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      targetUrl: string;
      subscribedEvents: string[];
    };
  }>(
    root + "/webhooks",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            targetUrl: { type: "string", minLength: 8, maxLength: 500 },
            subscribedEvents: { type: "array", items: { type: "string" } }
          },
          ["targetUrl", "subscribedEvents"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const result = await createWebhook(
          client,
          scope.workspaceId,
          request.body.targetUrl,
          request.body.subscribedEvents
        );
        return result;
      });
    }
  );

  app.patch<{
    Params: { workspaceId: string; webhookId: string };
    Body: {
      isActive: boolean;
      subscribedEvents?: string[];
    };
  }>(
    root + "/webhooks/:webhookId",
    {
      schema: {
        params: webhookParams,
        body: object(
          {
            isActive: { type: "boolean" },
            subscribedEvents: { type: "array", items: { type: "string" } }
          },
          ["isActive"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const webhook = await updateWebhook(
          client,
          scope.workspaceId,
          request.params.webhookId,
          request.body.isActive,
          request.body.subscribedEvents
        );
        return { webhook };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; webhookId: string };
  }>(
    root + "/webhooks/:webhookId/rotate-secret",
    { schema: { params: webhookParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const result = await rotateWebhookSecret(client, scope.workspaceId, request.params.webhookId);
        return result;
      });
    }
  );

  app.delete<{
    Params: { workspaceId: string; webhookId: string };
  }>(
    root + "/webhooks/:webhookId",
    { schema: { params: webhookParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const deleted = await deleteWebhook(client, scope.workspaceId, request.params.webhookId);
        if (!deleted) {
          throw new Failure(404, "NOT_FOUND", "Webhook not found");
        }
        return { success: true };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; webhookId: string };
    Body?: {
      eventType?: string;
    };
  }>(
    root + "/webhooks/:webhookId/test",
    {
      schema: {
        params: webhookParams,
        body: object({
          eventType: { type: "string" }
        }, [])
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const eventType = request.body?.eventType || "ping";
        const testPayload = {
          event: eventType,
          workspaceId: scope.workspaceId,
          timestamp: new Date().toISOString(),
          test: true
        };
        const delivery = await recordWebhookDelivery(
          client,
          request.params.webhookId,
          scope.workspaceId,
          eventType,
          testPayload,
          200,
          null
        );
        return { delivery, simulated: true };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; webhookId: string };
  }>(
    root + "/webhooks/:webhookId/deliveries",
    { schema: { params: webhookParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const deliveries = await listWebhookDeliveries(client, scope.workspaceId, request.params.webhookId);
        return { deliveries };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/integrations/providers",
    { schema: { params: workspaceParams } },
    async (request) => {
      await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      const providers = getIntegrationProviders();
      return { providers };
    }
  );
}
