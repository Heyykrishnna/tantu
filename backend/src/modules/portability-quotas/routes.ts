import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type {
  ExportJobRecord,
  UserPreferencesInfo,
  WorkspaceQuotaInfo,
} from "./service.js";
import {
  createExportJob,
  getUserPreferences,
  getWorkspaceQuota,
  updateUserPreferences,
} from "./service.js";

const themeEnum = { enum: ["system", "light", "dark"] };
const densityEnum = { enum: ["comfortable", "compact"] };
const weekStartEnum = { enum: ["sunday", "monday"] };

export function portabilityQuotaRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{ Params: { workspaceId: string } }>(
    root + "/quotas",
    {
      schema: {
        params: workspaceParams,
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const quota: WorkspaceQuotaInfo = await getWorkspaceQuota(client, scope.workspaceId);
        return { quota };
      });
    }
  );

  app.get<{ Params: { workspaceId: string } }>(
    root + "/preferences",
    {
      schema: {
        params: workspaceParams,
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const preferences: UserPreferencesInfo = await getUserPreferences(client, scope.userId, scope.workspaceId);
        return { preferences };
      });
    }
  );

  app.patch<{
    Params: { workspaceId: string };
    Body: {
      theme?: "system" | "light" | "dark";
      density?: "comfortable" | "compact";
      timezone?: string;
      weekStart?: "sunday" | "monday";
      locale?: string;
      defaultCalendar?: string | null;
    };
  }>(
    root + "/preferences",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            theme: themeEnum,
            density: densityEnum,
            timezone: { type: "string", maxLength: 50 },
            weekStart: weekStartEnum,
            locale: { type: "string", maxLength: 10 },
            defaultCalendar: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          },
          []
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const preferences = await updateUserPreferences(
          client,
          scope.userId,
          scope.workspaceId,
          request.body
        );
        return { preferences };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: { format?: "json" | "zip" };
  }>(
    root + "/export",
    {
      schema: {
        params: workspaceParams,
        body: object({ format: { enum: ["json", "zip"] } }, []),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const job: ExportJobRecord = await createExportJob(
          client,
          scope.workspaceId,
          scope.userId,
          request.body.format ?? "json"
        );
        return { job };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; jobId: string };
  }>(
    root + "/export/:jobId",
    {
      schema: {
        params: object({ workspaceId: uuid, jobId: uuid }),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const result = await client.query<ExportJobRecord>(
          `SELECT
            id,
            workspace_id AS "workspaceId",
            user_id AS "userId",
            status,
            format,
            payload,
            bytes,
            expires_at::text AS "expiresAt",
            created_at::text AS "createdAt"
          FROM tantu.export_jobs
          WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
          [request.params.jobId, scope.workspaceId, scope.userId]
        );
        const job = result.rows[0];
        if (!job) throw new Failure(404, "NOT_FOUND", "Export job not found or expired.");
        return { job };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      version: string;
      records: { kind: "task" | "page"; title: string; status?: string }[];
    };
  }>(
    root + "/import",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            version: { type: "string" },
            records: {
              type: "array",
              items: object(
                {
                  kind: { enum: ["task", "page"] },
                  title: { ...text(200), pattern: "\\S" },
                  status: { type: "string", maxLength: 20 },
                },
                ["kind", "title"]
              ),
              maxItems: 50,
            },
          },
          ["version", "records"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const importedIds: string[] = [];
        for (const item of request.body.records) {
          const res = await client.query<{ id: string }>(
            `INSERT INTO tantu.records(
              workspace_id, owner_id, kind, visibility, title, status
            ) VALUES($1, $2, $3, 'private', $4, $5)
            RETURNING id`,
            [scope.workspaceId, scope.userId, item.kind, item.title.trim(), item.status ?? "open"]
          );
          if (res.rows[0]) importedIds.push(res.rows[0].id);
        }
        return {
          importedCount: importedIds.length,
          importedIds,
          report: "Import validated under schema v1.0. Records created in private visibility.",
        };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; provider: string };
  }>(
    root + "/providers/:provider/disconnect",
    {
      schema: {
        params: object({ workspaceId: uuid, provider: { enum: ["google", "microsoft"] } }),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        await client.query(
          `DELETE FROM tantu.provider_connections
           WHERE workspace_id = $1 AND user_id = $2 AND provider = $3`,
          [scope.workspaceId, scope.userId, request.params.provider]
        );
        await client.query(
          `DELETE FROM tantu.provider_subscriptions
           WHERE workspace_id = $1 AND user_id = $2 AND provider = $3`,
          [scope.workspaceId, scope.userId, request.params.provider]
        );
        return {
          disconnected: true,
          provider: request.params.provider,
          notice: "Remote provider connection severed. App-owned records and snapshots are preserved.",
        };
      });
    }
  );
}
