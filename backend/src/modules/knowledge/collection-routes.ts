import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { object, text, uuid, workspaceParams } from "../../http/schema.js";
import { Failure } from "../../platform/failure.js";
import type { Identity } from "../workspace-access/service.js";
import { change, receipt, versionConflict } from "../connected-work/change.js";
import { recordColumns } from "../work-management/contracts.js";
import type { CanonicalRecord } from "../work-management/contracts.js";
import { properties, evaluate, valueIssue } from "./properties.js";
import { object as valueObject } from "../../platform/value.js";

const params = object({ workspaceId: uuid, collectionId: uuid });
const version = { type: "integer", minimum: 1 };
const definitionsSchema = { type: "array", maxItems: 30, items: object({ id: uuid, name: text(100), type: { enum: ["text", "number", "boolean", "date", "select", "formula"] }, options: { type: "array", maxItems: 20, items: text(100), uniqueItems: true }, formula: { anyOf: [object({ operator: { enum: ["add", "subtract", "multiply", "divide"] }, left: uuid, right: uuid }), { type: "null" }] } }, ["id", "name", "type"]) };
async function editableCollection(client: PoolClient, id: string): Promise<void> {
  if (!(await client.query("SELECT record_id FROM tantu.collections WHERE record_id=$1 AND tantu.can_access(record_id,true) FOR UPDATE", [id])).rowCount) throw new Failure(404, "NOT_FOUND", "Collection is unavailable.");
}
async function fingerprint(client: PoolClient, id: string): Promise<string> { return (await client.query<{ digest: string }>("SELECT md5(coalesce(string_agg(record_id::text||':'||version::text,',' ORDER BY record_id),'')) AS digest FROM tantu.collection_items WHERE collection_id=$1", [id])).rows[0]?.digest ?? ""; }
export function collectionRoutes(app: FastifyInstance, identity: Identity): void {
  const db = identity.database; const base = "/api/v1/workspaces/:workspaceId/collections";
  app.get<{ Params: { workspaceId: string } }>(base, { schema: { params: workspaceParams } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => ({ items: (await client.query('SELECT r.id,r.title,c.version FROM tantu.records r JOIN tantu.collections c ON c.record_id=r.id ORDER BY r.id LIMIT 100')).rows }));
  });
  app.post<{ Params: { workspaceId: string }; Body: { pageId: string; operationId: string } }>(base, { schema: { params: workspaceParams, body: object({ pageId: uuid, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { command: "collection.create", ...request.body }, async (client) => {
      if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND kind='page' AND tantu.can_access(id,true) FOR UPDATE", [request.body.pageId])).rowCount) throw new Failure(404, "NOT_FOUND", "Page is unavailable.");
    }, async (client) => { await client.query("INSERT INTO tantu.collections(workspace_id,record_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [scope.workspaceId, request.body.pageId]); return receipt((await client.query('SELECT record_id AS id,version FROM tantu.collections WHERE record_id=$1', [request.body.pageId])).rows[0]); });
  });
  app.get<{ Params: { workspaceId: string; collectionId: string }; Querystring: { cursor?: string } }>(base + "/:collectionId", { schema: { params, querystring: object({ cursor: uuid }, []) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId);
    return db.transaction(scope, async (client) => {
      const collection = (await client.query<{ record_id: string; properties: unknown; version: number }>("SELECT * FROM tantu.collections WHERE record_id=$1", [request.params.collectionId])).rows[0];
      if (!collection) throw new Failure(404, "NOT_FOUND", "Collection is unavailable.");
      const schema = properties(collection.properties);
      const rows = (await client.query<CanonicalRecord & { values: unknown; itemVersion: number }>(`SELECT ${recordColumns},(SELECT values FROM tantu.collection_items WHERE collection_id=$1 AND record_id=records.id) AS values,(SELECT version FROM tantu.collection_items WHERE collection_id=$1 AND record_id=records.id) AS "itemVersion" FROM tantu.records WHERE id IN (SELECT record_id FROM tantu.collection_items WHERE collection_id=$1) AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51`, [collection.record_id, request.query.cursor ?? null])).rows;
      return { id: collection.record_id, properties: schema, version: collection.version, canEdit: (await client.query<{ allowed: boolean }>("SELECT tantu.can_access($1,true) AS allowed", [collection.record_id])).rows[0]?.allowed ?? false, items: rows.slice(0, 50).map((row) => ({ record: row, itemVersion: row.itemVersion, storedValues: row.values, ...evaluate(schema, valueObject(row.values)) })), nextCursor: rows.length > 50 ? rows[49]?.id : null, coverage: "current-access-only" };
    });
  });
  app.post<{ Params: { workspaceId: string; collectionId: string }; Body: { properties: unknown; expectedVersion: number } }>(base + "/:collectionId/schema/review", { schema: { params, body: object({ properties: definitionsSchema, expectedVersion: version }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true); const schema = properties(request.body.properties);
    return db.transaction(scope, async (client) => {
      await editableCollection(client, request.params.collectionId);
      const current = (await client.query<{ properties: unknown; version: number }>("SELECT properties,version FROM tantu.collections WHERE record_id=$1", [request.params.collectionId])).rows[0];
      if (!current || current.version !== request.body.expectedVersion) versionConflict();
      const before = properties(current.properties); const removed = before.filter((property) => !schema.some((next) => next.id === property.id)).map((property) => property.id);
      const rows = (await client.query<{ values: unknown }>("SELECT values FROM tantu.collection_items WHERE collection_id=$1 LIMIT 1001", [request.params.collectionId])).rows;
      const affected = rows.filter((row) => evaluate(schema, valueObject(row.values)).repairs.length > 0).length;
      await client.query("DELETE FROM tantu.schema_reviews WHERE expires_at<now()");
      if (Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.schema_reviews")).rows[0]?.count) >= 100) throw new Failure(429, "REVIEW_LIMIT", "Finish an existing schema review or wait for it to expire.");
      const result = (await client.query<{ id: string }>("INSERT INTO tantu.schema_reviews(workspace_id,collection_id,user_id,properties,expected_version,item_fingerprint) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [scope.workspaceId, request.params.collectionId, scope.userId, JSON.stringify(schema), current.version, await fingerprint(client, request.params.collectionId)])).rows[0];
      if (!result) throw new Error("Schema review was not created.");
      return { id: result.id, removed, affectedVisibleRows: affected, coverage: "current-access-only; up to 1001 rows inspected", repair: "Stored values for removed or incompatible properties are retained and marked for repair.", properties: schema };
    });
  });
  app.post<{ Params: { workspaceId: string; collectionId: string }; Body: { reviewId: string; operationId: string } }>(base + "/:collectionId/schema/apply", { schema: { params, body: object({ reviewId: uuid, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { command: "collection.schema", ...request.params, ...request.body }, (client) => editableCollection(client, request.params.collectionId), async (client) => {
      const review = (await client.query<{ properties: unknown; expected_version: number; item_fingerprint: string }>("SELECT properties,expected_version,item_fingerprint FROM tantu.schema_reviews WHERE id=$1 AND collection_id=$2 AND expires_at>now()", [request.body.reviewId, request.params.collectionId])).rows[0];
      if (!review) throw new Failure(409, "REVIEW_EXPIRED", "Review the schema changes again.");
      if (review.item_fingerprint !== await fingerprint(client, request.params.collectionId)) versionConflict();
      const row = (await client.query("UPDATE tantu.collections SET properties=$2,version=version+1 WHERE record_id=$1 AND version=$3 RETURNING record_id AS id,version", [request.params.collectionId, JSON.stringify(properties(review.properties)), review.expected_version])).rows[0];
      if (!row) versionConflict(); return receipt(row);
    });
  });
  app.post<{ Params: { workspaceId: string; collectionId: string }; Body: { recordId: string; values: Record<string, unknown>; expectedVersion: number; schemaVersion: number; operationId: string } }>(base + "/:collectionId/items", { schema: { params, body: object({ recordId: uuid, values: { type: "object", maxProperties: 30, additionalProperties: true }, expectedVersion: { type: "integer", minimum: 0 }, schemaVersion: version, operationId: uuid }) } }, async (request) => {
    const scope = await identity.scope(request, request.params.workspaceId, true);
    return change(db, scope, request.body.operationId, { command: "collection.item", ...request.params, ...request.body }, async (client) => { await editableCollection(client, request.params.collectionId); if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND tantu.can_access(id,true) FOR UPDATE", [request.body.recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Source record is unavailable."); }, async (client) => {
      const collection = (await client.query<{ properties: unknown; version: number }>("SELECT properties,version FROM tantu.collections WHERE record_id=$1", [request.params.collectionId])).rows[0]; if (!collection || collection.version !== request.body.schemaVersion) versionConflict();
      const schema = properties(collection.properties);
      for (const [id, value] of Object.entries(request.body.values)) { const property = schema.find((property) => property.id === id); if (!property || valueIssue(property, value)) throw new Failure(400, "INVALID_PROPERTY", property ? valueIssue(property, value) ?? "Invalid value." : "This property is no longer in the collection schema."); }
      const current = (await client.query<{ version: number }>("SELECT version FROM tantu.collection_items WHERE collection_id=$1 AND record_id=$2 FOR UPDATE", [request.params.collectionId, request.body.recordId])).rows[0];
      if ((current?.version ?? 0) !== request.body.expectedVersion) versionConflict();
      if (!current && Number((await client.query<{ count: string }>("SELECT count(*) FROM tantu.collection_items WHERE collection_id=$1", [request.params.collectionId])).rows[0]?.count) >= 1000) throw new Failure(409, "QUOTA_EXCEEDED", "Collection row limit reached.");
      const row = (await client.query("INSERT INTO tantu.collection_items(workspace_id,collection_id,record_id,values) VALUES($1,$2,$3,$4) ON CONFLICT(collection_id,record_id) DO UPDATE SET values=excluded.values,version=tantu.collection_items.version+1 RETURNING record_id AS id,version", [scope.workspaceId, request.params.collectionId, request.body.recordId, JSON.stringify(request.body.values)])).rows[0]; return receipt(row);
    });
  });
}
