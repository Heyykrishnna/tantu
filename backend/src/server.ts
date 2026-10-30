import { createApp } from "./app.js";
import { readEnvironment } from "./config/environment.js";
import { readRuntimeSettings } from "./config/runtime.js";
import { Database } from "./platform/database/database.js";

async function start(): Promise<void> {
  const config = readEnvironment();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to run the application.");
  const settings = readRuntimeSettings(config);
  const database = new Database({ connectionString });
  try { await database.verifyRole(); }
  catch (error) { await database.close(); throw error; }
  const app = createApp(config, { database, settings });
  app.addHook("onClose", () => database.close());
  let closing = false;

  async function shutdown(): Promise<void> {
    if (closing) {
      return;
    }

    closing = true;
    const deadline = setTimeout(() => {
      app.log.error({ event: "shutdown_deadline_exceeded" });
      process.exit(1);
    }, 10_000);
    deadline.unref();

    try {
      await app.close();
    } catch {
      app.log.error({ event: "shutdown_failed" });
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch {
    await shutdown();
    throw new Error("Backend could not listen on the configured address.");
  }
}

start().catch(() => {
  process.stderr.write("Backend startup failed. Verify configuration and port availability.\n");
  process.exitCode = 1;
});
