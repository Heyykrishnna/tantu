import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type { KitManifest } from "./service.js";
import {
  createWorkspaceKit,
  evaluateFormula,
  getSyncedBlock,
  installWorkspaceKit,
  listWorkspaceKits,
  previewKitInstallation,
  upsertSyncedBlock
} from "./service.js";

export function kitsCollaborationRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/kits",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const kits = await listWorkspaceKits(client, scope.workspaceId);
        return { kits };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      name: string;
      description?: string;
      version?: string;
      manifest: KitManifest;
    };
  }>(
    root + "/kits",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            name: text(100),
            description: { type: "string" },
            version: { type: "string" },
            manifest: { type: "object" }
          },
          ["name", "manifest"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const kit = await createWorkspaceKit(client, scope.workspaceId, scope.userId, request.body);
        return { kit };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; kitId: string };
  }>(
    root + "/kits/:kitId/preview",
    {
      schema: {
        params: object({
          workspaceId: uuid,
          kitId: uuid
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const preview = await previewKitInstallation(client, scope.workspaceId, request.params.kitId);
        return { preview };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; kitId: string };
    Body: {
      choices?: Record<string, "preserve_local" | "replace">;
    };
  }>(
    root + "/kits/:kitId/install",
    {
      schema: {
        params: object({
          workspaceId: uuid,
          kitId: uuid
        }),
        body: object({
          choices: { type: "object" }
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const result = await installWorkspaceKit(
          client,
          scope.workspaceId,
          scope.userId,
          request.params.kitId,
          request.body.choices ?? {}
        );
        return result;
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      expression: string;
      context?: Record<string, unknown>;
    };
  }>(
    root + "/formulas/evaluate",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            expression: { type: "string", maxLength: 500 },
            context: { type: "object" }
          },
          ["expression"]
        )
      }
    },
    async (request) => {
      await identity.scope(request, request.params.workspaceId);
      const evaluation = evaluateFormula(request.body.expression, request.body.context ?? {});
      return { evaluation };
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      canonicalEntityId: string;
      entityType: "page" | "task";
      content: Record<string, unknown>;
    };
  }>(
    root + "/synced-blocks",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            canonicalEntityId: uuid,
            entityType: { type: "string", enum: ["page", "task"] },
            content: { type: "object" }
          },
          ["canonicalEntityId", "entityType", "content"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const block = await upsertSyncedBlock(
          client,
          scope.workspaceId,
          request.body.canonicalEntityId,
          request.body.entityType,
          request.body.content
        );
        return { block };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; blockId: string };
  }>(
    root + "/synced-blocks/:blockId",
    {
      schema: {
        params: object({
          workspaceId: uuid,
          blockId: uuid
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const block = await getSyncedBlock(client, scope.workspaceId, request.params.blockId);
        if (!block) {
          throw new Failure(404, "NOT_FOUND", "Synced block not found.");
        }
        return { block };
      });
    }
  );
}

