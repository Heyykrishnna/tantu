import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Pool } from "pg";

export async function migrate(pool: Pool, directory = new URL("../../../migrations/", import.meta.url)): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(48721601)");
    await client.query("CREATE TABLE IF NOT EXISTS public.tantu_migrations(name text PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    const names = (await readdir(directory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of names) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const digest = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ digest: string }>("SELECT digest FROM public.tantu_migrations WHERE name=$1", [name]);
      if (applied.rows[0]) {
        if (applied.rows[0].digest !== digest) throw new Error("Applied migration checksum changed: " + name);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO public.tantu_migrations(name,digest) VALUES($1,$2)", [name, digest]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(48721601)");
    client.release();
  }
}
