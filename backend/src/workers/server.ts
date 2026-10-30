import { setTimeout } from "node:timers/promises";
import { readEnvironment } from "../config/environment.js";
import { readRuntimeSettings } from "../config/runtime.js";
import { Database } from "../platform/database/database.js";
import { Files } from "../modules/files/service.js";
import { Providers } from "../modules/providers/service.js";
import { processProviderSync } from "../modules/providers/routes.js";
import { executeCalendarEffect } from "../modules/providers/calendar-effects.js";
import { jobScope } from "./events.js";
import { eventQueue, effectQueue, providerQueue, scanQueue, Queue } from "./queue.js";
import { publishEvents } from "./events.js";

async function start(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const settings = readRuntimeSettings(readEnvironment());
  const database = new Database({ connectionString });
  const queue = new Queue(database);
  const providers = new Providers(database, settings);
  const files = new Files(database, queue, settings);
  let stopping = false;
  let deadline: NodeJS.Timeout | undefined;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    deadline = globalThis.setTimeout(() => { process.stderr.write("Worker shutdown deadline exceeded.\n"); process.exit(1); }, 30_000);
    deadline.unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await database.verifyRole();
    await files.store.initialize();
    await queue.start();
    while (!stopping) {
      await queue.boss.supervise();
      await queue.runOne(eventQueue, publishEvents());
      await queue.runOne(effectQueue, async (_client, data) => { const scope = jobScope(data); if (typeof data !== "object" || data === null || !("effectId" in data) || typeof data.effectId !== "string") throw new Error("Invalid provider effect job."); await executeCalendarEffect(providers, scope, data.effectId); });
      await queue.runOne(providerQueue, async (_client, data) => processProviderSync(providers, queue, data));
      await queue.runOne(scanQueue, (client, data) => files.process(client, data));
      await setTimeout(500);
    }
  } finally { await queue.stop(); await database.close(); if (deadline) clearTimeout(deadline); }
}

start().catch(() => { process.stderr.write("Worker stopped after an operational failure.\n"); process.exitCode = 1; });
