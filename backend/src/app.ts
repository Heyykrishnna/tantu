import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import Fastify, { LogController } from "fastify";
import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "./config/environment.js";
import { registerErrorHandlers } from "./http/errors.js";
import { healthRoutes } from "./http/routes/health.js";

export function createApp(config: ServerConfig): FastifyInstance {
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

  return app;
}
