import type { Client } from "pg";
import type { PgBoss } from "pg-boss";

export async function claimAttempt(client: Client, id: string, attempt: number, token: string): Promise<boolean> {
  const result = await client.query(
    "INSERT INTO l0.job_claims(id,attempt,token) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET attempt=excluded.attempt,token=excluded.token,completed=false WHERE l0.job_claims.attempt<excluded.attempt RETURNING id",
    [id, attempt, token],
  );
  return result.rowCount === 1;
}

export async function completeAttempt(client: Client, boss: PgBoss, queue: string, id: string, attempt: number, token: string): Promise<boolean> {
  await client.query("BEGIN");
  try {
    const guarded = await client.query("UPDATE l0.job_claims SET completed=true WHERE id=$1 AND attempt=$2 AND token=$3 AND NOT completed RETURNING id", [id, attempt, token]);
    if (guarded.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    const transaction = { executeSql: async (text: string, values: unknown[] = []) => ({ rows: (await client.query<Record<string, unknown>>(text, values)).rows }) };
    await boss.complete(queue, id, null, { db: transaction });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
