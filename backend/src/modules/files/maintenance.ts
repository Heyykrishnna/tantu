import { opendir, lstat } from "node:fs/promises";
import type { Pool } from "pg";
import type { FileStore } from "./store.js";

const hiddenFiles = "WITH RECURSIVE hidden AS (SELECT id FROM tantu.access_metadata WHERE deleted_at IS NOT NULL UNION SELECT child.id FROM tantu.access_metadata child JOIN hidden parent ON child.parent_id=parent.id) SELECT f.id,f.workspace_id,f.bytes FROM tantu.files f WHERE (f.state='deleted' OR f.record_id IN (SELECT id FROM hidden)) AND NOT EXISTS(SELECT 1 FROM tantu.deletions d WHERE d.file_id=f.id AND d.removed_at IS NOT NULL)";

export async function reconcileFiles(pool: Pool, store: FileStore, apply = false): Promise<{ deletionCandidates: number; orphanCandidates: number; applied: boolean }> {
  const role = await pool.query<{ privileged: boolean }>("SELECT rolsuper OR rolbypassrls AS privileged FROM pg_roles WHERE rolname=current_user");
  if (!role.rows[0]?.privileged) throw new Error("Maintenance requires an isolated operator role with cross-tenant row-security authority.");
  await store.initialize();
  const candidates = await pool.query<{ id: string; workspace_id: string; bytes: number }>(hiddenFiles + " LIMIT 100");
  if (apply) {
    for (const file of candidates.rows) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM tantu.files WHERE id=$1 FOR UPDATE", [file.id]);
        const stillDeleted = await client.query(hiddenFiles + " AND f.id=$1", [file.id]);
        if (stillDeleted.rowCount) {
          await client.query("UPDATE tantu.files SET state='deleted',version=version+1 WHERE id=$1", [file.id]);
          await client.query("INSERT INTO tantu.deletions(file_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [file.id, file.workspace_id]);
          await store.remove(file.id);
          const removed = await client.query("UPDATE tantu.deletions SET removed_at=now() WHERE file_id=$1 AND removed_at IS NULL RETURNING file_id", [file.id]);
          if (removed.rowCount) await client.query("UPDATE tantu.workspaces SET file_bytes=file_bytes-$2,file_count=file_count-1 WHERE id=$1", [file.workspace_id, file.bytes]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  }
  let orphanCandidates = 0;
  let inspected = 0;
  for await (const entry of await opendir(store.directory)) {
    const name = entry.name;
    if (!/^[a-f0-9-]{36}$/.test(name)) continue;
    if (++inspected > 20_000) throw new Error("Storage enumeration limit reached. Split maintenance batches before retrying.");
    const stat = await lstat(store.path(name));
    if (!stat.isFile() || stat.mtimeMs > Date.now() - 3_600_000) continue;
    if ((await pool.query("SELECT id FROM tantu.files WHERE id=$1", [name])).rowCount) continue;
    orphanCandidates++;
    if (apply) await store.remove(name);
  }
  return { deletionCandidates: candidates.rowCount ?? 0, orphanCandidates, applied: apply };
}
