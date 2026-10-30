import { randomUUID } from "node:crypto";
import { PgBoss } from "pg-boss";
import type { Pool, PoolClient } from "pg";
import { sqlAdapter } from "../platform/database/adapter.js";
import type { Database } from "../platform/database/database.js";

export const eventQueue = "canonical-events";
export const scanQueue = "file-scans";

export async function initializeJobs(pool: Pool): Promise<void> {
  const boss = new PgBoss({ db: sqlAdapter(pool), schema: "tantu_jobs", supervise: false, schedule: false });
  boss.on("error", () => process.stderr.write("Queue initialization failed.\n"));
  try {
    await boss.start();
    await boss.createQueue("dead-letters");
    for (const name of [eventQueue, scanQueue]) await boss.createQueue(name, { retryLimit: 4, retryDelay: 5, retryBackoff: true, expireInSeconds: 60, deadLetter: "dead-letters", retentionSeconds: 604800 });
  } finally { await boss.stop(); }
}

export class Queue {
  readonly boss: PgBoss;
  constructor(readonly database: Database) {
    this.boss = new PgBoss({ db: sqlAdapter(database.pool), schema: "tantu_jobs", migrate: false, createSchema: false, supervise: false, schedule: false });
    this.boss.on("error", () => process.stderr.write("Queue operation failed.\n"));
  }
  async start(): Promise<void> { await this.boss.start(); }
  async stop(): Promise<void> { await this.boss.stop(); }

  async enqueue(client: PoolClient, queue: string, id: string, data: { workspaceId: string; userId: string; recordId: string; fileId?: string }): Promise<void> {
    await this.boss.send(queue, data, { id, db: sqlAdapter(client) });
  }

  async runOne(queue: string, effect: (client: PoolClient, data: unknown) => Promise<void>): Promise<boolean> {
    const [job] = await this.boss.fetch<unknown>(queue, { includeMetadata: true, batchSize: 1 });
    if (!job) return false;
    const token = randomUUID();
    const claim = await this.database.pool.query("INSERT INTO tantu.job_claims(id,attempt,token) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET attempt=excluded.attempt,token=excluded.token,completed=false WHERE tantu.job_claims.attempt<excluded.attempt RETURNING id", [job.id, job.retryCount, token]);
    if (claim.rowCount !== 1) return true;
    try {
      await this.database.transaction(undefined, async (client) => {
        const locked = await client.query("SELECT id FROM tantu.job_claims WHERE id=$1 AND attempt=$2 AND token=$3 AND NOT completed FOR UPDATE", [job.id, job.retryCount, token]);
        if (!locked.rowCount) return;
        const active = await client.query("SELECT id FROM tantu_jobs.job WHERE name=$1 AND id=$2 AND state='active' AND retry_count=$3 FOR UPDATE", [queue, job.id, job.retryCount]);
        if (!active.rowCount) return;
        await effect(client, job.data);
        await client.query("UPDATE tantu.job_claims SET completed=true WHERE id=$1 AND token=$2", [job.id, token]);
        await this.boss.complete(queue, job.id, null, { db: sqlAdapter(client) });
      });
    } catch {
      await this.boss.fail(queue, job.id, { code: "PROCESSING_FAILED" });
    }
    return true;
  }
}
