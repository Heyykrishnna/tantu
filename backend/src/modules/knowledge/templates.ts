import type { PoolClient } from "pg";
import { digest } from "../workspace-access/credentials.js";
import { recordColumns } from "../work-management/contracts.js";
import type { CanonicalRecord } from "../work-management/contracts.js";
import { Failure } from "../../platform/failure.js";
import { object } from "../../platform/value.js";
import { properties, evaluate } from "./properties.js";
export async function templateSource(client: PoolClient, id: string, includeRows: boolean) {
  const collection = (await client.query<{ properties: unknown; version: number }>("SELECT properties,version FROM tantu.collections WHERE record_id=$1 FOR SHARE", [id])).rows[0];
  const record = (await client.query<CanonicalRecord>(`SELECT ${recordColumns} FROM tantu.records WHERE id=$1 AND kind='page' FOR SHARE`, [id])).rows[0]; if (!record || !collection) throw new Failure(404, "SOURCE_UNAVAILABLE", "The template source is unavailable.");
  const schema = properties(collection.properties); const rows = includeRows ? (await client.query<CanonicalRecord & { values: unknown; itemVersion: number }>(`SELECT ${recordColumns},(SELECT values FROM tantu.collection_items WHERE collection_id=$1 AND record_id=records.id) AS values,(SELECT version FROM tantu.collection_items WHERE collection_id=$1 AND record_id=records.id) AS "itemVersion" FROM tantu.records WHERE id IN(SELECT record_id FROM tantu.collection_items WHERE collection_id=$1) ORDER BY id LIMIT 11 FOR SHARE`, [id])).rows : [];
  if (rows.length > 10) throw new Failure(409, "TEMPLATE_ROW_LIMIT", "Row templates support at most ten currently visible source records. Save a schema-only template for larger collections.");
  const items = rows.map(row => { const result = evaluate(schema, object(row.values)); if (result.repairs.length) throw new Failure(409, "TEMPLATE_REPAIR_REQUIRED", "Repair source row values before creating a reusable template."); const values = Object.fromEntries(schema.filter(property => property.type !== "formula" && row.values !== null).map(property => [property.id, result.values[property.id] ?? null])); return { record: row, values, itemVersion: row.itemVersion }; });
  return { record, properties: schema, items, fingerprint: digest(JSON.stringify({ record, collection, items })) };
}
