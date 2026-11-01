import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export type DecisionStatus = "draft" | "confirmed" | "superseded" | "revoked";
export type ContextEntityType = "project" | "task" | "page" | "event" | "promise" | "decision";
export type ContextRelationshipType = "informs" | "decides" | "blocks" | "references" | "derives";

export interface DecisionRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  rationale: string;
  status: DecisionStatus;
  decisionDate: string;
  supportingEvidence: Array<{ id: string; type: string; title: string }>;
  affectedWorkIds: string[];
  supersededById: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionRevisionRecord {
  id: string;
  decisionId: string;
  version: number;
  title: string;
  rationale: string;
  status: DecisionStatus;
  modifiedBy: string;
  createdAt: string;
}

export interface ContextNode {
  id: string;
  workspaceId: string;
  entityType: ContextEntityType;
  entityId: string;
  title: string;
  provenance: Record<string, unknown>;
  confirmed: boolean;
  createdAt: string;
}

export interface ContextEdge {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: ContextRelationshipType;
  provenance: Record<string, unknown>;
  confirmed: boolean;
  createdAt: string;
}

export interface ContextGraphData {
  nodes: ContextNode[];
  edges: ContextEdge[];
}

export async function createDecision(
  client: PoolClient,
  workspaceId: string,
  ownerId: string,
  input: {
    title: string;
    rationale: string;
    decisionDate?: string;
    supportingEvidence?: Array<{ id: string; type: string; title: string }>;
    affectedWorkIds?: string[];
  }
): Promise<DecisionRecord> {
  if (!input.title || input.title.trim().length === 0 || input.title.length > 200) {
    throw new Failure(400, "INVALID_INPUT", "Decision title must be between 1 and 200 characters.");
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    throw new Failure(400, "INVALID_INPUT", "Decision rationale must be provided.");
  }

  const result = await client.query(
    `INSERT INTO tantu.decisions(
      workspace_id, owner_id, title, rationale, status, decision_date,
      supporting_evidence, affected_work_ids, version
    ) VALUES($1, $2, $3, $4, 'confirmed', COALESCE($5, CURRENT_DATE), $6, $7, 1)
    RETURNING
      id, workspace_id AS "workspaceId", owner_id AS "ownerId",
      title, rationale, status, decision_date::text AS "decisionDate",
      supporting_evidence AS "supportingEvidence", affected_work_ids AS "affectedWorkIds",
      superseded_by_id AS "supersededById", version,
      created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
    [
      workspaceId,
      ownerId,
      input.title.trim(),
      input.rationale.trim(),
      input.decisionDate ?? null,
      JSON.stringify(input.supportingEvidence ?? []),
      JSON.stringify(input.affectedWorkIds ?? [])
    ]
  );

  const decision = result.rows[0] as DecisionRecord;

  await client.query(
    `INSERT INTO tantu.decision_revisions(
      decision_id, version, title, rationale, status, modified_by
    ) VALUES($1, 1, $2, $3, 'confirmed', $4)`,
    [decision.id, decision.title, decision.rationale, ownerId]
  );

  await upsertContextNode(client, workspaceId, "decision", decision.id, decision.title, { ownerId });

  return decision;
}

export async function listDecisions(
  client: PoolClient,
  workspaceId: string,
  status?: DecisionStatus
): Promise<DecisionRecord[]> {
  const query = status
    ? `SELECT id, workspace_id AS "workspaceId", owner_id AS "ownerId",
              title, rationale, status, decision_date::text AS "decisionDate",
              supporting_evidence AS "supportingEvidence", affected_work_ids AS "affectedWorkIds",
              superseded_by_id AS "supersededById", version,
              created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM tantu.decisions
       WHERE workspace_id = $1 AND status = $2
       ORDER BY decision_date DESC, created_at DESC`
    : `SELECT id, workspace_id AS "workspaceId", owner_id AS "ownerId",
              title, rationale, status, decision_date::text AS "decisionDate",
              supporting_evidence AS "supportingEvidence", affected_work_ids AS "affectedWorkIds",
              superseded_by_id AS "supersededById", version,
              created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM tantu.decisions
       WHERE workspace_id = $1
       ORDER BY decision_date DESC, created_at DESC`;

  const params = status ? [workspaceId, status] : [workspaceId];
  const result = await client.query(query, params);
  return result.rows as DecisionRecord[];
}

export async function getDecision(
  client: PoolClient,
  workspaceId: string,
  decisionId: string
): Promise<DecisionRecord | null> {
  const result = await client.query(
    `SELECT id, workspace_id AS "workspaceId", owner_id AS "ownerId",
            title, rationale, status, decision_date::text AS "decisionDate",
            supporting_evidence AS "supportingEvidence", affected_work_ids AS "affectedWorkIds",
            superseded_by_id AS "supersededById", version,
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
     FROM tantu.decisions
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, decisionId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as DecisionRecord;
}

export async function supersedeDecision(
  client: PoolClient,
  workspaceId: string,
  actorId: string,
  decisionId: string,
  input: {
    title: string;
    rationale: string;
    supportingEvidence?: Array<{ id: string; type: string; title: string }>;
    affectedWorkIds?: string[];
  }
): Promise<DecisionRecord> {
  const existing = await getDecision(client, workspaceId, decisionId);
  if (!existing) {
    throw new Failure(404, "NOT_FOUND", "Original decision not found.");
  }
  if (existing.ownerId !== actorId) throw new Failure(403, "FORBIDDEN", "Only the decision owner can supersede it.");
  if (existing.status === "superseded") {
    throw new Failure(409, "CONFLICT", "This decision is already superseded.");
  }

  const replacement = await createDecision(client, workspaceId, actorId, {
    title: input.title,
    rationale: input.rationale,
    supportingEvidence: input.supportingEvidence ?? existing.supportingEvidence,
    affectedWorkIds: input.affectedWorkIds ?? existing.affectedWorkIds
  });

  await client.query(
    `UPDATE tantu.decisions
     SET status = 'superseded', superseded_by_id = $1, version = version + 1, updated_at = now()
     WHERE workspace_id = $2 AND id = $3`,
    [replacement.id, workspaceId, decisionId]
  );

  await client.query(
    `INSERT INTO tantu.decision_revisions(
      decision_id, version, title, rationale, status, modified_by
    ) VALUES($1, $2, $3, $4, 'superseded', $5)`,
    [existing.id, existing.version + 1, existing.title, existing.rationale, actorId]
  );

  const oldNode = await upsertContextNode(client, workspaceId, "decision", existing.id, existing.title);
  const newNode = await upsertContextNode(client, workspaceId, "decision", replacement.id, replacement.title);
  await addContextEdge(client, workspaceId, newNode.id, oldNode.id, "derives", { action: "supersedes" });

  return replacement;
}

export async function getDecisionRevisions(
  client: PoolClient,
  decisionId: string
): Promise<DecisionRevisionRecord[]> {
  const result = await client.query(
    `SELECT id, decision_id AS "decisionId", version, title, rationale, status,
            modified_by AS "modifiedBy", created_at::text AS "createdAt"
     FROM tantu.decision_revisions
     WHERE decision_id = $1
     ORDER BY version DESC`,
    [decisionId]
  );
  return result.rows as DecisionRevisionRecord[];
}

export async function upsertContextNode(
  client: PoolClient,
  workspaceId: string,
  entityType: ContextEntityType,
  entityId: string,
  title: string,
  provenance: Record<string, unknown> = {},
  confirmed: boolean = true
): Promise<ContextNode> {
  const result = await client.query(
    `INSERT INTO tantu.context_nodes(
      workspace_id, entity_type, entity_id, title, provenance, confirmed
    ) VALUES($1, $2, $3, $4, $5, $6)
    ON CONFLICT (workspace_id, entity_type, entity_id)
    DO UPDATE SET title = EXCLUDED.title, provenance = EXCLUDED.provenance, confirmed = EXCLUDED.confirmed
    RETURNING
      id, workspace_id AS "workspaceId", entity_type AS "entityType",
      entity_id AS "entityId", title, provenance, confirmed,
      created_at::text AS "createdAt"`,
    [workspaceId, entityType, entityId, title, JSON.stringify(provenance), confirmed]
  );
  return result.rows[0] as ContextNode;
}

export async function addContextEdge(
  client: PoolClient,
  workspaceId: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationshipType: ContextRelationshipType,
  provenance: Record<string, unknown> = {},
  confirmed: boolean = true
): Promise<ContextEdge> {
  const result = await client.query(
    `INSERT INTO tantu.context_edges(
      workspace_id, source_node_id, target_node_id, relationship_type, provenance, confirmed
    ) VALUES($1, $2, $3, $4, $5, $6)
    ON CONFLICT (source_node_id, target_node_id, relationship_type)
    DO UPDATE SET provenance = EXCLUDED.provenance, confirmed = EXCLUDED.confirmed
    RETURNING
      id, workspace_id AS "workspaceId", source_node_id AS "sourceNodeId",
      target_node_id AS "targetNodeId", relationship_type AS "relationshipType",
      provenance, confirmed, created_at::text AS "createdAt"`,
    [workspaceId, sourceNodeId, targetNodeId, relationshipType, JSON.stringify(provenance), confirmed]
  );
  return result.rows[0] as ContextEdge;
}

export async function queryContextGraph(
  client: PoolClient,
  workspaceId: string,
  rootEntityId?: string,
  depth: number = 2
): Promise<ContextGraphData> {
  const boundedDepth = Math.min(Math.max(depth, 1), 5);

  if (!rootEntityId) {
    const nodesResult = await client.query(
      `SELECT id, workspace_id AS "workspaceId", entity_type AS "entityType",
              entity_id AS "entityId", title, provenance, confirmed,
              created_at::text AS "createdAt"
       FROM tantu.context_nodes
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId]
    );

    const edgesResult = await client.query(
      `SELECT id, workspace_id AS "workspaceId", source_node_id AS "sourceNodeId",
              target_node_id AS "targetNodeId", relationship_type AS "relationshipType",
              provenance, confirmed, created_at::text AS "createdAt"
       FROM tantu.context_edges
       WHERE workspace_id = $1
       LIMIT 200`,
      [workspaceId]
    );

    return {
      nodes: nodesResult.rows as ContextNode[],
      edges: edgesResult.rows as ContextEdge[]
    };
  }

  const nodesResult = await client.query(
    `WITH RECURSIVE graph_nodes AS (
      SELECT id, workspace_id, entity_type, entity_id, title, provenance, confirmed, created_at, 1 AS depth
      FROM tantu.context_nodes
      WHERE workspace_id = $1 AND entity_id = $2::uuid

      UNION

      SELECT n.id, n.workspace_id, n.entity_type, n.entity_id, n.title, n.provenance, n.confirmed, n.created_at, gn.depth + 1
      FROM tantu.context_nodes n
      JOIN tantu.context_edges e ON (e.target_node_id = n.id OR e.source_node_id = n.id)
      JOIN graph_nodes gn ON (gn.id = e.source_node_id OR gn.id = e.target_node_id)
      WHERE gn.depth < $3
    )
    SELECT DISTINCT id, workspace_id AS "workspaceId", entity_type AS "entityType",
                    entity_id AS "entityId", title, provenance, confirmed,
                    created_at::text AS "createdAt"
    FROM graph_nodes
    LIMIT 100`,
    [workspaceId, rootEntityId, boundedDepth]
  );

  const nodeIds = nodesResult.rows.map((n: { id: string }) => n.id);
  if (nodeIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const edgesResult = await client.query(
    `SELECT id, workspace_id AS "workspaceId", source_node_id AS "sourceNodeId",
            target_node_id AS "targetNodeId", relationship_type AS "relationshipType",
            provenance, confirmed, created_at::text AS "createdAt"
     FROM tantu.context_edges
     WHERE workspace_id = $1
       AND source_node_id = ANY($2::uuid[])
       AND target_node_id = ANY($2::uuid[])
     LIMIT 200`,
    [workspaceId, nodeIds]
  );

  return {
    nodes: nodesResult.rows as ContextNode[],
    edges: edgesResult.rows as ContextEdge[]
  };
}
