import { captureRoutes } from "./modules/capture-relationships/routes.js";
import { automationRoutes } from "./modules/automation/routes.js";
import { searchArchiveRoutes } from "./modules/search-archive/routes.js";
import { portabilityQuotaRoutes } from "./modules/portability-quotas/routes.js";
import { contextDecisionRoutes } from "./modules/context-decisions/routes.js";
import { templateRoutes } from "./modules/knowledge/template-routes.js";
import { sourceRoutes } from "./modules/knowledge/source-routes.js";
import { collaborationRoutes } from "./modules/knowledge/collaboration-routes.js";
import { collectionRoutes } from "./modules/knowledge/collection-routes.js";
import { relationRoutes } from "./modules/knowledge/relations-routes.js";
import { providerHealthRoutes } from "./modules/providers/health-routes.js";
import { notificationRoutes } from "./modules/providers/notification-routes.js";
import { Providers } from "./modules/providers/service.js";
import { providerRoutes } from "./modules/providers/routes.js";
import { schedulingRoutes } from "./modules/scheduling/routes.js";
import { recurrenceRoutes } from "./modules/scheduling/recurrence-routes.js";
import { projectRoutes } from "./modules/projects/routes.js";
import { mailActionRoutes } from "./modules/providers/mail-actions.js";
import { mailWorkflowRoutes } from "./modules/providers/mail-workflow-routes.js";
import { calendarEffectRoutes } from "./modules/providers/calendar-routes.js";
import { preferenceRoutes } from "./modules/scheduling/preferences.js";
import { coordinationRoutes } from "./modules/work-coordination/routes.js";
import { viewRoutes } from "./modules/work-coordination/views.js";
import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import Fastify, { LogController } from "fastify";
import type { FastifyInstance, RouteOptions } from "fastify";
import type { ServerConfig } from "./config/environment.js";
import type { RuntimeSettings } from "./config/runtime.js";
import { registerErrorHandlers } from "./http/errors.js";
import { healthRoutes } from "./http/routes/health.js";
import { identityRoutes } from "./modules/workspace-access/routes.js";
import { Identity } from "./modules/workspace-access/service.js";
import type { Database } from "./platform/database/database.js";
import { Queue } from "./workers/queue.js";
import { Records } from "./modules/work-management/service.js";
import { recordRoutes } from "./modules/work-management/routes.js";
import { Files } from "./modules/files/service.js";
import { fileRoutes } from "./modules/files/routes.js";
import { operationalRoutes } from "./http/routes/operations.js";

export interface AppDependencies { database: Database; settings: RuntimeSettings; providers?: Providers }

export function createApp(config: ServerConfig, dependencies?: AppDependencies, captureRoute?: (options: RouteOptions) => void): FastifyInstance {
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
  if (captureRoute) app.addHook("onRoute", captureRoute);
  app.register(helmet);
  app.register(healthRoutes);
  if (dependencies) {
    const identity = new Identity(dependencies.database, dependencies.settings);
    const queue = new Queue(dependencies.database);
    const files = new Files(dependencies.database, queue, dependencies.settings);
    app.addHook("onReady", () => queue.start());
    app.addHook("onReady", () => files.store.initialize());
    app.addHook("onClose", () => queue.stop());
    identityRoutes(app, identity);
    recordRoutes(app, identity, new Records(dependencies.database, queue));
    fileRoutes(app, identity, files);
    operationalRoutes(app, identity, queue);
    projectRoutes(app, identity);
    coordinationRoutes(app, identity, new Records(dependencies.database, queue));
    viewRoutes(app, identity);
    schedulingRoutes(app, identity);
    preferenceRoutes(app, identity);
    const providers = dependencies.providers ?? new Providers(dependencies.database, dependencies.settings);
    providerRoutes(app, identity, providers, queue);
    notificationRoutes(app, providers, queue);
    providerHealthRoutes(app, identity);
    calendarEffectRoutes(app, identity, providers, queue);
    mailWorkflowRoutes(app, identity, providers);
    mailActionRoutes(app, identity, providers, queue);
    recurrenceRoutes(app, identity, new Records(dependencies.database, queue));
    collaborationRoutes(app, identity, new Records(dependencies.database, queue));
    collectionRoutes(app, identity);
    relationRoutes(app, identity, new Records(dependencies.database, queue));
    templateRoutes(app, identity, new Records(dependencies.database, queue));
    sourceRoutes(app, identity);
    captureRoutes(app, identity);
    automationRoutes(app, identity);
    searchArchiveRoutes(app, identity);
    portabilityQuotaRoutes(app, identity);
    contextDecisionRoutes(app, identity);
    app.get("/health/ready", async (_request, reply) => {
      try {
        await dependencies.database.pool.query("SELECT 1");
        return { status: "ready" };
      } catch { return reply.code(503).send({ status: "unavailable" }); }
    });
  }

  return app;
}
