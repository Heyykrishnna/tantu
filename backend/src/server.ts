import { createApp } from "./app.js";
import { readEnvironment } from "./config/environment.js";

async function start(): Promise<void> {
  const config = readEnvironment();
  const app = createApp(config);
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
