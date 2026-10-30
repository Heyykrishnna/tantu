import type { FastifyInstance } from "fastify";
import { email, object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import {
  acceptHandoverPack,
  createHandoverPack,
  createScenarioPlan,
  evaluateExposureMap,
  getAttentionBudget,
  listExposurePreviews,
  listFreshnessReviews,
  listHandoverPacks,
  listScenarioPlans,
  recordFreshnessVerification,
  revokeHandoverPack,
  updateAttentionBudget
} from "./service.js";
import type { ScenarioModification } from "./service.js";

const handoverParams = object({ workspaceId: uuid, packId: uuid });
const handoverTokenParams = object({ workspaceId: uuid, token: text(64) });
const pageFreshnessParams = object({ workspaceId: uuid, pageId: text(100) });

const scenarioModificationSchema = object(
  {
    entityId: text(100),
    field: text(50),
    baselineValue: {},
    simulatedValue: {}
  },
  ["entityId", "field"]
);

export function futureDiscoveryRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.post<{
    Params: { workspaceId: string };
    Body: {
      targetRecordId: string;
      targetRecordType: "page" | "task" | "project" | "collection";
      recipientEmail: string;
      accessLevel: "view" | "comment" | "edit" | "admin";
    };
  }>(
    root + "/exposure/preview",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            targetRecordId: text(100),
            targetRecordType: { type: "string", enum: ["page", "task", "project", "collection"] },
            recipientEmail: email,
            accessLevel: { type: "string", enum: ["view", "comment", "edit", "admin"] }
          },
          ["targetRecordId", "targetRecordType", "recipientEmail", "accessLevel"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const preview = await evaluateExposureMap(
          client,
          scope.workspaceId,
          request.body.targetRecordId,
          request.body.targetRecordType,
          request.body.recipientEmail,
          request.body.accessLevel,
          scope.userId
        );
        return { preview };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/exposure/previews",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const previews = await listExposurePreviews(client, scope.workspaceId);
        return { previews };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      title: string;
      toUserEmail: string;
      recordIds: string[];
      checklist?: Array<{ task: string; completed: boolean }>;
      notes?: string;
      expiryDays?: number;
    };
  }>(
    root + "/handovers",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            title: text(200),
            toUserEmail: email,
            recordIds: { type: "array", items: { type: "string" } },
            checklist: {
              type: "array",
              items: object({ task: text(200), completed: { type: "boolean" } }, ["task", "completed"])
            },
            notes: { type: "string", maxLength: 2000 },
            expiryDays: { type: "integer", minimum: 1, maximum: 90 }
          },
          ["title", "toUserEmail", "recordIds"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const pack = await createHandoverPack(client, scope.workspaceId, {
          title: request.body.title,
          fromUserId: scope.userId,
          toUserEmail: request.body.toUserEmail,
          recordIds: request.body.recordIds,
          checklist: request.body.checklist,
          notes: request.body.notes,
          expiryDays: request.body.expiryDays
        });
        return { pack };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/handovers",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const packs = await listHandoverPacks(client, scope.workspaceId);
        return { packs };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; token: string };
  }>(
    root + "/handovers/:token/accept",
    { schema: { params: handoverTokenParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const accepted = await acceptHandoverPack(client, scope.workspaceId, request.params.token);
        if (!accepted) {
          throw new Failure(404, "NOT_FOUND", "Handover pack not found or expired");
        }
        return { success: true };
      });
    }
  );

  app.delete<{
    Params: { workspaceId: string; packId: string };
  }>(
    root + "/handovers/:packId",
    { schema: { params: handoverParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const revoked = await revokeHandoverPack(client, scope.workspaceId, request.params.packId);
        if (!revoked) {
          throw new Failure(404, "NOT_FOUND", "Handover pack not found or already closed");
        }
        return { success: true };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/freshness",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const reviews = await listFreshnessReviews(client, scope.workspaceId);
        return { reviews };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; pageId: string };
    Body?: {
      reviewCadenceDays?: number;
    };
  }>(
    root + "/freshness/:pageId/verify",
    {
      schema: {
        params: pageFreshnessParams,
        body: object(
          {
            reviewCadenceDays: { type: "integer", minimum: 7, maximum: 365 }
          },
          []
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const review = await recordFreshnessVerification(
          client,
          scope.workspaceId,
          request.params.pageId,
          request.body?.reviewCadenceDays ?? 90,
          scope.userId
        );
        return { review };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      name: string;
      baselineProjectId?: string;
      description?: string;
      modifications: ScenarioModification[];
    };
  }>(
    root + "/scenarios",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            name: text(150),
            baselineProjectId: { type: "string" },
            description: { type: "string", maxLength: 1000 },
            modifications: { type: "array", items: scenarioModificationSchema }
          },
          ["name", "modifications"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const scenario = await createScenarioPlan(client, scope.workspaceId, {
          name: request.body.name,
          baselineProjectId: request.body.baselineProjectId,
          description: request.body.description,
          modifications: request.body.modifications,
          createdBy: scope.userId
        });
        return { scenario };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/scenarios",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const scenarios = await listScenarioPlans(client, scope.workspaceId);
        return { scenarios };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/attention-budget",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const budget = await getAttentionBudget(client, scope.workspaceId, scope.userId);
        return { budget };
      });
    }
  );

  app.put<{
    Params: { workspaceId: string };
    Body: {
      focusWindowStart?: string;
      focusWindowEnd?: string;
      batchingIntervalMinutes?: number;
      urgentBypassEnabled?: boolean;
    };
  }>(
    root + "/attention-budget",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            focusWindowStart: text(10),
            focusWindowEnd: text(10),
            batchingIntervalMinutes: { type: "integer", minimum: 15, maximum: 480 },
            urgentBypassEnabled: { type: "boolean" }
          },
          []
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const budget = await updateAttentionBudget(
          client,
          scope.workspaceId,
          scope.userId,
          request.body
        );
        return { budget };
      });
    }
  );
}
