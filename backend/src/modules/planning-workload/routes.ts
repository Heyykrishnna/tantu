import type { FastifyInstance } from "fastify";
import { object, uuid, workspaceParams } from "../../http/schema.js";
import type { Identity } from "../workspace-access/service.js";
import {
  applyDailyPlan,
  calculateWorkloadWeather,
  generateDailyPlan,
  getDailyPlan
} from "./service.js";

export function planningWorkloadRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId/planning";

  app.get<{
    Params: { workspaceId: string };
    Querystring: { date?: string };
  }>(
    root + "/daily-plan",
    {
      schema: {
        params: workspaceParams,
        querystring: object({
          date: { type: "string", format: "date" }
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      const planDate = request.query.date ?? new Date().toISOString().slice(0, 10);
      return db.transaction(scope, async (client) => {
        const plan = await getDailyPlan(client, scope.workspaceId, scope.userId, planDate);
        return { plan };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      date?: string;
      targetHours?: number;
    };
  }>(
    root + "/daily-plan",
    {
      schema: {
        params: workspaceParams,
        body: object({
          date: { type: "string", format: "date" },
          targetHours: { type: "number", minimum: 1, maximum: 16 }
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      const planDate = request.body.date ?? new Date().toISOString().slice(0, 10);
      const targetHours = request.body.targetHours ?? 8.0;
      return db.transaction(scope, async (client) => {
        const plan = await generateDailyPlan(client, scope.workspaceId, scope.userId, planDate, targetHours);
        return { plan };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      planId: string;
      version: number;
    };
  }>(
    root + "/daily-plan/apply",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            planId: uuid,
            version: { type: "integer", minimum: 1 }
          },
          ["planId", "version"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const plan = await applyDailyPlan(client, scope.workspaceId, scope.userId, request.body.planId, request.body.version);
        return { plan };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
    Querystring: { horizon?: "day" | "week" };
  }>(
    root + "/workload-weather",
    {
      schema: {
        params: workspaceParams,
        querystring: object({
          horizon: { type: "string", enum: ["day", "week"] }
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      const horizon = request.query.horizon ?? "day";
      return db.transaction(scope, async (client) => {
        const weather = await calculateWorkloadWeather(client, scope.workspaceId, scope.userId, horizon);
        return { weather };
      });
    }
  );
}
