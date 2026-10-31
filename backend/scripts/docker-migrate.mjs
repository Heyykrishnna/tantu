import { readFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout } from "node:timers/promises";
import { URL } from "node:url";
import { Pool } from "pg";
import { migrate } from "../dist/platform/database/migrate.js";
import { initializeJobs } from "../dist/workers/queue.js";
import { Database } from "../dist/platform/database/database.js";
import { createAccount } from "../dist/modules/workspace-access/service.js";

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;

if (!migrationUrl || !runtimeUrl) {
  process.stderr.write("MIGRATION_DATABASE_URL and DATABASE_URL are required.\n");
  process.exit(1);
}

let connected = false;
let retries = 30;
let lastError = null;

while (retries > 0 && !connected) {
  const testPool = new Pool({ connectionString: migrationUrl, connectionTimeoutMillis: 2000 });
  try {
    await testPool.query("SELECT 1");
    connected = true;
  } catch (error) {
    lastError = error;
    retries -= 1;
    await setTimeout(1000);
  } finally {
    await testPool.end();
  }
}

if (!connected) {
  process.stderr.write(`Could not connect to database: ${lastError?.message ?? "unknown error"}\n`);
  process.exit(1);
}

const migrationPool = new Pool({ connectionString: migrationUrl, max: 1 });
try {
  await migrate(migrationPool);
  await initializeJobs(migrationPool);
  const grantsSql = await readFile(new URL("../migrations/runtime-grants.sql", import.meta.url), "utf8");
  await migrationPool.query(grantsSql);
} finally {
  await migrationPool.end();
}

const bootstrapEmail = process.env.BOOTSTRAP_EMAIL;
const bootstrapName = process.env.BOOTSTRAP_NAME ?? "Admin";
const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD;

if (bootstrapEmail && bootstrapPassword) {
  const database = new Database({ connectionString: runtimeUrl });
  try {
    await database.verifyRole();
    await database.transaction(undefined, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(48721602)");
      const existing = await client.query("SELECT id FROM tantu.users LIMIT 1");
      if (!existing.rowCount) {
        await createAccount(client, bootstrapEmail, bootstrapName, bootstrapPassword);
        process.stdout.write("Initial account created.\n");
      }
    });
  } finally {
    await database.close();
  }
}

process.stdout.write("Database migration and initialization complete.\n");
