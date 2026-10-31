import { Pool } from "pg";
import type { PoolClient, PoolConfig } from "pg";
import { databaseConfiguration } from "./connection.js";

export interface Scope {
  readonly userId: string;
  readonly workspaceId: string;
}

export class Database {
  readonly pool: Pool;

  constructor(configuration: PoolConfig) {
    this.pool = new Pool({ max: 12, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5000, statement_timeout: 10_000, ...databaseConfiguration(configuration) });
    this.pool.on("error", () => process.stderr.write("Database connection failed.\n"));
  }

  async verifyRole(): Promise<void> {
    const result = await this.pool.query<{ unsafe: boolean }>("SELECT rolsuper OR rolbypassrls OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tantu' AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS unsafe FROM pg_roles WHERE rolname=current_user");
    if (result.rows[0]?.unsafe !== false) throw new Error("Runtime database role must not be superuser, bypass row security, or inherit canonical table ownership.");
    await this.pool.query("SELECT 1 FROM tantu.records LIMIT 0");
  }

  async transaction<T>(scope: Scope | undefined, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (scope) await client.query("SELECT set_config('tantu.actor',$1,true),set_config('tantu.tenant',$2,true)", [scope.userId, scope.workspaceId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> { await this.pool.end(); }
}
