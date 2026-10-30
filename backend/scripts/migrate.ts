import { Pool } from "pg";
import { migrate } from "../src/platform/database/migrate.js";
import { initializeJobs } from "../src/workers/queue.js";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required.");
const pool = new Pool({ connectionString, max: 1 });
try { await migrate(pool); await initializeJobs(pool); }
finally { await pool.end(); }
