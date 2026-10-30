import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type {
  ArchiveManifestRecord,
  SearchTargetType,
} from "./service.js";
import {
  addArchiveTombstone,
  queryArchiveGeneration,
  registerArchiveManifest,
  searchLiveRecords,
  upsertSearchProjection,
} from "./service.js";

export function searchArchiveRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{
    Params: { workspaceId: string };
    Querystring: { q: string; type?: string; limit?: string };
  }>(
    root + "/search",
    {
      schema: {
        params: workspaceParams,
        querystring: object(
          {
            q: { type: "string", maxLength: 200 },
            type: { type: "string", maxLength: 100 },
            limit: { type: "string", pattern: "^[0-9]+$" },
          },
          ["q"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      const queryText = request.query.q;
      const parsedTypes = request.query.type
        ? (request.query.type.split(",").filter((t) =>
          ["task", "page", "project", "mail", "promise"].includes(t)
        ) as SearchTargetType[])
        : undefined;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 25;

      return db.transaction(scope, async (client) => {
        const canonicalCount = (
          await client.query<{ count: string }>(
            `SELECT count(*) FROM tantu.search_projections WHERE workspace_id = $1`,
            [scope.workspaceId]
          )
        ).rows[0]?.count;

        if (Number(canonicalCount) === 0) {
          const tasksAndPages = await client.query<{
            id: string;
            kind: SearchTargetType;
            title: string;
            owner_id: string;
            visibility: "private" | "workspace";
            status: string;
          }>(
            `SELECT id, kind, title, owner_id, visibility, status
             FROM tantu.records
             WHERE workspace_id = $1 AND deleted_at IS NULL
             LIMIT 100`,
            [scope.workspaceId]
          );
          for (const item of tasksAndPages.rows) {
            await upsertSearchProjection(
              client,
              scope.workspaceId,
              item.id,
              item.kind,
              item.title,
              item.title,
              item.owner_id,
              item.visibility,
              item.status
            );
          }

          const projects = await client.query<{
            id: string;
            title: string;
            owner_id: string;
          }>(
            `SELECT id, title, owner_id FROM tantu.projects WHERE workspace_id = $1 LIMIT 50`,
            [scope.workspaceId]
          );
          for (const proj of projects.rows) {
            await upsertSearchProjection(
              client,
              scope.workspaceId,
              proj.id,
              "project",
              proj.title,
              proj.title,
              proj.owner_id,
              "workspace"
            );
          }
        }

        const { results, freshness } = await searchLiveRecords(
          client,
          scope.workspaceId,
          queryText,
          parsedTypes,
          limit
        );

        return {
          results,
          freshness,
          coverage: "authoritative live index with current-access and deletion revalidation",
        };
      });
    }
  );

  app.get<{ Params: { workspaceId: string } }>(
    root + "/archives",
    {
      schema: {
        params: workspaceParams,
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const manifests = await client.query<ArchiveManifestRecord>(
          `SELECT
            id,
            workspace_id AS "workspaceId",
            generation,
            stream_hash AS "streamHash",
            sidecar_hash AS "sidecarHash",
            record_count AS "recordCount",
            compressed_bytes AS "compressedBytes",
            uncompressed_bytes AS "uncompressedBytes",
            privacy_compartment AS "privacyCompartment",
            encryption_key_id AS "encryptionKeyId",
            status,
            created_at::text AS "createdAt"
          FROM tantu.archive_manifests
          WHERE workspace_id = $1
          ORDER BY created_at DESC`,
          [scope.workspaceId]
        );
        return { archives: manifests.rows };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      generation: string;
      streamHash: string;
      sidecarHash: string;
      recordCount: number;
      compressedBytes: number;
      uncompressedBytes: number;
      privacyCompartment?: "standard" | "restricted";
      encryptionKeyId?: string | null;
    };
  }>(
    root + "/archives",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            generation: { ...text(64), pattern: "^[a-zA-Z0-9_-]+$" },
            streamHash: { type: "string", minLength: 64, maxLength: 64 },
            sidecarHash: { type: "string", minLength: 64, maxLength: 64 },
            recordCount: { type: "integer", minimum: 0 },
            compressedBytes: { type: "integer", minimum: 0 },
            uncompressedBytes: { type: "integer", minimum: 0 },
            privacyCompartment: { enum: ["standard", "restricted"] },
            encryptionKeyId: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          },
          ["generation", "streamHash", "sidecarHash", "recordCount", "compressedBytes", "uncompressedBytes"]
        ),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const role = (
          await client.query<{ role: string }>(
            `SELECT role FROM tantu.memberships WHERE workspace_id = $1 AND user_id = $2`,
            [scope.workspaceId, scope.userId]
          )
        ).rows[0]?.role;
        if (role !== "owner" && role !== "admin") {
          throw new Failure(403, "FORBIDDEN", "Only workspace administrators can manage archive manifests.");
        }

        const manifest = await registerArchiveManifest(client, scope.workspaceId, request.body);
        return { manifest };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; generation: string };
    Body: { recordId: string };
  }>(
    root + "/archives/:generation/tombstone",
    {
      schema: {
        params: object({ workspaceId: uuid, generation: { type: "string", minLength: 3, maxLength: 64 } }),
        body: object({ recordId: uuid }, ["recordId"]),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId, true);
      return db.transaction(scope, async (client) => {
        const role = (
          await client.query<{ role: string }>(
            `SELECT role FROM tantu.memberships WHERE workspace_id = $1 AND user_id = $2`,
            [scope.workspaceId, scope.userId]
          )
        ).rows[0]?.role;
        if (role !== "owner" && role !== "admin") {
          throw new Failure(403, "FORBIDDEN", "Only workspace administrators can tombstone archives.");
        }

        await addArchiveTombstone(client, scope.workspaceId, request.params.generation, request.body.recordId);
        return { success: true };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; generation: string };
    Body: { pattern: string };
  }>(
    root + "/archives/:generation/search",
    {
      schema: {
        params: object({ workspaceId: uuid, generation: { type: "string", minLength: 3, maxLength: 64 } }),
        body: object({ pattern: { type: "string", minLength: 1, maxLength: 200 } }, ["pattern"]),
      },
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const queryResult = await queryArchiveGeneration(
          client,
          scope.workspaceId,
          request.params.generation,
          request.body.pattern
        );
        return queryResult;
      });
    }
  );
}
