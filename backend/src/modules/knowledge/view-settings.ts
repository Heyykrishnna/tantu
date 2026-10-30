import type { PoolClient } from "pg";
import { object } from "../../platform/value.js";
import { properties } from "./properties.js";
import { Failure } from "../../platform/failure.js";
export async function validateViewSettings(client: PoolClient, kind: string, id: string, value: unknown): Promise<void> {
  const input = object(value); const modes = kind === "collection" ? ["table", "list"] : kind === "project" ? ["list", "board", "table", "timeline"] : ["day", "week", "month", "agenda"];
  if (!modes.includes(String(input.mode))) throw new Failure(400, "INVALID_VIEW", "This view mode is unsupported for its source.");
  const columns = Array.isArray(input.columns) ? input.columns : [];
  if (kind === "collection") { const row = (await client.query<{ properties: unknown }>("SELECT properties FROM tantu.collections WHERE record_id=$1", [id])).rows[0]; if (!row) throw new Failure(404, "NOT_FOUND", "Collection unavailable."); const schema = properties(row.properties); const keys = schema.map(property => property.id); const references = [...columns, input.propertySort, input.propertyGroup, input.propertyFilter ? object(input.propertyFilter).propertyId : undefined].filter(value => value !== undefined && value !== "" && value !== "title" && value !== "none"); if (references.some(key => typeof key !== "string" || !keys.includes(key))) throw new Failure(409, "VIEW_REPAIR_REQUIRED", "A selected property is unavailable. Repair this view before saving."); }
  else if (columns.some(column => !["title", "status", "priority", "deadline", "estimate"].includes(String(column)))) throw new Failure(400, "INVALID_VIEW", "A selected column is unsupported.");
}
