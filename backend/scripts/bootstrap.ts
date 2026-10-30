import { Database } from "../src/platform/database/database.js";
import { createAccount } from "../src/modules/workspace-access/service.js";

const connectionString = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_EMAIL;
const name = process.env.BOOTSTRAP_NAME;
const password = process.env.BOOTSTRAP_PASSWORD;
if (!connectionString || !email || !name || !password) throw new Error("DATABASE_URL, BOOTSTRAP_EMAIL, BOOTSTRAP_NAME and BOOTSTRAP_PASSWORD are required.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length > 100) throw new Error("Invalid bootstrap account fields.");
const database = new Database({ connectionString });
try {
  await database.verifyRole();
  await database.transaction(undefined, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(48721602)");
    if ((await client.query("SELECT id FROM tantu.users LIMIT 1")).rowCount) throw new Error("Bootstrap is only available for an empty installation.");
    await createAccount(client, email, name, password);
  });
  process.stdout.write("Initial account created. Sign in to create your workspace.\n");
} finally { await database.close(); }
