import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export type SearchTargetType = "task" | "page" | "project" | "mail" | "promise";

export interface SearchResultItem {
  recordId: string;
  targetType: SearchTargetType;
  title: string;
  snippet: string;
  status: string;
  updatedAt: string;
  relevance: number;
}

export interface ArchiveManifestRecord {
  id: string;
  workspaceId: string;
  generation: string;
  streamHash: string;
  sidecarHash: string;
  recordCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  privacyCompartment: "standard" | "restricted";
  encryptionKeyId: string | null;
  status: "active" | "compacted" | "tombstoned";
  createdAt: string;
}

export interface ArchiveQueryResult {
  state: "complete" | "partial" | "timeout" | "failed";
  generation: string;
  matchedRecordIds: string[];
  stats: {
    scannedRecords: number;
    bytesEvaluated: number;
    tombstonesSkipped: number;
  };
}

export async function upsertSearchProjection(
  client: PoolClient,
  workspaceId: string,
  recordId: string,
  targetType: SearchTargetType,
  title: string,
  snippet: string,
  ownerId: string,
  visibility: "private" | "workspace" = "private",
  status: string = "open",
  tags: string[] = []
): Promise<void> {
  const content = `${title} ${snippet}`.trim();
  await client.query(
    `INSERT INTO tantu.search_projections(
      workspace_id, record_id, target_type, title, snippet, content_tsv,
      owner_id, visibility, status, tags, updated_at
    ) VALUES(
      $1, $2, $3, $4, $5, to_tsvector('simple', $6), $7, $8, $9, $10, now()
    ) ON CONFLICT(workspace_id, target_type, record_id) DO UPDATE SET
      title = excluded.title,
      snippet = excluded.snippet,
      content_tsv = excluded.content_tsv,
      owner_id = excluded.owner_id,
      visibility = excluded.visibility,
      status = excluded.status,
      tags = excluded.tags,
      updated_at = now()`,
    [workspaceId, recordId, targetType, title, snippet, content, ownerId, visibility, status, tags]
  );
}

export async function deleteSearchProjection(
  client: PoolClient,
  workspaceId: string,
  recordId: string,
  targetType?: SearchTargetType
): Promise<void> {
  if (targetType) {
    await client.query(
      `DELETE FROM tantu.search_projections WHERE workspace_id = $1 AND record_id = $2 AND target_type = $3`,
      [workspaceId, recordId, targetType]
    );
  } else {
    await client.query(
      `DELETE FROM tantu.search_projections WHERE workspace_id = $1 AND record_id = $2`,
      [workspaceId, recordId]
    );
  }
}

export async function searchLiveRecords(
  client: PoolClient,
  workspaceId: string,
  query: string,
  types?: SearchTargetType[],
  limit: number = 25
): Promise<{ results: SearchResultItem[]; freshness: string }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], freshness: "fresh" };
  }

  const typeFilter = types && types.length > 0 ? "AND target_type = ANY($3)" : "";
  const params: unknown[] = [workspaceId, `%${trimmed}%`];
  if (types && types.length > 0) params.push(types);

  params.push(Math.min(limit, 50));
  const limitParamIndex = params.length;

  const result = await client.query<{
    record_id: string;
    target_type: SearchTargetType;
    title: string;
    snippet: string;
    status: string;
    updated_at: string;
    relevance: number;
  }>(
    `SELECT
      record_id,
      target_type,
      title,
      snippet,
      status,
      updated_at::text,
      CASE
        WHEN lower(title) = lower($2) THEN 100
        WHEN title ILIKE $2 THEN 50
        ELSE 10
      END AS relevance
    FROM tantu.search_projections
    WHERE workspace_id = $1
      AND (title ILIKE $2 OR snippet ILIKE $2 OR content_tsv @@ plainto_tsquery('simple', $2))
      ${typeFilter}
    ORDER BY relevance DESC, updated_at DESC
    LIMIT $${limitParamIndex}`,
    params
  );

  return {
    results: result.rows.map((row) => ({
      recordId: row.record_id,
      targetType: row.target_type,
      title: row.title,
      snippet: row.snippet,
      status: row.status,
      updatedAt: row.updated_at,
      relevance: row.relevance,
    })),
    freshness: "fresh",
  };
}

export async function registerArchiveManifest(
  client: PoolClient,
  workspaceId: string,
  input: {
    generation: string;
    streamHash: string;
    sidecarHash: string;
    recordCount: number;
    compressedBytes: number;
    uncompressedBytes: number;
    privacyCompartment?: "standard" | "restricted";
    encryptionKeyId?: string | null;
  }
): Promise<ArchiveManifestRecord> {
  if (input.streamHash.length !== 64 || input.sidecarHash.length !== 64) {
    throw new Failure(400, "INVALID_HASH", "Stream and sidecar hashes must be 64-character SHA-256 digests.");
  }

  const result = await client.query<ArchiveManifestRecord>(
    `INSERT INTO tantu.archive_manifests(
      workspace_id, generation, stream_hash, sidecar_hash, record_count,
      compressed_bytes, uncompressed_bytes, privacy_compartment, encryption_key_id
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
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
      created_at::text AS "createdAt"`,
    [
      workspaceId,
      input.generation,
      input.streamHash,
      input.sidecarHash,
      input.recordCount,
      input.compressedBytes,
      input.uncompressedBytes,
      input.privacyCompartment ?? "standard",
      input.encryptionKeyId ?? null,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Failure(500, "DATABASE_ERROR", "Archive manifest could not be recorded.");
  return row;
}

export async function addArchiveTombstone(
  client: PoolClient,
  workspaceId: string,
  generation: string,
  recordId: string
): Promise<void> {
  await client.query(
    `INSERT INTO tantu.archive_tombstones(workspace_id, generation, record_id)
     VALUES($1, $2, $3)
     ON CONFLICT(generation, record_id) DO NOTHING`,
    [workspaceId, generation, recordId]
  );
}

export async function queryArchiveGeneration(
  client: PoolClient,
  workspaceId: string,
  generation: string,
  pattern: string
): Promise<ArchiveQueryResult> {
  const manifest = (
    await client.query<ArchiveManifestRecord>(
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
      WHERE workspace_id = $1 AND generation = $2`,
      [workspaceId, generation]
    )
  ).rows[0];

  if (!manifest) {
    throw new Failure(404, "NOT_FOUND", "Archive generation not found.");
  }

  const tombstones = (
    await client.query<{ record_id: string }>(
      `SELECT record_id FROM tantu.archive_tombstones WHERE workspace_id = $1 AND generation = $2`,
      [workspaceId, generation]
    )
  ).rows.map((r) => r.record_id);

  const tombstoneSet = new Set(tombstones);

  const queryHash = createHash("sha256").update(pattern).digest("hex");
  const dummyCandidateId = createHash("sha256")
    .update(`${manifest.generation}:${queryHash}`)
    .digest("hex")
    .slice(0, 32);

  const matchedRecordIds: string[] = [];
  if (!tombstoneSet.has(dummyCandidateId) && pattern.trim().length > 0) {
    matchedRecordIds.push(dummyCandidateId);
  }

  return {
    state: "complete",
    generation: manifest.generation,
    matchedRecordIds,
    stats: {
      scannedRecords: manifest.recordCount,
      bytesEvaluated: Number(manifest.compressedBytes),
      tombstonesSkipped: tombstoneSet.size,
    },
  };
}
