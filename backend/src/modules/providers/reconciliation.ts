import { randomUUID } from "node:crypto";
import type { Providers } from "./service.js";
import type { Queue } from "../../workers/queue.js";
import { providerQueue } from "../../workers/queue.js";
import { renewSubscriptions } from "./subscriptions.js";
export async function reconcileDue(providers: Providers, queue: Queue): Promise<number> {
  const due = await providers.database.transaction(undefined, async client => (await client.query<{ connection_id: string; workspace_id: string; user_id: string }>("SELECT * FROM tantu.claim_provider_reconciliation()")).rows);
  for (const item of due) {
    const scope = { workspaceId: item.workspace_id, userId: item.user_id };
    try {
      await providers.database.transaction(scope, async client => {
        await providers.connection(client, item.connection_id);
        for (const providerKind of ["mail", "calendar"] as const) {
          const pending = await client.query("SELECT id FROM tantu_jobs.job WHERE name=$1 AND state IN('created','active','retry') AND data->>'recordId'=$2 AND data->>'providerKind'=$3 LIMIT 1", [providerQueue, item.connection_id, providerKind]);
          if (!pending.rowCount) await queue.enqueue(client, providerQueue, randomUUID(), { ...scope, recordId: item.connection_id, providerKind });
        }
      });
      await renewSubscriptions(providers, scope, item.connection_id);
    } catch { process.stderr.write(JSON.stringify({ event: "provider_reconciliation_deferred" }) + "\n"); }
  }
  return due.length;
}
