import type { FastifyInstance } from "fastify";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import type { ContextEntityType, ContextRelationshipType, DecisionStatus } from "./service.js";
import {
  addContextEdge,
  createDecision,
  getDecision,
  getDecisionRevisions,
  listDecisions,
  queryContextGraph,
  supersedeDecision,
  upsertContextNode
} from "./service.js";

export function contextDecisionRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database;
  const root = "/api/v1/workspaces/:workspaceId";

  app.get<{
    Params: { workspaceId: string };
    Querystring: { status?: DecisionStatus };
  }>(
    root + "/decisions",
    {
      schema: {
        params: workspaceParams,
        querystring: object({
          status: { type: "string", enum: ["draft", "confirmed", "superseded", "revoked"] }
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const decisions = await listDecisions(client, scope.workspaceId, request.query.status);
        return { decisions };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      title: string;
      rationale: string;
      decisionDate?: string;
      supportingEvidence?: Array<{ id: string; type: string; title: string }>;
      affectedWorkIds?: string[];
    };
  }>(
    root + "/decisions",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            title: text(200),
            rationale: { type: "string", minLength: 1 },
            decisionDate: { type: "string", format: "date" },
            supportingEvidence: { type: "array" },
            affectedWorkIds: { type: "array", items: { type: "string", format: "uuid" } }
          },
          ["title", "rationale"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const decision = await createDecision(client, scope.workspaceId, scope.userId, request.body);
        return { decision };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; decisionId: string };
  }>(
    root + "/decisions/:decisionId",
    {
      schema: {
        params: object({
          workspaceId: uuid,
          decisionId: uuid
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const decision = await getDecision(client, scope.workspaceId, request.params.decisionId);
        if (!decision) {
          throw new Failure(404, "NOT_FOUND", "Decision not found.");
        }
        return { decision };
      });
    }
  );

  app.post<{
    Params: { workspaceId: string; decisionId: string };
    Body: {
      title: string;
      rationale: string;
      supportingEvidence?: Array<{ id: string; type: string; title: string }>;
      affectedWorkIds?: string[];
    };
  }>(
    root + "/decisions/:decisionId/supersede",
    {
      schema: {
        params: object({
          workspaceId: uuid,
          decisionId: uuid
        }),
        body: object(
          {
            title: text(200),
            rationale: { type: "string", minLength: 1 },
            supportingEvidence: { type: "array" },
            affectedWorkIds: { type: "array", items: { type: "string", format: "uuid" } }
          },
          ["title", "rationale"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const decision = await supersedeDecision(
          client,
          scope.workspaceId,
          scope.userId,
          request.params.decisionId,
          request.body
        );
        return { decision };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string; decisionId: string };
  }>(
    root + "/decisions/:decisionId/revisions",
    {
      schema: {
        params: object({
          workspaceId: uuid,
          decisionId: uuid
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const revisions = await getDecisionRevisions(client, request.params.decisionId);
        return { revisions };
      });
    }
  );

  app.get<{
    Params: { workspaceId: string };
    Querystring: { rootEntityId?: string; depth?: string };
  }>(
    root + "/context-graph",
    {
      schema: {
        params: workspaceParams,
        querystring: object({
          rootEntityId: { type: "string", format: "uuid" },
          depth: { type: "string", pattern: "^[0-9]+$" }
        })
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      const depth = request.query.depth ? parseInt(request.query.depth, 10) : 2;
      return db.transaction(scope, async (client) => {
        const graph = await queryContextGraph(client, scope.workspaceId, request.query.rootEntityId, depth);
        return graph;
      });
    }
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      source: { entityType: ContextEntityType; entityId: string; title: string };
      target: { entityType: ContextEntityType; entityId: string; title: string };
      relationshipType: ContextRelationshipType;
      provenance?: Record<string, unknown>;
    };
  }>(
    root + "/context-graph/edges",
    {
      schema: {
        params: workspaceParams,
        body: object(
          {
            source: object(
              {
                entityType: { type: "string", enum: ["project", "task", "page", "event", "promise", "decision"] },
                entityId: uuid,
                title: text(200)
              },
              ["entityType", "entityId", "title"]
            ),
            target: object(
              {
                entityType: { type: "string", enum: ["project", "task", "page", "event", "promise", "decision"] },
                entityId: uuid,
                title: text(200)
              },
              ["entityType", "entityId", "title"]
            ),
            relationshipType: {
              type: "string",
              enum: ["informs", "decides", "blocks", "references", "derives"]
            },
            provenance: { type: "object" }
          },
          ["source", "target", "relationshipType"]
        )
      }
    },
    async (request) => {
      const scope = await identity.scope(request, request.params.workspaceId);
      return db.transaction(scope, async (client) => {
        const sourceNode = await upsertContextNode(
          client,
          scope.workspaceId,
          request.body.source.entityType,
          request.body.source.entityId,
          request.body.source.title
        );
        const targetNode = await upsertContextNode(
          client,
          scope.workspaceId,
          request.body.target.entityType,
          request.body.target.entityId,
          request.body.target.title
        );
        const edge = await addContextEdge(
          client,
          scope.workspaceId,
          sourceNode.id,
          targetNode.id,
          request.body.relationshipType,
          request.body.provenance ?? {}
        );
        return { edge };
      });
    }
  );
}
