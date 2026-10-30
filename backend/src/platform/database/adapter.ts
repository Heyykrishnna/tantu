import type { Pool, PoolClient } from "pg";

export function sqlAdapter(connection: Pool | PoolClient) {
  return { executeSql: async (text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> => {
    const result: unknown = await connection.query<Record<string, unknown>>(text, values);
    const statement: unknown = Array.isArray(result) ? result.at(-1) : result;
    if (typeof statement !== "object" || statement === null || !("rows" in statement) || !Array.isArray(statement.rows)) throw new Error("Database adapter returned an invalid statement result.");
    const rows: unknown[] = statement.rows;
    return { rows };
  } };
}
