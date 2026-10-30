import type { Pool, PoolClient } from "pg";

export function sqlAdapter(connection: Pool | PoolClient) {
  return { executeSql: async (text: string, values: unknown[] = []) => ({ rows: (await connection.query<Record<string, unknown>>(text, values)).rows }) };
}
