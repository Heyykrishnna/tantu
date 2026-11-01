import type { FastifyInstance } from "fastify";
import { object, text, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import {
  generateMeetingBrief,
  getAiSettings,
  getMeetingBrief,
  listMeetingBriefs,
  updateAiSettings
} from "./service.js";

export function aiMeetingRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/ai/settings",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        const settings = await getAiSettings(client, scope.workspaceId);
        return { settings };
      });
    }
  );

  app.put<{
    Params: { workspaceId: string };
    Body: {
      isEnabled: boolean;
      provider?: "local-deterministic" | "openai" | "gemini" | "anthropic";
      allowedScopes?: string[];
      maxMonthlyTokens?: number;
    };
  }>(
    root + "/ai/settings",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            isEnabled: { type: "boolean" },
            provider: { type: "string", enum: ["local-deterministic", "openai", "gemini", "anthropic"] },
            allowedScopes: { type: "array", items: { type: "string" } },
            maxMonthlyTokens: { type: "integer", minimum: 1000, maximum: 10000000 }
          },
          ["isEnabled"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireManager(client, scope);
        const settings = await updateAiSettings(client, scope.workspaceId, scope.userId, request.body);
        return { settings };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
  }>(
    root + "/meetings/briefs",
    { schema: { params: workspaceParams } },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        const briefs = await listMeetingBriefs(client, scope.workspaceId);
        return { briefs };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; eventId: string };
  }>(
    root + "/meetings/:eventId/brief",
    {
      schema: {
        params: object({
          workspaceId: workspaceParams.properties.workspaceId,
          eventId: text(200)
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        const brief = await getMeetingBrief(client, scope.workspaceId, request.params.eventId);
        if (!brief) {
          throw new Failure(404, "NOT_FOUND", "Meeting brief not found.");
        }
        return { brief };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; eventId: string };
    Body: {
      title: string;
      meetingDate?: string;
      attendees?: Array<{ name: string; email: string }>;
    };
  }>(
    root + "/meetings/:eventId/brief",
    {
      schema: {
        params: object({
          workspaceId: workspaceParams.properties.workspaceId,
          eventId: text(200)
        }),
        body: object(
          {
            title: text(200),
            meetingDate: { type: "string", format: "date" },
            attendees: { type: "array" }
          },
          ["title"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, request.method !== "GET");
      return db.transaction(scope, async (client) => {
        await identity.requireContributor(client, scope);
        const brief = await generateMeetingBrief(
          client,
          scope.workspaceId,
          request.params.eventId,
          request.body
        );
        return { brief };
      });
    }
  );
}

