import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import Fastify, { LogController } from "fastify";
import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "./config/environment.js";
import type { RuntimeSettings } from "./config/runtime.js";
import { registerErrorHandlers } from "./http/errors.js";
import { healthRoutes } from "./http/routes/health.js";
import { identityRoutes } from "./modules/identity/routes.js";
import { Identity } from "./modules/identity/service.js";
import type { Database } from "./platform/database/database.js";
import { Queue } from "./workers/queue.js";
import { Records } from "./modules/work/service.js";
import { recordRoutes } from "./modules/work/routes.js";

export interface AppDependencies { database: Database; settings: RuntimeSettings }

export function createApp(config: ServerConfig, dependencies?: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger:
      config.nodeEnvironment === "test"
        ? false
        : {
            level: config.logLevel,
            redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
          },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    trustProxy: false,
    bodyLimit: 1_048_576,
    requestTimeout: 10_000,
    connectionTimeout: 10_000,
    forceCloseConnections: "idle",
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
      },
    },
  });

  registerErrorHandlers(app);
  app.register(helmet);
  app.register(healthRoutes);
  if (dependencies) {
    const identity = new Identity(dependencies.database, dependencies.settings);
    const queue = new Queue(dependencies.database);
    app.addHook("onReady", () => queue.start());
    app.addHook("onClose", () => queue.stop());
    identityRoutes(app, identity);
    recordRoutes(app, identity, new Records(dependencies.database, queue));
    app.get("/health/ready", async (_request, reply) => {
      try {
        await dependencies.database.pool.query("SELECT 1");
        return { status: "ready" };
      } catch { return reply.code(503).send({ status: "unavailable" }); }
    });
  }

  return app;
}
