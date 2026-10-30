import { isAbsolute } from "node:path";
import { Pool } from "pg";
import { FileStore } from "../src/modules/files/store.js";
import { reconcileFiles } from "../src/modules/files/maintenance.js";

const connectionString = process.env.MAINTENANCE_DATABASE_URL;
const path = process.env.FILE_STORAGE_PATH;
if (!connectionString || !path || !isAbsolute(path)) throw new Error("MAINTENANCE_DATABASE_URL and an absolute FILE_STORAGE_PATH are required.");
const pool = new Pool({ connectionString, max: 1, statement_timeout: 10_000 });
try { process.stdout.write(JSON.stringify(await reconcileFiles(pool, new FileStore(path), process.argv.includes("--apply"))) + "\n"); }
finally { await pool.end(); }
