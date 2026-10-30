import { setTimeout } from "node:timers/promises";
import { readEnvironment } from "../config/environment.js";
import { readRuntimeSettings } from "../config/runtime.js";
import { Database } from "../platform/database/database.js";
import { Files } from "../modules/files/service.js";
import { eventQueue, scanQueue, Queue } from "./queue.js";
import { publishEvents } from "./events.js";

async function start(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const settings = readRuntimeSettings(readEnvironment());
  const database = new Database({ connectionString });
  const queue = new Queue(database);
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
      await queue.runOne(scanQueue, (client, data) => files.process(client, data));
      await setTimeout(500);
    }
  } finally { await queue.stop(); await database.close(); if (deadline) clearTimeout(deadline); }
}

start().catch(() => { process.stderr.write("Worker stopped after an operational failure.\n"); process.exitCode = 1; });
